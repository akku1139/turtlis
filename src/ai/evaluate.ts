import type { SearchState, TerrainScore } from './types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';
import type { BitBoard } from './bitboard.ts';
import { BOARD_LO_BITS } from './bitboard.ts';

/**
 * 評価関数の重み。
 * 攻撃重視（クアッド連携・B2B維持・コンボ）+ 安全な地形維持を両立させる。
 */
export const WEIGHTS = {
  // 蓄積攻撃（探索中に消した行から得た攻撃）
  attack: 10,
  attackPerPiece: 2.0,
  // B2Bチェーン
  b2b: 3.0,
  // コンボ継続
  combo: 1.2,
  // 地形
  holes: -40,
  coverHole: -6, // 穴の上にかぶせたブロック数（深い穴ほど悪い）の追加ペナルティ係数
  aggregateHeight: -0.35,
  maxHeight: -0.5,
  bumpiness: -2.5,
  wells: -1.6, // ウェル合計（三角和）。1本のウェルは許容し複数を抑える
  rowTransitions: -1.2,
  colTransitions: -1.2,
  nearFull: 4.0, // 9/10埋まりの行（1マスで消える）
  parity: -1.5,
  tSlot: 2.0,
  // 高度ペナルティ（高さが閾値を超えると急激に厳しくする）
  dangerHeight: 14,
  dangerSlope: 6.0,
  criticalHeight: 18,
  criticalSlope: 40.0,
};

export interface BoardFeatures {
  heights: number[];
  maxHeight: number;
  aggregateHeight: number;
  bumpiness: number;
  holes: number;
  cover: number; // 穴の上のブロック総数（穴の深さ評価）
  rowTransitions: number;
  colTransitions: number;
  wellSum: number;
  maxWell: number;
  nearFullRows: number;
  parity: number;
  tSlots: number;
  fullRowsPotential: number; // 8個以上埋まった行の (filled-7) の総和
}

const featuresCache = new Map<string, BoardFeatures>();
const FEATURES_CACHE_MAX = 30000;

function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

