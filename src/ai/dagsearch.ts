import type { Placement } from './types.ts';
import type { MinoType } from '../types.ts';
import type { BitBoard } from './bitboard.ts';
import { generatePlacements } from './movegen.ts';
import { simulateLock, simulateHold, getPieceCells, spawnX, spawnY } from './pure.ts';
import type { LockResult } from './pure.ts';
import { heuristicOf, rewardOf } from './evaluate.ts';
import { BOARD_WIDTH } from '../constants.ts';

/**
 * cold-clear-2 方式の DAG 探索。
 *
 * - ノード = ゲーム状態（盤面・バッグ・ホールド・コンボ・B2B）
 * - 同一状態はレイヤー（手数）ごとに重複排除して共有する DAG
 * - best-first: 現在最も有望な未展開ノードから順に展開
 * - backprop: node.eval = max(子の cachedEval)、child.cachedEval = child.eval + reward(move)
 *   を親方向へ伝播する
 * - 根の最善手 = cachedEval 最大の子
 */

const PIECE_INDEX: Record<MinoType, number> = { I: 0, J: 1, L: 2, O: 3, S: 4, T: 5, Z: 6 };

export interface DagSearchOptions {
  /** 先読みするピース数 */
  depth: number;
  /** 最大ノード数 */
  nodeBudget: number;
  /** 探索時間上限 (ms) */
  timeLimitMs: number;
  /** 消去を伴わない穴増加手を禁止する */
  pruneHoles: boolean;
}

export interface DagSearchResult {
  /** 各手。mv.piece が current と異なる場合はホールドしてから置く */
  placements: Placement[];
  /** 計画全体で得られる攻撃 */
  attack: number;
  /** 計画適用後までの盤面ハッシュ列（長さ = placements.length + 1） */
  boardHashes: string[];
  /** 生成ノード数 */
  nodes: number;
}

/** 探索内部用の軽量状態（placement 配列を持たない） */
interface SimState {
  board: BitBoard;
  current: MinoType;
  bag: MinoType[];
  hold: MinoType | null;
  canHold: boolean;
  comboCount: number;
  difficultClearCount: number;
  accumulatedAttack: number;
}

interface DagEdge {
  mv: Placement;
  reward: number;
  attack: number;
  cachedEval: number;
  node: DagNode;
}

interface DagNode {
  state: SimState;
  depth: number;
  parents: DagNode[] | null;
  children: DagEdge[] | null;
  /** バックアップ済み評価値（フロンティアはヒューリスティック値） */
  eval: number;
  expanded: boolean;
  dead: boolean;
}

class MaxHeap {
  private items: DagNode[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: DagNode): void {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].eval >= this.items[i].eval) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): DagNode | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.items[l].eval > this.items[m].eval) m = l;
        if (r < this.items.length && this.items[r].eval > this.items[m].eval) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const t = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = t;
  }
}

function bagCode(bag: MinoType[]): number {
  let c = 0;
  for (let i = 0; i < bag.length; i++) c = c * 7 + PIECE_INDEX[bag[i]];
  return c;
}

function nodeKey(s: SimState): string {
  return `${s.board.hash()}|${s.current}|${bagCode(s.bag)}|${s.hold}|${s.canHold ? 1 : 0}|${s.comboCount}|${s.difficultClearCount}`;
}

function columnHoles(board: BitBoard): number[] {
  const cols: number[] = new Array(BOARD_WIDTH).fill(0);
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const lo = board.words[x * 2];
    const hi = board.words[x * 2 + 1];
    if (lo === 0 && hi === 0) continue;
    let topY: number;
    if (lo !== 0) topY = 31 - Math.clz32(lo & -lo);
    else topY = 32 + (31 - Math.clz32(hi & -hi));
    let filledBelow: number;
    if (topY >= 32) {
      filledBelow = popcount32(hi >>> (topY - 32 + 1));
    } else {
      filledBelow = popcount32(hi) + (topY < 31 ? popcount32(lo >>> (topY + 1)) : 0);
    }
    cols[x] = Math.max(0, 40 - topY - 1 - filledBelow);
  }
  return cols;
}

function totalHoles(cols: number[]): number {
  let t = 0;
  for (let x = 0; x < cols.length; x++) t += cols[x];
  return t;
}

