import type { MinoType } from '../types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';

/**
 * 列ごとにビットで盤面を保持する高速ビットボード。
 * 1列 = 40bit を 32bit(lo) + 8bit(hi) の2つの整数で表現する。
 * bit y はグリッド行 y（0 = 最上部 / 隠し領域先頭, 39 = 最下部）に対応する。
 * 行 y が埋まっている = 全列の bit y が立っている。
 */

export const BOARD_LO_BITS = 32;

export class BitBoard {
  /** [x*2]=lo(bits 0..31), [x*2+1]=hi(bits 32..39) */
  words: Uint32Array;
  /** ハッシュのメモ化（ミューテーション時に無効化） */
  private hashCache: string | null = null;

  constructor(words?: Uint32Array) {
    this.words = words ?? new Uint32Array(BOARD_WIDTH * 2);
  }

  static fromGrid(grid: (MinoType | null)[][]): BitBoard {
    const b = new BitBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) {
      let lo = 0;
      let hi = 0;
      for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
        if (grid[y][x] !== null) {
          if (y < BOARD_LO_BITS) lo |= 1 << y;
          else hi |= 1 << (y - BOARD_LO_BITS);
        }
      }
      b.words[x * 2] = lo >>> 0;
      b.words[x * 2 + 1] = hi >>> 0;
    }
    return b;
  }

  toGrid(): (MinoType | null)[][] {
    const grid: (MinoType | null)[][] = Array.from({ length: BOARD_TOTAL_HEIGHT }, () =>
      Array(BOARD_WIDTH).fill(null)
    );
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const lo = this.words[x * 2];
      const hi = this.words[x * 2 + 1];
      for (let y = 0; y < BOARD_LO_BITS; y++) {
        if (lo & (1 << y)) grid[y][x] = 'I';
      }
      for (let y = BOARD_LO_BITS; y < BOARD_TOTAL_HEIGHT; y++) {
        if (hi & (1 << (y - BOARD_LO_BITS))) grid[y][x] = 'I';
      }
    }
    return grid;
  }

  clone(): BitBoard {
    return new BitBoard(this.words.slice());
  }

  /** 高速な衝突判定（[dx,dy, ...] 形式のセルリスト使用） */
  collidesCells(cells: Int8Array, x: number, y: number): boolean {
    for (let i = 0; i < cells.length; i += 2) {
      const boardX = x + cells[i];
      if (boardX < 0 || boardX >= BOARD_WIDTH) return true;
      const boardY = y + cells[i + 1];
      if (boardY >= BOARD_TOTAL_HEIGHT) return true;
      if (boardY < 0) continue;
      if (boardY < BOARD_LO_BITS) {
        if (this.words[boardX * 2] & (1 << boardY)) return true;
      } else if (this.words[boardX * 2 + 1] & (1 << (boardY - BOARD_LO_BITS))) {
        return true;
      }
    }
    return false;
  }

  collides(matrix: number[][], x: number, y: number): boolean {
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      const row = matrix[r];
      for (let c = 0; c < n; c++) {
        if (!row[c]) continue;
        const boardX = x + c;
        if (boardX < 0 || boardX >= BOARD_WIDTH) return true;
        const boardY = y + r;
        if (boardY >= BOARD_TOTAL_HEIGHT) return true;
        if (boardY < 0) continue;
        if (boardY < BOARD_LO_BITS) {
          if (this.words[boardX * 2] & (1 << boardY)) return true;
        } else if (this.words[boardX * 2 + 1] & (1 << (boardY - BOARD_LO_BITS))) {
          return true;
        }
      }
    }
    return false;
  }

  set(x: number, y: number) {
    this.hashCache = null;
    if (y < 0 || y >= BOARD_TOTAL_HEIGHT || x < 0 || x >= BOARD_WIDTH) return;
    if (y < BOARD_LO_BITS) {
      this.words[x * 2] |= (1 << y);
    } else {
      this.words[x * 2 + 1] |= (1 << (y - BOARD_LO_BITS));
    }
  }

  merge(matrix: number[][], x: number, y: number) {
    this.hashCache = null;
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      const row = matrix[r];
      for (let c = 0; c < n; c++) {
        if (!row[c]) continue;
        const boardX = x + c;
        const boardY = y + r;
        if (boardY >= 0 && boardY < BOARD_TOTAL_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
          if (boardY < BOARD_LO_BITS) {
            this.words[boardX * 2] |= (1 << boardY);
          } else {
            this.words[boardX * 2 + 1] |= (1 << (boardY - BOARD_LO_BITS));
          }
        }
      }
    }
  }

  mergeCells(cells: Int8Array, x: number, y: number) {
    this.hashCache = null;
    for (let i = 0; i < cells.length; i += 2) {
      const boardX = x + cells[i];
      const boardY = y + cells[i + 1];
      if (boardY >= 0 && boardY < BOARD_TOTAL_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
        if (boardY < BOARD_LO_BITS) {
          this.words[boardX * 2] |= (1 << boardY);
        } else {
          this.words[boardX * 2 + 1] |= (1 << (boardY - BOARD_LO_BITS));
        }
      }
    }
  }

  get(x: number, y: number): boolean {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_TOTAL_HEIGHT) return true;
    if (y < BOARD_LO_BITS) {
      return (this.words[x * 2] & (1 << y)) !== 0;
    }
    return (this.words[x * 2 + 1] & (1 << (y - BOARD_LO_BITS))) !== 0;
  }

  /**
   * 完全に埋まった行を消去する。
   * 消去行より上（インデックスが小さい側）のブロックは下へ落ちる（インデックス +1）。
   * 戻り値は消去した行数。
   */
  clearLines(): number {
    this.hashCache = null;
    let maskLo = -1; // 0xFFFFFFFF
    let maskHi = 0xff;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      maskLo &= this.words[x * 2];
      maskHi &= this.words[x * 2 + 1];
    }
    if (maskLo === 0 && maskHi === 0) return 0;

    const linesCleared = popcount32(maskLo) + popcount32(maskHi);

    for (let x = 0; x < BOARD_WIDTH; x++) {
      const lo = this.words[x * 2];
      const hi = this.words[x * 2 + 1];
      let newLo = 0;
      let newHi = 0;

      // hi 側（行32..39）から処理: 下（大きなインデックス）の消去行を数えながら詰める
      let shiftHi = 0;
      for (let b = 7; b >= 0; b--) {
        if (maskHi & (1 << b)) {
          shiftHi++;
          continue;
        }
        if (hi & (1 << b)) {
          const t = b + shiftHi;
          if (t < 8) newHi |= 1 << t; // t >= 8 は盤面外（トップアウト分）なので破棄
        }
      }

      // lo 側（行0..31）: ベースシフトとして hi 側の消去行数を加算
      let shift = popcount32(maskHi);
      for (let b = 31; b >= 0; b--) {
        if (maskLo & (1 << b)) {
          shift++;
          continue;
        }
        if (lo & (1 << b)) {
          const t = b + shift;
          if (t < 32) newLo |= 1 << t;
          else newHi |= 1 << (t - 32);
        }
      }

      this.words[x * 2] = newLo >>> 0;
      this.words[x * 2 + 1] = newHi >>> 0;
    }
    return linesCleared;
  }

  isEmpty(): boolean {
    for (let i = 0; i < this.words.length; i++) {
      if (this.words[i] !== 0) return false;
    }
    return true;
  }

  /** キャッシュ用ハッシュキー（128bit 相当の FNV 風ミックス） */
  hash(): string {
    if (this.hashCache !== null) return this.hashCache;
    let h0 = 0x9e3779b9 | 0;
    let h1 = 0x85ebca6b | 0;
    let h2 = 0xc2b2ae35 | 0;
    let h3 = 0x27d4eb2f | 0;
    for (let i = 0; i < this.words.length; i++) {
      const w = this.words[i] | 0;
      h0 = Math.imul(h0 ^ w, 0x85ebca6b) ^ (h0 >>> 13);
      h1 = Math.imul(h1 ^ w, 0xc2b2ae35) ^ (h1 >>> 15);
      h2 = Math.imul(h2 + w, 0x27d4eb2f) ^ (h2 >>> 11);
      h3 = (Math.imul(h3, 31) + w) | 0;
    }
    h0 ^= h1 >>> 16;
    h2 ^= h3 >>> 16;
    this.hashCache = `${(h0 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${(h3 >>> 0).toString(36)}`;
    return this.hashCache;
  }

  /** 各列の高さ（40 - 最上位ブロックの行インデックス）を out に書き込む */
  columnHeights(out: number[]): number[] {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const lo = this.words[x * 2];
      const hi = this.words[x * 2 + 1];
      if (lo !== 0) {
        // 最下位セットビット = 最上行（インデックス最小）
        out[x] = BOARD_TOTAL_HEIGHT - (31 - Math.clz32(lo & -lo));
      } else if (hi !== 0) {
        out[x] = BOARD_TOTAL_HEIGHT - (32 + (31 - Math.clz32(hi & -hi)));
      } else {
        out[x] = 0;
      }
    }
    return out;
  }
}

function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(v, 0x01010101) >>> 24);
}

export type { MinoType };
