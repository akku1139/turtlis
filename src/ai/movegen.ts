import type { MinoType, MinoState } from '../types.ts';
import { getMatrix, getPieceCells, spawnX, spawnY } from './pure.ts';
import { SRSPlusKickTable } from '../kicktable.ts';
import type { BitBoard } from './bitboard.ts';
import { BOARD_LO_BITS } from './bitboard.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';
import type { Placement } from './types.ts';

const kickTable = new SRSPlusKickTable();

/**
 * cold-clear 方式の衝突マップ。
 * 回転4種 × x 位置について「各 y に置けるか」の 40bit マスクを持ち、
 * obstructed(rot, x, y) を O(1) で判定できる。
 */
const CM_X_MIN = -2;
const CM_X_COUNT = 16; // x ∈ [-2, 13]

export class CollisionMaps {
  lo: Int32Array = new Int32Array(4 * CM_X_COUNT);
  hi: Int32Array = new Int32Array(4 * CM_X_COUNT);
  maxDy: Int32Array = new Int32Array(4);

  constructor(board: BitBoard, piece: MinoType) {
    for (let rot = 0; rot < 4; rot++) {
      const cells = getPieceCells(piece, rot as MinoState);
      const idxBase = rot * CM_X_COUNT;

      for (let ci = 0; ci < cells.length; ci += 2) {
        const dx = cells[ci];
        const dy = cells[ci + 1];
        if (dy > this.maxDy[rot]) this.maxDy[rot] = dy;
        for (let xi = 0; xi < CM_X_COUNT; xi++) {
          const x = xi + CM_X_MIN;
          const bx = x + dx;
          let cLo = 0;
          let cHi = 0;
          if (bx < 0 || bx >= BOARD_WIDTH) {
            cLo = -1; // 壁
            cHi = 0xff;
          } else {
            cLo = board.words[bx * 2];
            cHi = board.words[bx * 2 + 1];
          }
          // bit y = 元列の bit (y+dy)
          let rLo: number;
          let rHi: number;
          if (dy === 0) {
            rLo = cLo;
            rHi = cHi;
          } else if (dy > 0) {
            rLo = (cLo >>> dy) | (cHi << (BOARD_LO_BITS - dy));
            rHi = cHi >>> dy;
          } else {
            const k = -dy;
            rLo = cLo << k;
            rHi = ((cHi << k) | (cLo >>> (BOARD_LO_BITS - k))) & 0xff;
          }
          this.lo[idxBase + xi] |= rLo;
          this.hi[idxBase + xi] |= rHi;
        }
      }

      // y + maxDy >= BOARD_TOTAL_HEIGHT は床下衝突として埋める
      const fillMask = (0xff << Math.max(0, BOARD_TOTAL_HEIGHT - this.maxDy[rot] - BOARD_LO_BITS)) & 0xff;
      if (fillMask) {
        for (let xi = 0; xi < CM_X_COUNT; xi++) {
          this.hi[idxBase + xi] |= fillMask;
        }
      }
    }
  }

  obstructed(rot: number, x: number, y: number): boolean {
    if (y < 0 || y >= BOARD_TOTAL_HEIGHT) return true;
    const xi = x - CM_X_MIN;
    if (xi < 0 || xi >= CM_X_COUNT) return true;
    const idx = rot * CM_X_COUNT + xi;
    if (y < BOARD_LO_BITS) {
      return (this.lo[idx] & (1 << y)) !== 0;
    }
    return (this.hi[idx] & (1 << (y - BOARD_LO_BITS))) !== 0;
  }
}

interface WorkPos {
  rot: number;
  x: number;
  y: number;
  lar: boolean;
  kick: number;
}

function maxHeightOf(board: BitBoard): number {
  let maxH = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const lo = board.words[x * 2];
    const hi = board.words[x * 2 + 1];
    let topY = BOARD_TOTAL_HEIGHT;
    if (lo !== 0) topY = 31 - Math.clz32(lo & -lo);
    else if (hi !== 0) topY = BOARD_LO_BITS + (31 - Math.clz32(hi & -hi));
    const h = BOARD_TOTAL_HEIGHT - topY;
    if (h > maxH) maxH = h;
  }
  return maxH;
}