export function computeFeatures(board: BitBoard): BoardFeatures {
  const cached = featuresCache.get(board.hash());
  if (cached) return cached;

  const heights: number[] = new Array(BOARD_WIDTH).fill(0);
  let holes = 0;
  let cover = 0;
  let colTransitions = 0;
  let maxHeight = 0;
  let aggregateHeight = 0;

  // --- 列ごとの特徴 ---
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const lo = board.words[x * 2];
    const hi = board.words[x * 2 + 1];
    if (lo === 0 && hi === 0) {
      heights[x] = 0;
      colTransitions += 1; // 空列: 底壁との境界1回
      continue;
    }
    // 最上行（最小セットビットインデックス）
    let topY: number;
    if (lo !== 0) topY = 31 - Math.clz32(lo & -lo);
    else topY = BOARD_LO_BITS + (31 - Math.clz32(hi & -hi));
    const height = BOARD_TOTAL_HEIGHT - topY;
    heights[x] = height;
    aggregateHeight += height;
    if (height > maxHeight) maxHeight = height;

    // 穴 = 最上行より下の空きセル
    let filledBelow: number;
    if (topY >= BOARD_LO_BITS) {
      filledBelow = popcount32(hi >>> (topY - BOARD_LO_BITS + 1));
    } else {
      filledBelow = popcount32(hi); // hi 側は全部 topY より下
      if (topY < 31) filledBelow += popcount32(lo >>> (topY + 1));
    }
    const colHoles = height - 1 - filledBelow;
    holes += colHoles;
    // カバー: 穴の上のブロック数 ≒ height - 1 - 穴数
    cover += colHoles > 0 ? (height - 1 - colHoles) : 0;

    // 列内遷移（上から下へ走査、底壁を埋まり扱い）
    let prev = 1; // 天井は空扱いでなく、最初のブロック手前は空
    prev = 0;
    let transitions = 0;
    let seenFilled = false;
    for (let y = topY; y < BOARD_TOTAL_HEIGHT; y++) {
      const filled = y < BOARD_LO_BITS
        ? ((lo >>> y) & 1)
        : ((hi >>> (y - BOARD_LO_BITS)) & 1);
      if (filled !== prev) transitions++;
      prev = filled;
      if (filled) seenFilled = true;
    }
    if (prev === 0) transitions++; // 底壁
    colTransitions += seenFilled ? transitions : 1;
  }

  // --- 行ごとの特徴 ---
  let rowTransitions = 0;
  let nearFullRows = 0;
  let parity = 0;
  let fullRowsPotential = 0;
  const wellRuns = new Array(BOARD_WIDTH).fill(0);
  let wellSum = 0;
  let maxWell = 0;

  const minTopY = BOARD_TOTAL_HEIGHT - maxHeight;
  for (let y = minTopY; y < BOARD_TOTAL_HEIGHT; y++) {
    // 行の占有ワードを作る
    let rowWord = 0;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const w = y < BOARD_LO_BITS ? board.words[x * 2] : board.words[x * 2 + 1];
      const b = y < BOARD_LO_BITS ? y : y - BOARD_LO_BITS;
      if (w & (1 << b)) rowWord |= 1 << x;
    }
    const filled = popcount32(rowWord);

    if (filled === 9) nearFullRows++;
    if (filled >= 8) fullRowsPotential += filled - 7;

    // 行内遷移（左右壁を埋まり扱い）
    let rt = 0;
    let prev = 1; // 左壁
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const cur = (rowWord >>> x) & 1;
      if (cur !== prev) rt++;
      prev = cur;
    }
    if (prev === 0) rt++; // 右壁
    rowTransitions += rt;

    // ウェル: 空きセルで左右が埋まり（壁を含む）
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (rowWord & (1 << x)) {
        if (wellRuns[x] > 0) {
          wellSum += tri(wellRuns[x]);
          if (wellRuns[x] > maxWell) maxWell = wellRuns[x];
          wellRuns[x] = 0;
        }
        continue;
      }
      const left = x === 0 ? true : ((rowWord >>> (x - 1)) & 1) === 1;
      const right = x === BOARD_WIDTH - 1 ? true : ((rowWord >>> (x + 1)) & 1) === 1;
      if (left && right) {
        wellRuns[x]++;
      } else if (wellRuns[x] > 0) {
        wellSum += tri(wellRuns[x]);
        if (wellRuns[x] > maxWell) maxWell = wellRuns[x];
        wellRuns[x] = 0;
      }
    }
  }
  for (let x = 0; x < BOARD_WIDTH; x++) {
    if (wellRuns[x] > 0) {
      wellSum += tri(wellRuns[x]);
      if (wellRuns[x] > maxWell) maxWell = wellRuns[x];
    }
  }

  // パリティ（チェッカーボード不均衡）
  {
    let p = 0;
    for (let y = minTopY; y < BOARD_TOTAL_HEIGHT; y++) {
      let rowWord = 0;
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const w = y < BOARD_LO_BITS ? board.words[x * 2] : board.words[x * 2 + 1];
        const b = y < BOARD_LO_BITS ? y : y - BOARD_LO_BITS;
        if (w & (1 << b)) rowWord |= 1 << x;
      }
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (rowWord & (1 << x)) p += ((x + y) & 1) === 0 ? 1 : -1;
      }
    }
    parity = Math.abs(p);
  }

  const bumpiness = (() => {
    let b = 0;
    for (let i = 0; i < BOARD_WIDTH - 1; i++) {
      b += Math.abs(heights[i] - heights[i + 1]);
    }
    return b;
  })();

  const tSlots = countTSlotShapes(board);

  const features: BoardFeatures = {
    heights,
    maxHeight,
    aggregateHeight,
    bumpiness,
    holes,
    cover,
    rowTransitions,
    colTransitions,
    wellSum,
    maxWell,
    nearFullRows,
    parity,
    tSlots,
    fullRowsPotential,
  };

  if (featuresCache.size > FEATURES_CACHE_MAX) {
    const first = featuresCache.keys().next().value;
    if (first !== undefined) featuresCache.delete(first);
  }
  featuresCache.set(board.hash(), features);
  return features;
}

