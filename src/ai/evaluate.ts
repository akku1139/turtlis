import type { SearchState, TerrainScore } from './types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';
import type { BitBoard } from './bitboard.ts';
import { BOARD_LO_BITS } from './bitboard.ts';
import type { LockResult } from './pure.ts';

/**
 * 評価・報酬関数。
 * cold-clear-2 の freestyle 重み設計を参考に、攻撃（クアッド/B2B/スピン）を
 * 報酬で、地形の安全さをヒューリスティックで評価する。
 */

// ---- 報酬（即時利得: 1手ごと）----
export const DEFAULT_REWARD_WEIGHTS = {
  /** 通常消去 [0列..4列]（クアッド以外は抑止） */
  normalClears: [0, -2.0, -2.5, -2.0, 5.0],
  /** Tフルスピン消去 [0列..3列] */
  spinClears: [0, 1.5, 4.5, 6.5],
  /** Tミニスピン消去 [0列..2列] */
  miniSpinClears: [0, 0.5, 1.5],
  /**
   * 非Tスピン（immobile spin）消去 [0列..2列]。
   * B2Bを維持したまま安価に消せるため、機会があれば優先的に選ぶ。
   */
  nonTSpinClears: [0, 2.5, 4.0],
  /** 非TスピンでB2Bが継続した場合の追加ボーナス */
  nonTSpinB2B: 1.5,
  /**
   * 盤面が高いときの通常消去ペナルティ緩和閾値と緩和率。
   * クアッド待ちで延々積み上げる(高さ滞留)を防ぐ。
   */
  digRelaxFrom: 11,
  digRelaxHalfFrom: 14,
  digRelaxFactor: 0.25,
  /** 高度が高いときの掘削クリア報酬(1列あたり) */
  digClearPerLine: 0.7,
  /** B2Bを切ったときの基本ペナルティ */
  b2bBreakBase: 1.0,
  /** 継続中だったチェーン長に比例する追従ペナルティ */
  b2bBreakPerChain: 0.8,
  /** B2Bが継続した消去 */
  b2bClear: 1.5,
  /** Perfect Clear */
  perfectClear: 12.0,
  /** コンボ係数: reward += w * floor((combo-1)/2) */
  combo: 1.8,
  /** Tミノを使ったのにスピンが絡まない場合のペナルティ */
  wastedT: -1.5,
  /** 実攻撃値への係数 */
  attack: 0,
};


// ---- ヒューリスティック（盤面の静的評価）----
export const DEFAULT_HEURISTIC_WEIGHTS = {
  holes: -1.5, // 幅2以上の穴
  /** 幅1の穴（スピン余地になり得るが基本的には障害）*/
  narrowHole: -0.2,
  coverPerCell: -0.2,
  maxCoverDepth: 6,
  rowTransitions: -0.15,
  height: -0.35,
  heightUpperHalfFrom: 12, // この高さを超えると追加ペナルティ
  heightUpperHalf: -1.2,
  heightUpperQuarterFrom: 17,
  heightUpperQuarter: -3.0,
  deadHeight: 20,
  deadPenalty: -60,
  /** クアッド用ウェルの深さ（1段ごと）*/
  tetrisWellDepth: 0.6,
  /** ウェル総量（複数ウェル抑止）*/
  wellSum: 0,
  /** 消去進行度（9割方埋まった行が多いほど良い）*/
  clearProgress: 0,
  /** あと1マスの行 */
  nearFull: 0,
  /** B2B 状態維持 */
  hasBackToBack: 0.8,
  /** Tスロット潜在力 */
  tSlot: 0.3,
};
export type RewardWeights = typeof DEFAULT_REWARD_WEIGHTS;
export type HeuristicWeights = typeof DEFAULT_HEURISTIC_WEIGHTS;

export const REWARD_WEIGHTS: RewardWeights = structuredClone(DEFAULT_REWARD_WEIGHTS);
export const HEURISTIC_WEIGHTS: HeuristicWeights = structuredClone(DEFAULT_HEURISTIC_WEIGHTS);

export function setWeights(reward: Partial<RewardWeights>, heuristic: Partial<HeuristicWeights>): void {
  Object.assign(REWARD_WEIGHTS, reward);
  Object.assign(HEURISTIC_WEIGHTS, heuristic);
  featuresCache.clear();
}

export interface BoardFeatures {
  heights: number[];
  maxHeight: number;
  holes: number;
  cover: number; // Σ min(穴の深さ, maxCoverDepth)
  holesPerColumn: number[];
  rowTransitions: number;
  wellSum: number;
  tetrisWellDepth: number;
  tetrisWellColumn: number;
  nearFullRows: number;
  /** 幅1の穴（左右が埋まり＝将来スピンで消せる余地）*/
  narrowHoles: number;
  /** 幅2以上の穴（純粋に悪い）*/
  wideHoles: number;
  /** 消去進行度: Σ max(0, 埋まり数-7) （クアッド/PC接近の指標）*/
  clearProgress: number;
  tSlots: number;
}