export function generatePlacements(board: BitBoard, piece: MinoType): Placement[] {
  const result = new Map<number, Placement>();
  const cm = new CollisionMaps(board, piece);

  const addPlacement = (
    rot: number, x: number, y: number, lar: boolean, kick: number,
  ): void => {
    const key = (((((rot * 16 + (x + 2)) * 64 + y) * 2 + (lar ? 1 : 0)) * 8) + kick);
    if (result.has(key)) return;
    result.set(key, {
      piece,
      rotation: rot as MinoState,
      x,
      y,
      matrix: getMatrix(piece, rot as MinoState),
      lastActionWasRotation: lar,
      lastKickIndex: kick,
    });
  };

  // スポーン位置（詰み時は上へ退避）
  const startX = spawnX(piece);
  let spawnTop = spawnY(piece, 0);
  {
    const cells0 = getPieceCells(piece, 0);
    if (board.collidesCells(cells0, startX, spawnTop)) {
      let found = false;
      for (let y = spawnTop - 1; y >= 0; y--) {
        if (!board.collidesCells(cells0, startX, y)) {
          spawnTop = y;
          found = true;
          break;
        }
      }
      if (!found) return [];
    }
  }

  // 高速パス: スタックが低ければ「着地位置から展開」する cc2 fast_mode 相当
  const fastMode = maxHeightOf(board) <= 20;

  const visited = new Set<number>();
  const work: WorkPos[] = [];

  const dropFrom = (rot: number, x: number, y: number): number => {
    let yy = y;
    while (!cm.obstructed(rot, x, yy + 1)) yy++;
    return yy;
  };

  const pushWork = (rot: number, x: number, y: number, lar: boolean): void => {
    // lar も含めて訪問管理（回転状態の違いでロック結果が変わるため）
    const key = ((rot * 16 + (x + 2)) * 64 + y) * 2 + (lar ? 1 : 0);
    if (visited.has(key)) return;
    visited.add(key);
    work.push({ rot, x, y, lar, kick: 0 });
  };

  if (fastMode) {
    // すべての (rot, x) について着地させ、そこから移動/回転を展開
    for (let rot = 0; rot < 4; rot++) {
      for (let x = CM_X_MIN; x < CM_X_MIN + CM_X_COUNT; x++) {
        if (cm.obstructed(rot, x, spawnTop)) continue;
        const ly = dropFrom(rot, x, spawnTop);
        pushWork(rot, x, ly, false);
        addPlacement(rot, x, ly, false, 0);
      }
    }
  } else {
    // 完全パス: スポーンから全 y を BFS（ソフトドロップ相当の移動を含む）
    pushWork(0, startX, spawnTop, false);
  }

  for (let wi = 0; wi < work.length; wi++) {
    const { rot, x, y, lar, kick } = work[wi];

    const grounded = cm.obstructed(rot, x, y + 1);
    if (grounded) {
      addPlacement(rot, x, y, lar, kick);
    } else {
      const ly = dropFrom(rot, x, y);
      addPlacement(rot, x, ly, false, 0);
      // 着地点からさらに展開を続ける（回転→ドロップ→回転などの連鎖のため）
      pushWork(rot, x, ly, false);
      // 中間 y への移動（ソフトドロップ途中の操作を再現）
      pushWork(rot, x, y + 1, false);
    }

    // 左右移動（現在の y で）
    if (!cm.obstructed(rot, x - 1, y)) pushWork(rot, x - 1, y, false);
    if (!cm.obstructed(rot, x + 1, y)) pushWork(rot, x + 1, y, false);

    // 回転
    if (piece !== 'O') {
      for (const dir of [1, 3, 2] as const) {
        const toRot = (rot + dir) % 4;
        const kicks = kickTable.getKicks(piece, rot as MinoState, toRot as MinoState);
        for (let i = 0; i < kicks.length; i++) {
          const testX = x + kicks[i][0];
          const testY = y - kicks[i][1];
          if (!cm.obstructed(toRot, testX, testY)) {
            // 回転直後に接地していればキック番号を保持したロック候補
            if (cm.obstructed(toRot, testX, testY + 1)) {
              addPlacement(toRot, testX, testY, true, i);
            }
            pushWork(toRot, testX, testY, true);
            break;
          }
        }
      }
    }
  }

  return Array.from(result.values());
}