export function dagSearch(
  rootBoard: BitBoard,
  rootCurrent: MinoType,
  rootBag: MinoType[],
  rootHold: MinoType | null,
  rootCanHold: boolean,
  rootCombo: number,
  rootB2B: number,
  options: DagSearchOptions,
): DagSearchResult {
  const startTime = Date.now();
  const deadline = startTime + options.timeLimitMs;

  const rootState: SimState = {
    board: rootBoard,
    current: rootCurrent,
    bag: rootBag,
    hold: rootHold,
    canHold: rootCanHold,
    comboCount: rootCombo,
    difficultClearCount: rootB2B,
    accumulatedAttack: 0,
  };

  // レイヤーごとの重複排除マップ
  const layers: Map<string, DagNode>[] = [];
  for (let d = 0; d <= options.depth; d++) layers.push(new Map());

  const rootNode: DagNode = {
    state: rootState,
    depth: 0,
    parents: null,
    children: null,
    eval: heuristicOf(rootBoard, rootB2B),
    expanded: false,
    dead: false,
  };
  layers[0].set(nodeKey(rootState), rootNode);

  const heap = new MaxHeap();
  heap.push(rootNode);
  let nodeCount = 1;

  while (heap.size > 0 && nodeCount < options.nodeBudget) {
    if ((nodeCount & 15) === 0 && Date.now() > deadline) break;

    const node = heap.pop()!;
    if (node.expanded || node.dead) continue;
    if (node.depth >= options.depth) continue;

    const gained = expandNode(node);
    node.expanded = true;

    if (!gained) {
      node.dead = true;
      node.eval = -1e9;
      backpropFrom(node);
      continue;
    }

    // 展開結果で評価を更新し親へ伝播する
    let best = -Infinity;
    for (const c of node.children!) {
      if (c.cachedEval > best) best = c.cachedEval;
    }
    if (best > node.eval) {
      node.eval = best;
      backpropFrom(node);
    }

    for (const c of node.children!) {
      if (!c.node.expanded && !c.node.dead && c.node.depth < options.depth) {
        heap.push(c.node);
      }
    }
  }

  // 根の最善手から計画を復元
  const placements: Placement[] = [];
  const boardHashes: string[] = [rootBoard.hash()];
  let attack = 0;
  let cur = rootNode;
  while (cur.children !== null && cur.children.length > 0) {
    let best = cur.children[0];
    for (const c of cur.children) {
      if (c.cachedEval > best.cachedEval) best = c;
    }
    placements.push(best.mv);
    attack += best.attack;
    boardHashes.push(best.node.state.board.hash());
    cur = best.node;
    if (placements.length >= options.depth) break;
  }

  return { placements, attack, boardHashes, nodes: nodeCount };

  // ---- 内部関数 ----

  function makeChildNode(
    layer: Map<string, DagNode>,
    key: string,
    st: SimState,
    depth: number,
  ): DagNode {
    let n = layer.get(key);
    if (!n) {
      n = {
        state: st,
        depth,
        parents: [],
        children: null,
        eval: heuristicOf(st.board, st.difficultClearCount),
        expanded: false,
        dead: false,
      };
      layer.set(key, n);
      nodeCount++;
    }
    return n;
  }

  function expandNode(node: DagNode): boolean {
    const state = node.state;
    const nextLayer = layers[node.depth + 1];
    const children: DagEdge[] = [];
    let anyChild = false;

    const parentHolesTotal = options.pruneHoles
      ? totalHoles(columnHoles(state.board))
      : -1;

    const processMoves = (s: SimState): void => {
      const moves = generatePlacements(s.board, s.current);
      for (const mv of moves) {
        const outcome = advanceWithPlacement(s, mv);
        if (!outcome) continue;

        // 消去なしで穴が増える手は生成しない（緩い制約: +2 までは許容）
        if (options.pruneHoles && outcome.result.cleared === 0) {
          const nh = totalHoles(columnHoles(outcome.state.board));
          if (nh > parentHolesTotal + 2) continue;
        }

        const reward = rewardOf(mv.piece, outcome.result, outcome.result.totalAttack);
        const key = nodeKey(outcome.state);
        const childNode = makeChildNode(nextLayer, key, outcome.state, node.depth + 1);
        childNode.parents!.push(node);
        children.push({
          mv,
          reward,
          attack: outcome.result.totalAttack,
          cachedEval: childNode.eval + reward,
          node: childNode,
        });
        anyChild = true;
      }
    };

    processMoves(state);

    if (state.canHold && (state.hold !== null || state.bag.length > 0)) {
      const held = simulateHold(state.current, state.hold, state.bag);
      processMoves({
        board: state.board,
        current: held.newCurrent,
        bag: held.newBag,
        hold: held.newHold,
        canHold: false,
        comboCount: state.comboCount,
        difficultClearCount: state.difficultClearCount,
        accumulatedAttack: state.accumulatedAttack,
      });
    }

    node.children = children;
    return anyChild;
  }

  function advanceWithPlacement(
    state: SimState,
    mv: Placement,
  ): { state: SimState; result: LockResult } | null {
    const { result, nextBoard } = simulateLock(
      state.board,
      mv,
      state.comboCount,
      state.difficultClearCount,
      1,
    );

    const nextBag = state.bag.slice();
    const nextCurrent = nextBag.shift();
    if (!nextCurrent) return null;

    const nextCells = getPieceCells(nextCurrent, 0);
    if (nextBoard.collidesCells(nextCells, spawnX(nextCurrent), spawnY(nextCurrent, 0))) {
      return null; // game over
    }

    return {
      result,
      state: {
        board: nextBoard,
        current: nextCurrent,
        bag: nextBag,
        hold: state.hold,
        canHold: true,
        comboCount: result.newComboCount,
        difficultClearCount: result.newDifficultClearCount,
        accumulatedAttack: state.accumulatedAttack + result.totalAttack,
      },
    };
  }

  /** ノードの評価が変化したとき親へ伝播する */
  function backpropFrom(start: DagNode): void {
    let frontier: DagNode[] = [start];
    while (frontier.length > 0) {
      const nextFrontier: DagNode[] = [];
      const processed = new Set<DagNode>();
      for (const changed of frontier) {
        if (changed.parents === null) continue;
        for (const parent of changed.parents) {
          if (processed.has(parent)) continue;
          processed.add(parent);
          if (parent.children === null) continue;

          for (const c of parent.children) {
            if (c.node === changed) {
              c.cachedEval = changed.eval + c.reward;
            }
          }

          let best = -Infinity;
          for (const c of parent.children) {
            if (c.cachedEval > best) best = c.cachedEval;
          }
          if (best > parent.eval + 1e-9) {
            parent.eval = best;
            if (parent.parents !== null && parent.parents.length > 0) {
              nextFrontier.push(parent);
            }
          }
        }
      }
      frontier = nextFrontier;
    }
  }
}

function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}
