import type { MinoType, MinoState } from '../types.ts';
import { getMatrix, spawnX, spawnY } from './pure.ts';
import type { BitBoard } from './bitboard.ts';
import type { Placement } from './types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';
import { SRSPlusKickTable } from '../kicktable.ts';

const kickTable = new SRSPlusKickTable();

function getMaxStackHeight(board: BitBoard): number {
  let max = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let col = board.cols[x];
    let y = 0;
    while (col !== 0n && y < BOARD_TOTAL_HEIGHT) {
      if (col & 1n) {
        max = Math.max(max, BOARD_TOTAL_HEIGHT - y);
        break;
      }
      col >>= 1n;
      y++;
    }
  }
  return max;
}

function dropPiece(board: BitBoard, matrix: number[][], x: number, y: number): number {
  while (!board.collides(matrix, x, y + 1)) y++;
  return y;
}

function isGrounded(board: BitBoard, matrix: number[][], x: number, y: number): boolean {
  return board.collides(matrix, x, y + 1);
}

function rotateAt(
  board: BitBoard,
  piece: MinoType,
  fromRot: MinoState,
  dir: 'CW' | 'CCW' | '180',
  x: number,
  y: number,
): {
  x: number;
  y: number;
  rotation: MinoState;
  matrix: number[][];
  lastKickIndex: number;
} | null {
  const toRot = (fromRot + (dir === 'CW' ? 1 : dir === 'CCW' ? 3 : 2)) % 4 as MinoState;
  const kicks = kickTable.getKicks(piece, fromRot, toRot);
  const matrix = getMatrix(piece, toRot);

  for (let i = 0; i < kicks.length; i++) {
    const [dx, dy] = kicks[i];
    const testX = x + dx;
    const testY = y - dy;
    if (!board.collides(matrix, testX, testY)) {
      return { x: testX, y: testY, rotation: toRot, matrix, lastKickIndex: i };
    }
  }
  return null;
}

function addUnique(map: Map<string, Placement>, p: Placement) {
  const key = `${p.piece}|${p.rotation}|${p.x}|${p.y}|${p.lastActionWasRotation}|${p.lastKickIndex}`;
  if (!map.has(key)) map.set(key, p);
}

function generateOPlacements(board: BitBoard): Placement[] {
  const matrix = getMatrix('O', 0);
  const sy = spawnY('O', 0);
  const result: Placement[] = [];
  for (let x = 0; x <= 8; x++) {
    if (board.collides(matrix, x, sy)) continue;
    const y = dropPiece(board, matrix, x, sy);
    result.push({
      piece: 'O',
      rotation: 0,
      x,
      y,
      matrix,
      lastActionWasRotation: false,
      lastKickIndex: 0,
    });
  }
  return result;
}

function generateNonOPlacements(board: BitBoard, piece: MinoType): Placement[] {
  const result = new Map<string, Placement>();

  // 直接落下（全回転・全 x）
  for (let rotation = 0 as MinoState; rotation < 4; rotation++) {
    const matrix = getMatrix(piece, rotation);
    const sy = spawnY(piece, rotation);
    for (let x = -3; x <= BOARD_WIDTH + 2; x++) {
      if (board.collides(matrix, x, sy)) continue;
      const y = dropPiece(board, matrix, x, sy);
      addUnique(result, {
        piece,
        rotation,
        x,
        y,
        matrix,
        lastActionWasRotation: false,
        lastKickIndex: 0,
      });
    }
  }

  // 接地位置での回転によるスピン配置を生成
  const directDrops = Array.from(result.values());
  for (const base of directDrops) {
    for (const dir of ['CW', 'CCW', '180'] as const) {
      const rotated = rotateAt(board, piece, base.rotation, dir, base.x, base.y);
      if (!rotated) continue;

      // 回転後に浮いていれば実際は落下してスピンが消えるため、接地している場合のみ採用
      if (!isGrounded(board, rotated.matrix, rotated.x, rotated.y)) continue;

      addUnique(result, {
        piece,
        rotation: rotated.rotation,
        x: rotated.x,
        y: rotated.y,
        matrix: rotated.matrix,
        lastActionWasRotation: true,
        lastKickIndex: rotated.lastKickIndex,
      });
    }
  }

  return Array.from(result.values());
}

export function generatePlacements(board: BitBoard, piece: MinoType): Placement[] {
  if (piece === 'O') {
    return generateOPlacements(board);
  }
  return generateNonOPlacements(board, piece);
}

export function generatePlacementsFast(board: BitBoard, piece: MinoType): Placement[] {
  return generatePlacements(board, piece);
}
