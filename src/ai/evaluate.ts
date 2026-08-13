import type { SearchState, TerrainScore } from './types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';
import type { BitBoard } from './bitboard.ts';

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
  const checkerParity = getCheckerParity(board);
  const verticalParity = getVerticalParity(heights);
  const maxDeepHoleDepth = getMaxDeepHoleDepth(board);

  // Iミノが現在・ホールド・近いネクストにいるか
  const iAvailableSoon =
    state.current === 'I' ||
    state.hold === 'I' ||
    state.bag.slice(0, 4).includes('I');

  // I依存の深い穴はIが近くにいないと非常に危険
  const deepHoleDependencyPenalty =
    maxDeepHoleDepth >= 3 && !iAvailableSoon ? maxDeepHoleDepth * 8 : 0;

  // 危険度：高さ・穴・深い穴を厳しく罰し、生存を最優先する
  const heightPenalty = maxHeight > 16 ? (maxHeight - 16) ** 2 * 2 : 0;
  const hazard =
    heightPenalty +
    holes * 12 +
    deepHolePenalty * 3 +
    deepHoleDependencyPenalty +
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
    calcParityBalance(heights) * 0.6 -
    (checkerParity !== 0 ? 1.5 : 0) -
    (verticalParity !== 0 ? 1.5 : 0);

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

  // 現在のミノ・ネクスト・ホールドに残っている T の数を数える
  const tAvailable =
    (state.current === 'T' ? 1 : 0) +
    state.bag.filter((p) => p === 'T').length +
    (state.hold === 'T' ? 1 : 0);

  // スピン受け地形の価値（過剰に評価しない）
  const spinPotential = terrain.tSlotCount * 0.8 * (1.0 + tAvailable * 0.3);

  // 直近がスピンなら無条件で加点（B2B維持の価値）
  const spinActionBonus = state.lastSpinAction ? 5.0 : 0.0;
  // ライン消去自体も報酬（B2Bを切る通常消去でも、積みを減らす価値）
  const clearBonus = state.lastCleared * 2.5;

  // 全消し（All Clear）は最優先で取る
  const isAllClear = state.board.isEmpty() && state.lastCleared > 0;
  const allClearBonus = isAllClear ? 30.0 : 0.0;
  const allClearB2BBonus = isAllClear && state.difficultClearCount > 1 ? 20.0 : 0.0;

  // 最初のスピンによるB2B開始を強く後押しする
  const firstSpinB2BBonus =
    state.lastSpinAction && state.lastCleared > 0 && state.difficultClearCount === 1
      ? 15.0
      : 0.0;

  // Tを保持または現在Tでスピン受けがある場合の加点
  const holdTSlotBonus = state.hold === 'T' && terrain.tSlotCount > 0 ? 3.0 : 0.0;
  const currentTSlotBonus = state.current === 'T' && terrain.tSlotCount > 0 ? 2.0 : 0.0;

  // Tスピン単発・B2B連鎖を強く優先する
  const tSpinSingleBonus =
    state.lastSpinAction && state.lastCleared === 1 ? 12.0 : 0.0;
  const tSpinDoubleBonus =
    state.lastSpinAction && state.lastCleared === 2 ? 6.0 : 0.0;
  const b2bChainBonus =
    state.difficultClearCount > 1
      ? (state.difficultClearCount - 1) * 6.0
      : 0.0;
  const spinChainBonus =
    state.lastSpinAction && state.difficultClearCount > 1 ? 10.0 : 0.0;
  const b2bBreakPenalty =
    state.lastCleared > 0 && state.lastCleared < 4 && !state.lastSpinAction
      ? 12.0
      : 0.0;

  // 攻撃力・地形・スピン受けをバランスし、生存を維持しつつスピンを狙う
  return (
    state.accumulatedAttack * 12 +
    terrain.total * 0.5 +
    spinPotential -
    terrain.hazard * 6.0 +
    spinActionBonus +
    clearBonus +
    tSpinSingleBonus +
    tSpinDoubleBonus +
    b2bChainBonus +
    spinChainBonus +
    allClearBonus +
    allClearB2BBonus -
    b2bBreakPenalty
    + firstSpinB2BBonus +
    holdTSlotBonus +
    currentTSlotBonus
  );
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