function tri(n: number): number {
  return (n * (n + 1)) / 2;
}

function countTSlotShapes(board: BitBoard): number {
  // Tミノを差し込める形状の簡易検出（左受け・右受け）
  let count = 0;
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 1; y < BOARD_TOTAL_HEIGHT - 1; y++) {
      // 左受け: (x,y+1),(x,y),(x+2,y+1),(x+2,y) が埋まり (x+1,y),(x+1,y+1) が空き
      const l = board.get(x, y) && board.get(x, y + 1);
      const r = board.get(x + 2, y) && board.get(x + 2, y + 1);
      const c = !board.get(x + 1, y) && !board.get(x + 1, y + 1);
      const below = board.get(x + 1, y + 2);
      if (l && r && c && below) count++;
    }
  }
  return count;
}

export function countHoles(board: BitBoard): number {
  return computeFeatures(board).holes;
}

/** 互換用ラッパー */
export function computeTerrainScore(state: SearchState): TerrainScore {
  const f = computeFeatures(state.board);
  return {
    total: 0,
    b2bPotential: 0,
    tSlotCount: f.tSlots,
    quadWellDepth: f.maxWell,
    centerStackHeight: (f.heights[4] + f.heights[5]) / 2,
    hazard: -terrainScore(f),
  };
}

function terrainScore(f: BoardFeatures): number {
  let s = 0;
  s += f.holes * WEIGHTS.holes;
  s += f.cover * WEIGHTS.coverHole;
  s += f.aggregateHeight * WEIGHTS.aggregateHeight;
  s += f.maxHeight * WEIGHTS.maxHeight;
  s += f.bumpiness * WEIGHTS.bumpiness;
  s += f.wellSum * WEIGHTS.wells;
  s += f.rowTransitions * WEIGHTS.rowTransitions;
  s += f.colTransitions * WEIGHTS.colTransitions;
  s += f.nearFullRows * WEIGHTS.nearFull;
  s += f.parity * WEIGHTS.parity;
  s += f.tSlots * WEIGHTS.tSlot;

  // 危険高度ペナルティ（2段階）
  if (f.maxHeight > WEIGHTS.dangerHeight) {
    s += (f.maxHeight - WEIGHTS.dangerHeight) ** 2 * WEIGHTS.dangerSlope;
  }
  if (f.maxHeight > WEIGHTS.criticalHeight) {
    s += (f.maxHeight - WEIGHTS.criticalHeight) ** 2 * WEIGHTS.criticalSlope;
  }
  return s;
}

export function evaluateState(state: SearchState): number {
  const f = computeFeatures(state.board);

  let value = 0;

  // 蓄積攻撃
  value += state.accumulatedAttack * WEIGHTS.attack;
  const piecesUsed = Math.max(1, state.placements.length);
  value += (state.accumulatedAttack / piecesUsed) * WEIGHTS.attackPerPiece;

  // コンボ
  value += Math.max(0, state.comboCount - 1) * WEIGHTS.combo;

  // B2B
  const b2b = Math.max(0, state.difficultClearCount - 1);
  if (b2b > 0) {
    value += Math.log2(1 + b2b) * WEIGHTS.b2b * 2;
  }

  // 直近の消去がB2Bを切る通常消去ならペナルティ
  if (state.lastCleared > 0 && state.lastCleared < 4 && !state.lastSpinAction) {
    value -= 25;
  }

  // 地形
  value += terrainScore(f);

  return value;
}
