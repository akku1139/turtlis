import type { SearchState, TerrainScore } from './types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';
import type { BitBoard } from './bitboard.ts';

const WEIGHTS = {
  accumulatedAttack: 12,
  attackEfficiency: 2.0,        // 1ミノあたりの攻撃効率
  b2bChain: 8,
  combo: 2,
  terrain: 0.5,
  hazard: 8,
  spinActionBonus: 10,          // スピン行動（T以外も）
  spinClearBonus: 8,            // スピンで消去した場合
  clearBonus: 1.5,              // 通常消去の加点は控えめ
  b2bBreakPenalty: 30,          // B2Bを切る通常消去
  allClearGoalBonus: 20,        // B2Bを維持したAll Clear
  allClearBonus: 6,             // B2Bを切るAll Clearは低い
  tSlotPotential: 1.0,
};

export function countHoles(board: BitBoard): number {
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

function columnHeights(board: BitBoard): number[] {
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

function countDeepHoles(board: BitBoard): number {
  let penalty = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let col = board.cols[x];
    let filled = false;
    let holeDepth = 0;
    for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
      if (col & 1n) {
        filled = true;
        if (holeDepth >= 3) {
          penalty += (holeDepth - 2) ** 2 * 10;
        }
        holeDepth = 0;
      } else if (filled) {
        holeDepth++;
      }
      col >>= 1n;
    }
    if (holeDepth >= 3) {
      penalty += (holeDepth - 2) ** 2 * 10;
    }
  }
  return penalty;
}

function calcBumpiness(heights: number[]): number {
  let bump = 0;
  for (let i = 0; i < heights.length - 1; i++) {
    bump += Math.abs(heights[i] - heights[i + 1]);
  }
  return bump;
}

function calcRowTransitions(board: BitBoard): number {
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

function tetrisWellDepth(board: BitBoard): number {
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

function countTSlotShapes(board: BitBoard): number {
  let count = 0;
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT - 3; y++) {
      const left = board.get(x, y) && board.get(x, y + 1) && board.get(x, y + 2);
      const center = !board.get(x + 1, y) && !board.get(x + 1, y + 1) && !board.get(x + 1, y + 2);
      const right = board.get(x + 2, y + 1) && board.get(x + 2, y + 2) && board.get(x + 2, y + 3);
      if (left && center && right) count++;
    }
  }
  // 右受け・簡易TST・TSSは省略せず簡易検出する
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT - 3; y++) {
      const left = board.get(x, y + 1) && board.get(x, y + 2) && board.get(x, y + 3);
      const center = !board.get(x + 1, y) && !board.get(x + 1, y + 1) && !board.get(x + 1, y + 2);
      const right = board.get(x + 2, y) && board.get(x + 2, y + 1) && board.get(x + 2, y + 2);
      if (left && center && right) count++;
    }
  }
  return count;
}

function calcParityBalance(heights: number[]): number {
  const leftAvg = (heights[0] + heights[1] + heights[2] + heights[3] + heights[4]) / 5;
  const rightAvg = (heights[5] + heights[6] + heights[7] + heights[8] + heights[9]) / 5;
  return -Math.abs(leftAvg - rightAvg);
}

function countRowPotential(board: BitBoard): number {
  let potential = 0;
  for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
    let filled = 0;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (board.get(x, y)) filled++;
    }
    if (filled >= 8) potential += filled - 7;
  }
  return potential;
}

export function computeTerrainScore(state: SearchState): TerrainScore {
  const board = state.board;
  const heights = columnHeights(board);
  const holes = countHoles(board);
  const deepHolePenalty = countDeepHoles(board);
  const bumpiness = calcBumpiness(heights);
  const maxHeight = Math.max(...heights);
  const rowTransitions = calcRowTransitions(board);
  const tSlotCount = countTSlotShapes(board);
  const quadWellDepth = tetrisWellDepth(board);
  const centerStackHeight = (heights[4] + heights[5]) / 2;
  const sideAvg = (heights[0] + heights[1] + heights[8] + heights[9]) / 4;
  const allAvg = heights.reduce((a, b) => a + b, 0) / BOARD_WIDTH;
  const sideCoverage = (sideAvg - allAvg) * 2.0;

  const iAvailableSoon =
    state.current === 'I' ||
    state.hold === 'I' ||
    state.bag.slice(0, 4).includes('I');

  const heightPenalty = maxHeight > 16 ? (maxHeight - 16) ** 2 * 2 : 0;
  const hazard =
    heightPenalty +
    holes * 12 +
    deepHolePenalty * 3 +
    (maxHeight > 20 ? 50 : 0);

  const b2bPotential =
    tSlotCount * 0.8 +
    (quadWellDepth > 0
      ? iAvailableSoon
        ? quadWellDepth * 1.2
        : -quadWellDepth * 2.0
      : 0) +
    (state.difficultClearCount > 1 ? state.difficultClearCount * 1.0 : 0) +
    -bumpiness * 1.2 +
    -holes * 6.0 +
    -rowTransitions * 0.3 +
    calcParityBalance(heights) * 0.6 +
    sideCoverage +
    countRowPotential(board) * 1.5;

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

  const tAvailable =
    (state.current === 'T' ? 1 : 0) +
    state.bag.filter((p) => p === 'T').length +
    (state.hold === 'T' ? 1 : 0);

  const iAvailable =
    (state.current === 'I' ? 1 : 0) +
    state.bag.filter((p) => p === 'I').length +
    (state.hold === 'I' ? 1 : 0);

  const piecesUsed = Math.max(1, state.placements.length);
  const attackPerPiece = state.accumulatedAttack / piecesUsed;

  // 将来のB2B継続ポテンシャル
  const futureB2BPotential =
    terrain.tSlotCount * 1.2 * (0.5 + tAvailable * 0.4) +
    (terrain.quadWellDepth > 0
      ? iAvailable
        ? terrain.quadWellDepth * 0.8   // 控えめに（スピンを優先）
        : -terrain.quadWellDepth * 3.0
      : 0);

  let value = 0;
  value += state.accumulatedAttack * WEIGHTS.accumulatedAttack;
  value += attackPerPiece * WEIGHTS.attackEfficiency;
  value += Math.max(0, state.difficultClearCount - 1) * WEIGHTS.b2bChain;
  value += Math.max(0, state.comboCount - 1) * WEIGHTS.combo;
  value += terrain.total * WEIGHTS.terrain;
  value -= terrain.hazard * WEIGHTS.hazard;
  value += futureB2BPotential;

  // スピン行動の強力な加点
  if (state.lastSpinAction) {
    value += WEIGHTS.spinActionBonus;
    if (state.lastCleared > 0) {
      value += WEIGHTS.spinClearBonus;
    }
  }

  // B2Bを切る通常消去（非スピンで1～3列）への強いペナルティ
  if (state.lastCleared > 0 && state.lastCleared < 4 && !state.lastSpinAction) {
    value -= WEIGHTS.b2bBreakPenalty;
  }

  // 通常消去の加点（スピン以外の消去は弱く）
  value += state.lastCleared * WEIGHTS.clearBonus;

  // All Clear
  if (state.board.isEmpty() && state.lastCleared > 0) {
    if (state.difficultClearCount > 1) {
      // B2Bを維持したAll Clear（理想）
      value += WEIGHTS.allClearGoalBonus;
    } else {
      // B2Bを切ったAll Clearはあまり価値がない
      value += WEIGHTS.allClearBonus;
    }
  }

  return value;
}