function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

const featuresCache = new Map<string, BoardFeatures>();
const FEATURES_CACHE_MAX = 60000;

/** 列の最上行インデックス（空列は BOARD_TOTAL_HEIGHT） */
export function columnTopY(lo: number, hi: number): number {
  if (lo !== 0) return 31 - Math.clz32(lo & -lo);
  if (hi !== 0) return BOARD_LO_BITS + (31 - Math.clz32(hi & -hi));
  return BOARD_TOTAL_HEIGHT;
}

export function computeFeatures(board: BitBoard): BoardFeatures {
  const cached = featuresCache.get(board.hash());
  if (cached) return cached;

  const heights: number[] = new Array(BOARD_WIDTH).fill(0);
  const holesPerColumn: number[] = new Array(BOARD_WIDTH).fill(0);
  let holes = 0;
  let cover = 0;
  let maxHeight = 0;

  // --- 列ごと ---
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const lo = board.words[x * 2];
    const hi = board.words[x * 2 + 1];
    if (lo === 0 && hi === 0) continue;
    const topY = columnTopY(lo, hi);
    const height = BOARD_TOTAL_HEIGHT - topY;
    heights[x] = height;
    if (height > maxHeight) maxHeight = height;

    // 穴 = 最上行より下の空きセル。cover = Σ min(下からの深さ, cap)
    {
      // lo 領域: ビット topY+1..31
      const belowLo = topY < 31 ? (~0 << (topY + 1)) : 0;
      let holeLo = ~lo & belowLo;
      if (holeLo !== 0) {
        const n = popcount32(holeLo);
        holes += n;
        holesPerColumn[x] += n;
        while (holeLo) {
          const b = holeLo & -holeLo;
          const y = 31 - Math.clz32(b);
          cover += Math.min(BOARD_TOTAL_HEIGHT - y, HEURISTIC_WEIGHTS.maxCoverDepth);
          holeLo ^= b;
        }
      }
      // hi 領域: ビット max(topY-32+1, 0)..7
      const hiFrom = topY < BOARD_LO_BITS ? 0 : topY - BOARD_LO_BITS + 1;
      let holeHi = ~hi & ((0xff << hiFrom) & 0xff);
      if (holeHi !== 0) {
        const n = popcount32(holeHi);
        holes += n;
        holesPerColumn[x] += n;
        while (holeHi) {
          const b = holeHi & -holeHi;
          const y = BOARD_LO_BITS + (31 - Math.clz32(b));
          cover += Math.min(BOARD_TOTAL_HEIGHT - y, HEURISTIC_WEIGHTS.maxCoverDepth);
          holeHi ^= b;
        }
      }
    }
  }

  // --- 行ごと ---
  let rowTransitions = 0;
  let nearFullRows = 0;
  let clearProgress = 0;
  const minTopY = BOARD_TOTAL_HEIGHT - maxHeight;
  const rowCount = BOARD_TOTAL_HEIGHT - minTopY;
  const rowWords: number[] = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const y = minTopY + i;
    let rowWord = 0;
    if (y < BOARD_LO_BITS) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (board.words[x * 2] & (1 << y)) rowWord |= 1 << x;
      }
    } else {
      const b = 1 << (y - BOARD_LO_BITS);
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (board.words[x * 2 + 1] & b) rowWord |= 1 << x;
      }
    }
    rowWords[i] = rowWord;
  }

  const colTop: number[] = new Array(BOARD_WIDTH);
  for (let x = 0; x < BOARD_WIDTH; x++) colTop[x] = BOARD_TOTAL_HEIGHT - heights[x];

  let narrowHoles = 0;
  let wideHoles = 0;
  for (let i = 0; i < rowCount; i++) {
    const y = minTopY + i;
    const rowWord = rowWords[i];
    const filledCount = popcount32(rowWord);
    if (filledCount === BOARD_WIDTH - 1) nearFullRows++;
    if (filledCount >= 8) clearProgress += filledCount - 7;

    // 穴の分類: 幅1（左右埋まり）は将来の immobile spin で消せる可能性がある
    {
      let w = ~rowWord & ((1 << BOARD_WIDTH) - 1);
      while (w) {
        const b = w & -w;
        const x = 31 - Math.clz32(b);
        if (y > colTop[x]) {
          const left = x === 0 ? true : (rowWord & (1 << (x - 1))) !== 0;
          const right = x === BOARD_WIDTH - 1 ? true : (rowWord & (1 << (x + 1))) !== 0;
          if (left && right) narrowHoles++;
          else wideHoles++;
        }
        w ^= b;
      }
    }

    // 行内遷移（左右壁を埋まり扱い）
    let rt = 0;
    let prev = 1;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const cur = (rowWord >>> x) & 1;
      if (cur !== prev) rt++;
      prev = cur;
    }
    if (prev === 0) rt++;
    rowTransitions += rt;
  }

  // --- ウェル ---
  // tetris well depth (cc2式): 最も低い列をウェル候補とし、
  // 「その列以外が全て埋まっている行」がウェル列の天井から下に何連続するか
  let wellColumn = 0;
  for (let x = 1; x < BOARD_WIDTH; x++) {
    if (heights[x] < heights[wellColumn]) wellColumn = x;
  }
  let exceptMaskLo = -1;
  let exceptMaskHi = 0xff;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    if (x === wellColumn) continue;
    exceptMaskLo &= board.words[x * 2];
    exceptMaskHi &= board.words[x * 2 + 1];
  }
  // ウェル列の表面の直上から「ウェル列が空・他列が埋まり」の行を連続して数える
  // (cold-clear式: ウェル柱の高さの直上から上方へ測定)
  let tetrisWellDepth = 0;
  {
    const start = BOARD_TOTAL_HEIGHT - 1 - heights[wellColumn];
    for (let y = start; y >= 0; y--) {
      const filledExcept = y < BOARD_LO_BITS
        ? ((exceptMaskLo >>> y) & 1)
        : ((exceptMaskHi >>> (y - BOARD_LO_BITS)) & 1);
      const wellEmpty = !board.get(wellColumn, y);
      if (filledExcept && wellEmpty) tetrisWellDepth++;
      else break;
    }
  }

  // 全ウェル（狭い溝）の三角和 — 複数ウェルの抑止用
  let wellSum = 0;
  {
    const wellRuns = new Array(BOARD_WIDTH).fill(0);
    for (let i = 0; i < rowCount; i++) {
      const rowWord = rowWords[i];
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (rowWord & (1 << x)) {
          if (wellRuns[x] > 0) {
            wellSum += (wellRuns[x] * (wellRuns[x] + 1)) / 2;
            wellRuns[x] = 0;
          }
          continue;
        }
        const left = x === 0 ? true : ((rowWord >>> (x - 1)) & 1) === 1;
        const right = x === BOARD_WIDTH - 1 ? true : ((rowWord >>> (x + 1)) & 1) === 1;
        if (left && right) wellRuns[x]++;
        else if (wellRuns[x] > 0) {
          wellSum += (wellRuns[x] * (wellRuns[x] + 1)) / 2;
          wellRuns[x] = 0;
        }
      }
    }
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (wellRuns[x] > 0) wellSum += (wellRuns[x] * (wellRuns[x] + 1)) / 2;
    }
  }

  // --- Tスロット簡易検出（左右受けオーバーハング）---
  let tSlots = 0;
  for (let i = 0; i + 2 < rowCount; i++) {
    const cur = rowWords[i];
    const nxt = rowWords[i + 1];
    const bel = rowWords[i + 2];
    for (let x = 0; x <= BOARD_WIDTH - 3; x++) {
      const side = (1 << x) | (1 << (x + 2));
      const mid = 1 << (x + 1);
      if (
        (cur & side) === side &&
        (nxt & side) === side &&
        (cur & mid) === 0 &&
        (nxt & mid) === 0 &&
        (bel & mid) !== 0
      ) {
        tSlots++;
      }
    }
  }

  const features: BoardFeatures = {
    heights,
    maxHeight,
    holes,
    cover,
    holesPerColumn,
    rowTransitions,
    wellSum,
    tetrisWellDepth,
    tetrisWellColumn: wellColumn,
    nearFullRows,
    clearProgress,
    narrowHoles,
    wideHoles,
    tSlots,
  };

  if (featuresCache.size > FEATURES_CACHE_MAX) {
    const first = featuresCache.keys().next().value;
    if (first !== undefined) featuresCache.delete(first);
  }
  featuresCache.set(board.hash(), features);
  return features;
}

