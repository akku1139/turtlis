import type { MinoType, MinoState } from '../types.ts';
import { getMatrix, spawnX, spawnY } from './pure.ts';
import { SRSPlusKickTable } from '../kicktable.ts';
import type { BitBoard } from './bitboard.ts';
import type { Placement } from './types.ts';

const kickTable = new SRSPlusKickTable();

interface BFSNode {
  rot: MinoState;
  x: number;
  y: number;
  lastActionWasRotation: boolean;
  lastKickIndex: number;
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
): { x: number; y: number; rotation: MinoState; matrix: number[][]; lastKickIndex: number } | null {
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

function addPlacement(map: Map<string, Placement>, p: Placement) {
  const key = `${p.piece}|${p.rotation}|${p.x}|${p.y}|${p.lastActionWasRotation}|${p.lastKickIndex}`;
  if (!map.has(key)) map.set(key, p);
}

export function generatePlacements(board: BitBoard, piece: MinoType): Placement[] {
  const result = new Map<string, Placement>();
  const visited = new Set<string>();
  const queue: BFSNode[] = [];

  const startX = spawnX(piece);
  let startY = spawnY(piece, 0);
  const startMatrix = getMatrix(piece, 0);

  // スポーン位置が埋まっていたら上へ退避（ゲーム本体の処理に合わせる）
  if (board.collides(startMatrix, startX, startY)) {
    let found = false;
    for (let y = startY - 1; y >= 0; y--) {
      if (!board.collides(startMatrix, startX, y)) {
        startY = y;
        found = true;
        break;
      }
    }
    if (!found) return [];
  }

  queue.push({
    rot: 0,
    x: startX,
    y: startY,
    lastActionWasRotation: false,
    lastKickIndex: 0,
  });

  while (queue.length > 0) {
    const s = queue.shift()!;
    const key = `${s.rot}|${s.x}|${s.y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const matrix = getMatrix(piece, s.rot);
    const grounded = isGrounded(board, matrix, s.x, s.y);

    // 接地しているなら、そのままロック候補にする
    if (grounded) {
      addPlacement(result, {
        piece,
        rotation: s.rot,
        x: s.x,
        y: s.y,
        matrix,
        lastActionWasRotation: s.lastActionWasRotation,
        lastKickIndex: s.lastKickIndex,
      });
    }

    // 空中ならハードドロップした配置も通常ロック候補にする
    if (!grounded) {
      const y = dropPiece(board, matrix, s.x, s.y);
      addPlacement(result, {
        piece,
        rotation: s.rot,
        x: s.x,
        y,
        matrix,
        lastActionWasRotation: false, // 落下すると回転状態はリセットされる
        lastKickIndex: 0,
      });
    }

    // 左右移動
    for (const dx of [-1, 1]) {
      const nx = s.x + dx;
      if (!board.collides(matrix, nx, s.y)) {
        queue.push({
          rot: s.rot,
          x: nx,
          y: s.y,
          lastActionWasRotation: false,
          lastKickIndex: 0,
        });
      }
    }

    // 回転（Oミノ以外）
    if (piece !== 'O') {
      for (const dir of ['CW', 'CCW', '180'] as const) {
        const r = rotateAt(board, piece, s.rot, dir, s.x, s.y);
        if (r) {
          queue.push({
            rot: r.rotation,
            x: r.x,
            y: r.y,
            lastActionWasRotation: true,
            lastKickIndex: r.lastKickIndex,
          });
        }
      }
    }
  }

  return Array.from(result.values());
}
