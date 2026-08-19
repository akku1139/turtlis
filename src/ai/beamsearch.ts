import type { SearchState, Placement } from './types.ts';
import { generatePlacements as rawGeneratePlacements } from './movegen.ts';
import { simulateLock, simulateHold } from './pure.ts';
import { evaluateState as rawEvaluateState, countHoles } from './evaluate.ts';
import { getMatrix, spawnX, spawnY } from './pure.ts';
import type { BitBoard } from './bitboard.ts';
import type { MinoType } from '../types.ts';

const MAX_CACHE_ENTRIES = 20000;

const placementCache = new Map<string, Placement[]>();

function generatePlacements(board: BitBoard, piece: MinoType): Placement[] {
  const key = `${board.hash().toString()}|${piece}`;
  const cached = placementCache.get(key);
  if (cached) return cached;

  const placements = rawGeneratePlacements(board, piece);
  placementCache.set(key, placements);

  if (placementCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = placementCache.keys().next().value;
    if (firstKey !== undefined) placementCache.delete(firstKey);
  }

  return placements;
}

const evalCache = new Map<string, number>();

function evaluateState(state: SearchState): number {
  const key = [
    state.board.hash().toString(),
    state.current,
    state.bag.join(','),
    state.hold,
    state.comboCount,
    state.difficultClearCount,
    state.accumulatedAttack,
    state.placements.length, // attackEfficiency で使用するため必要
    state.lastSpinAction,
    state.lastCleared,
  ].join('|');

  const cached = evalCache.get(key);
  if (cached !== undefined) return cached;

  const value = rawEvaluateState(state);
  evalCache.set(key, value);

  if (evalCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = evalCache.keys().next().value;
    if (firstKey !== undefined) evalCache.delete(firstKey);
  }

  return value;
}

function isGoalAllClear(state: SearchState): boolean {
  // シミュレーション上、All Clear 後は difficultClearCount が必ず 2 以上になる
  return state.board.isEmpty() && state.lastCleared > 0 && state.difficultClearCount > 1;
}

