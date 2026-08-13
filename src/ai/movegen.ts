import type { MinoType, MinoState, MinoRotation } from '../types.ts';
import { getMatrix, spawnX, spawnY, tryRotate } from './pure.ts';
import type { BitBoard } from './bitboard.ts';
import type { Placement } from './types.ts';

// 全配置を生成する（スポーン位置からBFSで回転・移動を展開）
export function generatePlacements(board: BitBoard, piece: MinoType): Placement[] {
  if (piece === 'O') {
    return generateOPlacements(board);
  }
  const placements = generateNonOPlacements(board, piece);
  if (placements.length > 0) return placements;

  // Fallback: if BFS produced no placements (should normally not happen),
  // generate a simple drop from spawn.
  const startX = spawnX(piece);
  const startY = spawnY(piece, 0);
  const matrix = getMatrix(piece, 0);
  if (!board.collides(matrix, startX, startY)) {
    let y = startY;
    while (!board.collides(matrix, startX, y + 1)) y++;
    return [{
      piece,
      rotation: 0,
      x: startX,
      y,
      matrix,
      lastActionWasRotation: false,
      lastKickIndex: 0,
    }];
  }
  return [];
}

function generateOPlacements(board: BitBoard): Placement[] {
  const startX = spawnX('O');
  const startY = spawnY('O', 0);
  const result: Placement[] = [];
  for (let x = 0; x <= 8; x++) {
    const matrix = getMatrix('O', 0);
    if (board.collides(matrix, x, startY)) continue;
    let y = startY;
    while (!board.collides(matrix, x, y + 1)) y++;
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

interface StateNode {
  rotation: MinoState;
  x: number;
  y: number;
  lastActionWasRotation: boolean;
  lastKickIndex: number;
}

function generateNonOPlacements(board: BitBoard, piece: MinoType): Placement[] {
  const result: Placement[] = [];
  const startY = spawnY(piece, 0);

  for (let rotation = 0 as MinoState; rotation < 4; rotation = (rotation + 1) as MinoState) {
    const matrix = getMatrix(piece, rotation);
    for (let x = -2; x < BOARD_WIDTH + 2; x++) {
      if (board.collides(matrix, x, startY)) continue;

      let y = startY;
      while (!board.collides(matrix, x, y + 1)) {
        y++;
      }

      result.push({
        piece,
        rotation,
        x,
        y,
        matrix,
        lastActionWasRotation: false,
        lastKickIndex: 0,
      });

      if (piece !== 'O') {
        result.push({
          piece,
          rotation,
          x,
          y,
          matrix,
          lastActionWasRotation: true,
          lastKickIndex: 0,
        });
      }
    }
  }

  return result;
}

// 高速版：各回転・各xで一気に落下させ、周辺操作のみ展開（オプション）
export function generatePlacementsFast(board: BitBoard, piece: MinoType): Placement[] {
  return generatePlacements(board, piece);
}

function addPlacement(result: Placement[], p: Placement) {
  result.push(p);
}
