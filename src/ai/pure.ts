import type { MinoType, MinoState, MinoRotation } from '../types.ts';
import { MINOS, BOARD_HIDDEN_HEIGHT, BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';
import { Tetromino } from '../tetromino.ts';
import { SRSPlusKickTable } from '../kicktable.ts';
import type { BitBoard } from './bitboard.ts';
import type { Placement } from './types.ts';

const kickTable = new SRSPlusKickTable();

// 事前計算した回転行列キャッシュ
const matrixCache: Map<string, number[][]> = new Map();

function getCachedMatrix(piece: MinoType, rotation: MinoState): number[][] {
  const key = `${piece}-${rotation}`;
  let cached = matrixCache.get(key);
  if (cached) return cached;

  const tetro = new Tetromino(piece);
  let matrix = tetro.matrix;
  if (rotation !== 0) {
    const dirMap: Record<MinoState, MinoRotation | null> = {
      0: null,
      1: 'CW',
      2: '180',
      3: 'CCW',
    };
    const dir = dirMap[rotation];
    if (dir) {
      matrix = tetro.getRotatedMatrix(dir);
    }
  }
  matrixCache.set(key, matrix);
  return matrix;
}

export function spawnX(piece: MinoType): number {
  return piece === 'O' ? 4 : 3;
}

export function spawnY(piece: MinoType, rotation: MinoState): number {
  const matrix = getMatrix(piece, rotation);
  let maxRow = 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[0].length; c++) {
      if (matrix[r][c]) maxRow = Math.max(maxRow, r);
    }
  }
  return (BOARD_HIDDEN_HEIGHT - 2) - maxRow;
}

export function getMatrix(piece: MinoType, rotation: MinoState): number[][] {
  return getCachedMatrix(piece, rotation);
}

export function tryRotate(
  board: BitBoard,
  piece: MinoType,
  fromRot: MinoState,
  dir: MinoRotation,
  x: number,
  y: number,
): { toRot: MinoState; x: number; y: number; kickIndex: number } | null {
  const toRot = (fromRot + (dir === 'CW' ? 1 : dir === 'CCW' ? 3 : 2)) % 4 as MinoState;
  const kicks = kickTable.getKicks(piece, fromRot, toRot);
  const newMatrix = getMatrix(piece, toRot);
  for (let i = 0; i < kicks.length; i++) {
    const [dx, dy] = kicks[i];
    const testX = x + dx;
    const testY = y - dy;
    if (!board.collides(newMatrix, testX, testY)) {
      return { toRot, x: testX, y: testY, kickIndex: i };
    }
  }
  return null;
}

export function detectTSpin(
  board: BitBoard,
  p: Placement,
): { isSpin: boolean; isMini: boolean } {
  if (p.piece !== 'T' || !p.lastActionWasRotation) {
    return { isSpin: false, isMini: false };
  }

  const cx = p.x + 1;
  const cy = p.y + 1;

  const corners = [
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: 1 },
  ];

  const facingMap: Record<number, { dx: number; dy: number }[]> = {
    0: [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }],
    1: [{ dx: 1, dy: -1 }, { dx: 1, dy: 1 }],
    2: [{ dx: 1, dy: 1 }, { dx: -1, dy: 1 }],
    3: [{ dx: -1, dy: 1 }, { dx: -1, dy: -1 }],
  };
  const facing = facingMap[p.rotation];

  let occupied = 0;
  let facingOccupied = 0;

  for (const c of corners) {
    const px = cx + c.dx;
    const py = cy + c.dy;
    if (
      px < 0 || px >= BOARD_WIDTH || py >= BOARD_TOTAL_HEIGHT ||
      (py >= 0 && board.get(px, py))
    ) {
      occupied++;
      if (facing.some((f) => f.dx === c.dx && f.dy === c.dy)) {
        facingOccupied++;
      }
    }
  }

  const isImmobile =
    board.collides(p.matrix, p.x - 1, p.y) &&
    board.collides(p.matrix, p.x + 1, p.y) &&
    board.collides(p.matrix, p.x, p.y - 1) &&
    board.collides(p.matrix, p.x, p.y + 1);

  if (occupied < 3) {
    if (isImmobile) {
      return { isSpin: true, isMini: true };
    }
    return { isSpin: false, isMini: false };
  }

  let isMini = facingOccupied < 2;
  if (p.lastKickIndex === 4) {
    isMini = false;
  }

  return { isSpin: true, isMini };
}

export function detectOtherSpin(board: BitBoard, p: Placement): boolean {
  if (p.piece === 'T' || p.piece === 'O') return false;
  if (!p.lastActionWasRotation) return false;

  return (
    board.collides(p.matrix, p.x - 1, p.y) &&
    board.collides(p.matrix, p.x + 1, p.y) &&
    board.collides(p.matrix, p.x, p.y - 1) &&
    board.collides(p.matrix, p.x, p.y + 1)
  );
}