function getMaxDeepHoleDepth(board: BitBoard): number {
  let maxDepth = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let col = board.cols[x];
    let filled = false;
    let holeDepth = 0;
    for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
      if (col & 1n) {
        filled = true;
        if (holeDepth > maxDepth) maxDepth = holeDepth;
        holeDepth = 0;
      } else if (filled) {
        holeDepth++;
      }
      col >>= 1n;
    }
    if (holeDepth > maxDepth) maxDepth = holeDepth;
  }
  return maxDepth;
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

function calcParityBalance(heights: number[]): number {
  const leftAvg = (heights[0] + heights[1] + heights[2] + heights[3] + heights[4]) / 5;
  const rightAvg = (heights[5] + heights[6] + heights[7] + heights[8] + heights[9]) / 5;
  return -Math.abs(leftAvg - rightAvg);
}

function getCheckerParity(board: BitBoard): number {
  let count = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
      if (board.get(x, y) && ((x + y) & 1) === 0) {
        count++;
      }
    }
  }
  return count & 1;
}

function getVerticalParity(heights: number[]): number {
  let sum = 0;
  for (let x = 0; x < BOARD_WIDTH; x += 2) {
    sum += heights[x];
  }
  return sum & 1;
}

// Tスロット形状の検出：左受けTSD・右受けTSD・簡易TST
function countTSlotShapes(board: BitBoard): number {
  let count = 0;

  // 左受けTSD
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT - 3; y++) {
      const left = board.get(x, y) && board.get(x, y + 1) && board.get(x, y + 2);
      const center = !board.get(x + 1, y) && !board.get(x + 1, y + 1) && !board.get(x + 1, y + 2);
      const right = board.get(x + 2, y + 1) && board.get(x + 2, y + 2) && board.get(x + 2, y + 3);
      if (left && center && right) count++;
    }
  }

  // 右受けTSD
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT - 3; y++) {
      const left = board.get(x, y + 1) && board.get(x, y + 2) && board.get(x, y + 3);
      const center = !board.get(x + 1, y) && !board.get(x + 1, y + 1) && !board.get(x + 1, y + 2);
      const right = board.get(x + 2, y) && board.get(x + 2, y + 1) && board.get(x + 2, y + 2);
      if (left && center && right) count++;
    }
  }

  // 簡易TST
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT - 4; y++) {
      const left = board.get(x, y) && board.get(x, y + 1) && board.get(x, y + 2) && board.get(x, y + 3);
      const center = !board.get(x + 1, y) && !board.get(x + 1, y + 1) && !board.get(x + 1, y + 2) && !board.get(x + 1, y + 3);
      const right = board.get(x + 2, y + 2) && board.get(x + 2, y + 3) && board.get(x + 2, y + 4);
      if (left && center && right) count++;
    }
  }

  // T-spin Single (TSS) 地形の検出
  // 4方向それぞれで、T字の穴（中心+腕）が空いており、角が2つ以上埋まっている形
  for (let x = 0; x < BOARD_WIDTH - 2; x++) {
    for (let y = 0; y < BOARD_TOTAL_HEIGHT - 3; y++) {
      const empty = (px: number, py: number) => !board.get(px, py);
      const filled = (px: number, py: number) => board.get(px, py);

      const corners = [
        filled(x, y),
        filled(x + 2, y),
        filled(x, y + 2),
        filled(x + 2, y + 2),
      ].filter(Boolean).length;

      if (corners < 2) continue;

      // 上向き（Tが下向きに出現する形）
      if (
        empty(x, y + 1) &&
        empty(x + 1, y + 1) &&
        empty(x + 2, y + 1) &&
        empty(x + 1, y + 2)
      ) {
        count++;
      }

      // 下向き
      if (
        empty(x, y + 1) &&
        empty(x + 1, y + 1) &&
        empty(x + 2, y + 1) &&
        empty(x + 1, y)
      ) {
        count++;
      }

      // 右向き
      if (
        empty(x, y + 1) &&
        empty(x + 1, y) &&
        empty(x + 1, y + 1) &&
        empty(x + 1, y + 2)
      ) {
        count++;
      }

      // 左向き
      if (
        empty(x + 2, y + 1) &&
        empty(x + 1, y) &&
        empty(x + 1, y + 1) &&
        empty(x + 1, y + 2)
      ) {
        count++;
      }
    }
  }

  return count;
}
