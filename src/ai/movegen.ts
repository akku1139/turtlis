import type { MinoType, MinoState } from '../types.ts';
import { getMatrix, getPieceCells, spawnX, spawnY } from './pure.ts';
import { SRSPlusKickTable } from '../kicktable.ts';
import type { BitBoard } from './bitboard.ts';
import type { Placement } from './types.ts';

const kickTable = new SRSPlusKickTable();

// BFS ノードを数値にパックする
// 構成ビット: kick(3) | lar(1) | y(6) | x(4) | rot(2)
// visited 判定には kick ビットを除いた値を使う（元実装と同じ意味合い）
function packNode(rot: number, x: number, y: number, lar: number, kick: number): number {
  return (((((rot * 16 + (x + 2)) * 64 + y) * 2 + lar) * 8) + kick);
}

function nodeKey(packed: number): number {
  return packed & ~7; // kick ビットを除く
}

function dropPiece(board: BitBoard, cells: Int8Array, x: number, y: number): number {
  while (!board.collidesCells(cells, x, y + 1)) y++;
  return y;
}

export function generatePlacements(board: BitBoard, piece: MinoType): Placement[] {
  const result = new Map<number, Placement>();
  const visited = new Set<number>();
  const queue: number[] = [];

  const startX = spawnX(piece);
  let startY = spawnY(piece, 0);
  const startMatrix = getMatrix(piece, 0);

  // スポーン位置が埋まっていたら上へ退避
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

  queue.push(packNode(0, startX, startY, 0, 0));

  for (let qi = 0; qi < queue.length; qi++) {
    const packed = queue[qi];
    const vkey = nodeKey(packed);
    if (visited.has(vkey)) continue;
    visited.add(vkey);

    const sRot = ((packed >>> 14) & 3) as MinoState;
    const sX = ((packed >>> 10) & 15) - 2;
    const sY = (packed >>> 4) & 63;
    const sLAR = ((packed >>> 3) & 1) === 1;
    const sKick = packed & 7;

    const cells = getPieceCells(piece, sRot);
    const grounded = board.collidesCells(cells, sX, sY + 1);

    // 接地しているならロック候補
    if (grounded) {
      const key = packed;
      if (!result.has(key)) {
        result.set(key, {
          piece,
          rotation: sRot,
          x: sX,
          y: sY,
          matrix: getMatrix(piece, sRot),
          lastActionWasRotation: sLAR,
          lastKickIndex: sKick,
        });
      }
    } else {
      // ハードドロップによるロック候補（落下すると回転状態は解除）
      const y = dropPiece(board, cells, sX, sY);
      const hdKey = packNode(sRot, sX, y, 0, 0);
      if (!result.has(hdKey)) {
        result.set(hdKey, {
          piece,
          rotation: sRot,
          x: sX,
          y,
          matrix: getMatrix(piece, sRot),
          lastActionWasRotation: false,
          lastKickIndex: 0,
        });
      }

      // 1セル下へ移動（ソフトドロップ相当）
      queue.push(packNode(sRot, sX, sY + 1, 0, 0));
    }

    // 左右移動
    for (let dx = -1; dx <= 1; dx += 2) {
      const nx = sX + dx;
      if (!board.collidesCells(cells, nx, sY)) {
        queue.push(packNode(sRot, nx, sY, 0, 0));
      }
    }

    // 回転（Oミノ以外）
    if (piece !== 'O') {
      for (const dir of [1, 3, 2] as const) { // CW, CCW, 180
        const toRot = (sRot + dir) % 4 as MinoState;
        const kicks = kickTable.getKicks(piece, sRot, toRot);
        const rotCells = getPieceCells(piece, toRot);
        for (let i = 0; i < kicks.length; i++) {
          const testX = sX + kicks[i][0];
          const testY = sY - kicks[i][1];
          if (!board.collidesCells(rotCells, testX, testY)) {
            queue.push(packNode(toRot, testX, testY, 1, i));
            break; // この回転方向で最初に成功したキックのみ
          }
        }
      }
    }
  }

  return Array.from(result.values());
}