export function countHoles(board: BitBoard): number {
  return computeFeatures(board).holes;
}

/** 盤面の静的ヒューリスティック値（高いほど良い） */
export function heuristicOf(board: BitBoard, difficultClearCount: number): number {
  const f = computeFeatures(board);
  const W = HEURISTIC_WEIGHTS;
  let h = 0;
  h += f.wideHoles * W.holes;
  h += f.narrowHoles * W.narrowHole;
  h += f.cover * W.coverPerCell;
  h += f.rowTransitions * W.rowTransitions;
  h += f.maxHeight * W.height;
  if (f.maxHeight > W.heightUpperHalfFrom) {
    h += W.heightUpperHalf * (f.maxHeight - W.heightUpperHalfFrom);
  }
  if (f.maxHeight > W.heightUpperQuarterFrom) {
    h += W.heightUpperQuarter * (f.maxHeight - W.heightUpperQuarterFrom);
  }
  if (f.maxHeight >= W.deadHeight) {
    h += W.deadPenalty;
  }
  h += f.tetrisWellDepth * W.tetrisWellDepth;
  h += f.wellSum * W.wellSum;
  h += f.clearProgress * W.clearProgress;
  h += f.nearFullRows * W.nearFull;
  h += f.tSlots * W.tSlot;
  if (difficultClearCount > 1) {
    h += W.hasBackToBack;
  }
  return h;
}