export function beamSearch(
  root: SearchState,
  beamWidth: number = 50,
  maxDepth?: number,
  onProgress?: (info: {
    depth: number;
    totalDepth: number;
    candidates: number;
    bestState: SearchState;
  }) => void,
  warmStartPlacements?: Placement[],
  timeLimitMs?: number,
  planBoardHashes?: string[],
): SearchState {
  const depth = Math.min(maxDepth ?? root.bag.length + 1, root.bag.length + 1);
  let beam: SearchState[] = [root];
  let startDepth = 0;
  const searchStart = Date.now();
  const initialHoles = countHoles(root.board);

  if (warmStartPlacements && warmStartPlacements.length > 0) {
    const { state, appliedCount } = applyWarmStart(root, warmStartPlacements);
    if (appliedCount > 0) {
      beam = [state];
      startDepth = Math.min(appliedCount, depth);
    }
  }

  for (let d = startDepth; d < depth; d++) {
    const candidates: SearchState[] = [];

    for (const state of beam) {
      // 現在ミノをそのまま配置
      const placements = generatePlacements(state.board, state.current);
      for (const p of placements) {
        const nextState = advanceState(state, p);
        if (nextState) candidates.push(nextState);
      }

      // ホールドしてから配置
      if (state.canHold && (state.hold !== null || state.bag.length > 0)) {
        const held = simulateHold(state.current, state.hold, state.bag);
        const heldState: SearchState = {
          board: state.board.clone(),
          current: held.newCurrent,
          bag: held.newBag,
          hold: held.newHold,
          canHold: false,
          comboCount: state.comboCount,
          difficultClearCount: state.difficultClearCount,
          accumulatedAttack: state.accumulatedAttack,
          accumulatedScore: state.accumulatedScore,
          placements: state.placements,
          lastSpinAction: state.lastSpinAction,
          lastCleared: state.lastCleared,
        };

        const heldPlacements = generatePlacements(heldState.board, heldState.current);
        for (const p of heldPlacements) {
          const nextState = advanceState(heldState, p);
          if (nextState) candidates.push(nextState);
        }
      }
    }

    if (candidates.length === 0) break;

    // ★ All Clear を発見したら即座に最良候補を返す
    let bestGoal: SearchState | null = null;
    for (const c of candidates) {
      if (isGoalAllClear(c)) {
        if (!bestGoal || c.accumulatedAttack > bestGoal.accumulatedAttack) {
          bestGoal = c;
        }
      }
    }
    if (bestGoal) return bestGoal;

    // 物理状態キーによる重複除去
    // 盤面 + 現在ミノ + バッグ + ホールド + コンボ + B2B が同じなら
    // accumulatedAttack が最大のものだけを残す
    const seen = new Map<string, SearchState>();
    for (const c of candidates) {
      const key = physicalKey(c);
      const old = seen.get(key);
      if (
        !old ||
        c.accumulatedAttack > old.accumulatedAttack ||
        (c.accumulatedAttack === old.accumulatedAttack &&
          c.accumulatedScore > old.accumulatedScore)
      ) {
        seen.set(key, c);
      }
    }
    let unique = Array.from(seen.values());

    // 前回計画との一致ボーナス
    const planBonus = (s: SearchState): number => {
      if (planBoardHashes && s.depth !== undefined && s.depth < planBoardHashes.length) {
        return s.board.hash().toString() === planBoardHashes[s.depth] ? 6.0 : 0.0;
      }
      return 0.0;
    };

    // 穴の減少ボーナス
    const scored = unique.map((s) => {
      const holesNow = countHoles(s.board);
      const holeBonus = (initialHoles - holesNow) * 5.0;
      return {
        s,
        score: evaluateState(s) + planBonus(s) + holeBonus,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    for (let i = 0; i < scored.length; i++) {
      unique[i] = scored[i].s;
    }

    // ビーム幅を超えた分を削減
    beam = unique.slice(0, beamWidth);

    if (timeLimitMs && Date.now() - searchStart > timeLimitMs) {
      break;
    }

    if (onProgress) {
      onProgress({
        depth: d + 1,
        totalDepth: depth,
        candidates: unique.length,
        bestState: beam[0],
      });
    }
  }

  if (beam.length === 0) return root;

  beam.sort((a, b) => oneStepLookahead(b) - oneStepLookahead(a));
  return beam[0];
}

function advanceState(state: SearchState, p: Placement): SearchState | null {
  const { result, nextBoard } = simulateLock(
    state.board,
    p,
    state.comboCount,
    state.difficultClearCount,
    1,
  );

  const nextBag = state.bag.slice();
  const nextCurrent = nextBag.shift();
  if (!nextCurrent) return null;

  const nextMatrix = getMatrix(nextCurrent, 0);
  const nextSpawnX = spawnX(nextCurrent);
  const nextSpawnY = spawnY(nextCurrent, 0);
  if (nextBoard.collides(nextMatrix, nextSpawnX, nextSpawnY)) {
    return null;
  }

  return {
    board: nextBoard,
    current: nextCurrent,
    bag: nextBag,
    hold: state.hold,
    canHold: true,
    comboCount: result.newComboCount,
    difficultClearCount: result.newDifficultClearCount,
    accumulatedAttack: state.accumulatedAttack + result.totalAttack,
    accumulatedScore: state.accumulatedScore + result.scoreGained,
    placements: [...state.placements, p],
    lastSpinAction: result.isSpinAction,
    lastCleared: result.cleared,
    depth: (state.depth ?? 0) + 1,
  };
}

function physicalKey(s: SearchState): string {
  return `${s.board.hash().toString()}|${s.current}|${s.bag.join(',')}|${s.hold}|${s.comboCount}|${s.difficultClearCount}`;
}

function applyWarmStart(
  root: SearchState,
  warmStartPlacements: Placement[],
): { state: SearchState; appliedCount: number } {
  let state = root;
  const applied: Placement[] = [];

  for (const p of warmStartPlacements) {
    if (state.current !== p.piece) {
      if (!state.canHold || (state.hold === null && state.bag.length === 0)) break;
      const held = simulateHold(state.current, state.hold, state.bag);
      if (held.newCurrent !== p.piece) break;
      state = {
        ...state,
        current: held.newCurrent,
        hold: held.newHold,
        bag: held.newBag,
        canHold: false,
      };
    }

    const placement: Placement = {
      ...p,
      matrix: getMatrixForPlacement(p),
    };

    if (state.board.collides(placement.matrix, placement.x, placement.y)) {
      return { state: root, appliedCount: 0 };
    }

    const { result, nextBoard } = simulateLock(
      state.board,
      placement,
      state.comboCount,
      state.difficultClearCount,
      1,
    );
    const nextBag = state.bag.slice();
    const nextCurrent = nextBag.shift();
    if (!nextCurrent) break;

    state = {
      board: nextBoard,
      current: nextCurrent,
      bag: nextBag,
      hold: state.hold,
      canHold: true,
      comboCount: result.newComboCount,
      difficultClearCount: result.newDifficultClearCount,
      accumulatedAttack: state.accumulatedAttack + result.totalAttack,
      accumulatedScore: state.accumulatedScore + result.scoreGained,
      placements: [...state.placements, placement],
      lastSpinAction: result.isSpinAction,
      lastCleared: result.cleared,
      depth: (state.depth ?? 0) + 1,
    };
    applied.push(placement);
  }

  return { state, appliedCount: applied.length };
}

function getMatrixForPlacement(p: Placement): number[][] {
  // p に matrix が含まれない場合は再取得
  if (p.matrix) return p.matrix;
  return getMatrix(p.piece, p.rotation);
}

function oneStepLookahead(state: SearchState): number {
  let best = evaluateState(state);

  // 現在ミノを直接置く
  const directPlacements = generatePlacements(state.board, state.current);
  for (const p of directPlacements) {
    const next = advanceState(state, p);
    if (next) {
      const v = evaluateState(next);
      if (v > best) best = v;
    }
  }

  // ホールドしてから置く
  if (state.canHold && (state.hold !== null || state.bag.length > 0)) {
    const held = simulateHold(state.current, state.hold, state.bag);
    const heldState: SearchState = {
      board: state.board.clone(),
      current: held.newCurrent,
      bag: held.newBag,
      hold: held.newHold,
      canHold: false,
      comboCount: state.comboCount,
      difficultClearCount: state.difficultClearCount,
      accumulatedAttack: state.accumulatedAttack,
      accumulatedScore: state.accumulatedScore,
      placements: state.placements,
      lastSpinAction: state.lastSpinAction,
      lastCleared: state.lastCleared,
    };
    const heldPlacements = generatePlacements(heldState.board, heldState.current);
    for (const p of heldPlacements) {
      const next = advanceState(heldState, p);
      if (next) {
        const v = evaluateState(next);
        if (v > best) best = v;
      }
    }
  }

  return best;
}
