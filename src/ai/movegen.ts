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
  const startX = spawnX(piece);
  const startRot: MinoState = 0;
  const startY = spawnY(piece, startRot);
  const startMatrix = getMatrix(piece, startRot);
  if (board.collides(startMatrix, startX, startY)) return [];

  const queue: StateNode[] = [{
    rotation: startRot,
    x: startX,
    y: startY,
    lastActionWasRotation: false,
    lastKickIndex: 0,
  }];

  const visited = new Set<string>();
  const result: Placement[] = [];
  const resultMap = new Map<string, Placement>();

  while (queue.length > 0) {
    const cur = queue.pop()!;
    const key = `${cur.rotation},${cur.x},${cur.y},${cur.lastActionWasRotation},${cur.lastKickIndex}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // 接地位置
    let gy = cur.y;
    const matrix = getMatrix(piece, cur.rotation);
    while (!board.collides(matrix, cur.x, gy + 1)) gy++;

    const placement: Placement = {
      piece,
      rotation: cur.rotation,
      x: cur.x,
      y: gy,
      matrix,
      lastActionWasRotation: cur.lastActionWasRotation,
      lastKickIndex: cur.lastKickIndex,
    };

    const pKey = `${piece},${cur.rotation},${cur.x},${gy},${cur.lastActionWasRotation},${cur.lastKickIndex}`;
    if (!resultMap.has(pKey)) {
      resultMap.set(pKey, placement);
      result.push(placement);
    }

    // 左右移動
    for (const dx of [-1, 1]) {
      const nx = cur.x + dx;
      if (!board.collides(matrix, nx, cur.y)) {
        queue.push({
          rotation: cur.rotation,
          x: nx,
          y: cur.y,
          lastActionWasRotation: false,
          lastKickIndex: 0,
        });
      }
    }

    // 回転（CW / CCW / 180）
    if (piece === 'O') continue;
    for (const dir of ['CW', 'CCW', '180'] as MinoRotation[]) {
      const rotated = tryRotate(board, piece, cur.rotation, dir, cur.x, cur.y);
      if (rotated) {
        queue.push({
          rotation: rotated.toRot,
          x: rotated.x,
          y: rotated.y,
          lastActionWasRotation: true,
          lastKickIndex: rotated.kickIndex,
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
