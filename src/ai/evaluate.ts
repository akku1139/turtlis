import type { SearchState, TerrainScore } from './types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';

export function computeTerrainScore(state: SearchState): TerrainScore {
  const board = state.board;
  const heights = columnHeights(board);
  const holes = countHoles(board);
  const bumpiness = calcBumpiness(heights);
  const maxHeight = Math.max(...heights);
  const rowTransitions = calcRowTransitions(board);
  const tSlotCount = countTSlotShapes(board);
  const quadWellDepth = tetrisWellDepth(board);
  const centerStackHeight = (heights[4] + heights[5]) / 2;

  const hazard =
    (maxHeight > 18 ? (maxHeight - 18) * 5 : 0) +
    holes * 5 +
    (maxHeight > 20 ? 20 : 0);

  const b2bPotential =
    tSlotCount * 3.0 +
    quadWellDepth * 2.5 +
    (state.difficultClearCount > 1 ? state.difficultClearCount * 2.0 : 0) +
    centerStackHeight * 0.3 +
    -bumpiness * 0.6 +
    -holes * 2.0 +
    -rowTransitions * 0.15 +
    calcParityBalance(heights) * 0.8 +
    // 高い列が中央に集まっていると B2B 地形を作りやすい
    (heights[4] + heights[5] > 12 ? 2.0 : 0.0);

  return {
    total: b2bPotential,
    b2bPotential,
    tSlotCount,
    quadWellDepth,
    centerStackHeight,
    hazard,
  };
}

export function evaluateState(state: SearchState): number {
  const terrain = computeTerrainScore(state);
  return state.accumulatedAttack * 15 + terrain.total * 0.8 - terrain.hazard * 2.5;
}

function columnHeights(board: import('./bitboard.ts').BitBoard): number[] {
  const heights = new Array(BOARD_WIDTH).fill(0);
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let col = board.cols[x];
    let y = 0;
    while (col !== 0n && y < BOARD_TOTAL_HEIGHT) {
      if (col & 1n) {
        heights[x] = BOARD_TOTAL_HEIGHT - y;
        break;
      }
      col >>= 1n;
      y++;
    }
  }
  return heights;
}

function countHoles(board: import('./bitboard.ts').BitBoard): number {
  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let col = board.cols[x];
    let filled = false;
    for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
      if (col & 1n) {
        filled = true;
      } else if (filled) {
        holes++;
      }
      col >>= 1n;
    }
  }
  return holes;
}

function calcBumpiness(heights: number[]): number {
  let bump = 0;
  for (let i = 0; i < heights.length - 1; i++) {
    bump += Math.abs(heights[i] - heights[i + 1]);
  }
  return bump;
}

function calcRowTransitions(board: import('./bitboard.ts').BitBoard): number {
  let transitions = 0;
  for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
    let prev = 0;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const cur = board.get(x, y) ? 1 : 0;
      if (cur !== prev) transitions++;
      prev = cur;
    }
  }
  return transitions;
}

function tetrisWellDepth(board: import('./bitboard.ts').BitBoard): number {
  const heights = columnHeights(board);
  let best = 0;
  for (let wellX = 0; wellX < BOARD_WIDTH; wellX++) {
    let depth = 0;
    for (let y = BOARD_TOTAL_HEIGHT - 1; y >= 0; y--) {
      let full = true;
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (x === wellX) continue;
        if (!board.get(x, y)) {
          full = false;
          break;
        }
      }
      if (full) depth++;
      else break;
    }
    best = Math.max(best, depth);
  }
  return best;
}

function calcParityBalance(heights: number[]): number {
  const leftAvg = (heights[0] + heights[1] + heights[2] + heights[3] + heights[4]) / 5;
  const rightAvg = (heights[5] + heights[6] + heights[7] + heights[8] + heights[9]) / 5;
  return -Math.abs(leftAvg - rightAvg);
}

// 簡易Tスロット検出（実際にはパターンDBを使う）
function countTSlotShapes(board: import('./bitboard.ts').BitBoard): number {
  let count = 0;
  // 左受けTSD形状の簡易チェック
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT - 3; y++) {
      const left = board.get(x, y) && board.get(x, y + 1) && board.get(x, y + 2);
      const center = !board.get(x + 1, y) && !board.get(x + 1, y + 1) && !board.get(x + 1, y + 2);
      const right = board.get(x + 2, y + 1) && board.get(x + 2, y + 2) && board.get(x + 2, y + 3);
      if (left && center && right) count++;
    }
  }
  return count;
}