export interface LockResult {
  cleared: number;
  isAllClear: boolean;
  scoreGained: number;
  totalAttack: number;
  newComboCount: number;
  newDifficultClearCount: number;
  isSpinAction: boolean;
}

export function simulateLock(
  board: BitBoard,
  p: Placement,
  comboCount: number,
  difficultClearCount: number,
  level: number,
): { result: LockResult; nextBoard: BitBoard } {
  const tSpin = detectTSpin(board, p);
  const otherSpin = !tSpin.isSpin ? detectOtherSpin(board, p) : false;

  const nextBoard = board.clone();
  nextBoard.merge(p.matrix, p.x, p.y);
  const cleared = nextBoard.clearLines();
  const isAllClear = nextBoard.isEmpty();

  const isSpinAction = tSpin.isSpin || otherSpin;
  const isQuad = cleared === 4;

  let scoreGained = 0;
  let baseAttack = 0;

  if (tSpin.isSpin) {
    if (tSpin.isMini) {
      if (cleared === 0) { scoreGained = 100 * level; baseAttack = 0; }
      else if (cleared === 1) { scoreGained = 200 * level; baseAttack = 0; }
      else if (cleared === 2) { scoreGained = 400 * level; baseAttack = 1; }
      else if (cleared === 3) { scoreGained = 1600 * level; baseAttack = 6; }
    } else {
      if (cleared === 0) { scoreGained = 400 * level; baseAttack = 0; }
      else if (cleared === 1) { scoreGained = 800 * level; baseAttack = 2; }
      else if (cleared === 2) { scoreGained = 1200 * level; baseAttack = 4; }
      else if (cleared === 3) { scoreGained = 1600 * level; baseAttack = 6; }
    }
  } else if (otherSpin) {
    if (cleared === 0) { scoreGained = 100 * level; baseAttack = 0; }
    else if (cleared === 1) { scoreGained = 200 * level; baseAttack = 0; }
    else if (cleared === 2) { scoreGained = 400 * level; baseAttack = 1; }
  } else {
    if (cleared === 1) { scoreGained = 100 * level; baseAttack = 0; }
    else if (cleared === 2) { scoreGained = 300 * level; baseAttack = 1; }
    else if (cleared === 3) { scoreGained = 500 * level; baseAttack = 2; }
    else if (cleared === 4) { scoreGained = 800 * level; baseAttack = 4; }
  }

  const previousB2BCount = difficultClearCount > 1 ? difficultClearCount - 1 : 0;
  let b2bBreakBonus = 0;
  let newDifficultClearCount = difficultClearCount;
  let newComboCount = comboCount;

  if (cleared > 0) {
    if (isQuad || isSpinAction) {
      newDifficultClearCount++;
    } else {
      if (previousB2BCount >= 4) {
        b2bBreakBonus = previousB2BCount;
      }
      newDifficultClearCount = 0;
    }

    if (newDifficultClearCount > 1) {
      scoreGained = Math.floor(scoreGained * 1.5);
    }

    newComboCount++;
    if (newComboCount > 1) {
      scoreGained += 50 * (newComboCount - 1) * level;
    }
  } else {
    newComboCount = 0;
  }

  const b2bBonus = (cleared > 0 && (isQuad || isSpinAction) && newDifficultClearCount > 1) ? 1 : 0;
  let base = baseAttack + b2bBonus + b2bBreakBonus;

  if (isAllClear && cleared > 0) {
    base += 5;
    if (newDifficultClearCount <= 1) {
      newDifficultClearCount = 2;
    } else {
      newDifficultClearCount += 2;
    }
  }

  let totalAttack = 0;
  if (cleared > 0) {
    const x = newComboCount - 1;
    if (base === 0) {
      if (x >= 2) totalAttack = Math.floor(Math.log(1 + 1.25 * x));
    } else {
      totalAttack = Math.floor(base * (1 + 0.25 * x));
    }
  }

  return {
    result: {
      cleared,
      isAllClear,
      scoreGained,
      totalAttack,
      newComboCount,
      newDifficultClearCount,
      isSpinAction,
    },
    nextBoard,
  };
}

export function simulateHold(
  current: MinoType,
  hold: MinoType | null,
  bag: MinoType[],
): { newCurrent: MinoType; newHold: MinoType | null; newBag: MinoType[] } {
  const newBag = bag.slice();
  if (hold === null) {
    const next = newBag.shift();
    if (!next) throw new Error('Bag exhausted in simulateHold');
    return { newCurrent: next, newHold: current, newBag };
  } else {
    return { newCurrent: hold, newHold: current, newBag };
  }
}