/** 旧API互換ラッパー */
export function computeTerrainScore(state: SearchState): TerrainScore {
  const f = computeFeatures(state.board);
  return {
    total: heuristicOf(state.board, state.difficultClearCount),
    b2bPotential: 0,
    tSlotCount: f.tSlots,
    quadWellDepth: f.tetrisWellDepth,
    centerStackHeight: (f.heights[4] + f.heights[5]) / 2,
    hazard: -(f.holes * HEURISTIC_WEIGHTS.holes + f.cover * HEURISTIC_WEIGHTS.coverPerCell),
  };
}

/** 旧ビームサーチ用の互換評価（DAG探索では heuristicOf + rewardOf を使用） */
export function evaluateState(state: SearchState): number {
  let value = heuristicOf(state.board, state.difficultClearCount);
  value += state.accumulatedAttack * REWARD_WEIGHTS.attack;
  if (state.comboCount > 1) {
    value += REWARD_WEIGHTS.combo * Math.floor((state.comboCount - 1) / 2);
  }
  // 直近の消去がB2Bを切る通常消去ならペナルティ
  if (state.lastCleared > 0 && state.lastCleared < 4 && !state.lastSpinAction) {
    value -= 1.0;
  }
  return value;
}

/** 報酬計算のための直前状態の文脈 */
export interface RewardContext {
  /** 直前の盤面の最大高さ */
  stackHeight: number;
  /** 直前の difficultClearCount（この手でB2Bが切れるか判定用） */
  b2bCount: number;
}

/**
 * 1手の報酬（cold-clear流の整形済み報酬）
 */
export function rewardOf(
  piece: string,
  result: LockResult,
  attackValue: number,
  context?: RewardContext,
): number {
  const W = REWARD_WEIGHTS;
  let r = 0;

  if (result.isAllClear && result.cleared > 0) {
    r += W.perfectClear;
  }
  const cleared = result.cleared;
  if (result.spinKind === 't-full') {
    r += W.spinClears[Math.min(cleared, 3)];
  } else if (result.spinKind === 't-mini') {
    r += W.miniSpinClears[Math.min(cleared, 2)];
  } else if (result.spinKind === 'other') {
    // 非T immobileスピン: B2B維持用の安価な消しとして積極評価
    r += W.nonTSpinClears[Math.min(cleared, 2)];
    if (cleared > 0 && result.newDifficultClearCount > 1) {
      r += W.nonTSpinB2B;
    }
  } else {
    let nc = W.normalClears[Math.min(cleared, 4)];
    if (nc < 0 && context) {
      // 高所ではペナルティを緩めて掘り出しを促す
      const relax = context.stackHeight >= W.digRelaxHalfFrom
        ? W.digRelaxFactor
        : context.stackHeight >= W.digRelaxFrom ? 0.5 : 1;
      nc *= relax;
    }
    r += nc;
    if (context && cleared > 0 && context.stackHeight >= W.digRelaxFrom && result.spinKind === 'none') {
      r += W.digClearPerLine * cleared;
    }
  }

  // B2B継続ボーナス
  if (cleared > 0 && result.newDifficultClearCount > 1) {
    r += W.b2bClear;
  }

  // B2Bを切る通常消去の明示ペナルティ（失うチェーン長に比例）
  if (
    cleared > 0 && cleared < 4 && !result.isSpinAction &&
    result.newDifficultClearCount === 0
  ) {
    const lostChain = context ? Math.max(0, context.b2bCount - 1) : 0;
    r -= W.b2bBreakBase + W.b2bBreakPerChain * lostChain;
  }

  // コンボ
  if (result.newComboCount > 1) {
    r += W.combo * Math.floor((result.newComboCount - 1) / 2);
  }

  // 無駄T
  if (piece === 'T' && (cleared < 2 || !result.isSpinAction)) {
    r += W.wastedT;
  }

  r += W.attack * attackValue;

  return r;
}
