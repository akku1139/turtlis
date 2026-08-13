import type { MinoType, MinoMatrix, MinoState } from '../types.ts';
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT } from '../constants.ts';

// 列ごとに64bit整数で盤面を保持する高速ビットボード
export class BitBoard {
  cols: BigUint64Array;

  constructor(cols?: BigUint64Array) {
    this.cols = cols ?? new BigUint64Array(BOARD_WIDTH);
  }

  static fromGrid(grid: (MinoType | null)[][]): BitBoard {
    const cols = new BigUint64Array(BOARD_WIDTH);
    for (let x = 0; x < BOARD_WIDTH; x++) {
      let col = 0n;
      for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
        if (grid[y][x] !== null) {
          col |= 1n << BigInt(y);
        }
      }
      cols[x] = col;
    }
    return new BitBoard(cols);
  }

  toGrid(): (MinoType | null)[][] {
    const grid: (MinoType | null)[][] = Array.from({ length: BOARD_TOTAL_HEIGHT }, () =>
      Array(BOARD_WIDTH).fill(null)
    );
    // 注意: 元の盤面は色情報が必要だが、ここでは仮に 'I' を入れる
    // AIでは必要性が低いため、色は省略し、非nullなら 'I' とする
    // 実際の描画には使わないこと
    for (let x = 0; x < BOARD_WIDTH; x++) {
      let col = this.cols[x];
      for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
        if (col & 1n) {
          grid[y][x] = 'I';
        }
        col >>= 1n;
      }
    }
    return grid;
  }

  clone(): BitBoard {
    return new BitBoard(this.cols.slice());
  }

  hash(): bigint {
    let h = 0x9E3779B97F4A7C15n;
    for (let i = 0; i < this.cols.length; i++) {
      h ^= this.cols[i] * 0xBF58476D1CE4E5B9n;
      h = (h << 5n) | (h >> 59n);
    }
    return h;
  }

  collides(matrix: MinoMatrix, x: number, y: number): boolean {
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r][c]) continue;
        const boardX = x + c;
        const boardY = y + r;
        if (boardX < 0 || boardX >= BOARD_WIDTH || boardY < 0 || boardY >= BOARD_TOTAL_HEIGHT) {
          return true;
        }
        if (boardY >= 0 && (this.cols[boardX] & (1n << BigInt(boardY))) !== 0n) {
          return true;
        }
      }
    }
    return false;
  }

  merge(matrix: MinoMatrix, x: number, y: number) {
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r][c]) continue;
        const boardX = x + c;
        const boardY = y + r;
        if (boardY >= 0 && boardY < BOARD_TOTAL_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
          this.cols[boardX] |= 1n << BigInt(boardY);
        }
      }
    }
  }

  clearLines(): number {
    // 全列で共通して立っているビットが完全な行
    let fullRows = this.cols[0];
    for (let i = 1; i < BOARD_WIDTH; i++) {
      fullRows &= this.cols[i];
    }
    if (fullRows === 0n) return 0;

    const linesCleared = popcount64(fullRows);

    for (let i = 0; i < BOARD_WIDTH; i++) {
      this.cols[i] = removeLines(this.cols[i], fullRows);
    }
    return linesCleared;
  }

  isEmpty(): boolean {
    return this.cols.every((c) => c === 0n);
  }

  get(x: number, y: number): boolean {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_TOTAL_HEIGHT) return true;
    return (this.cols[x] & (1n << BigInt(y))) !== 0n;
  }
}

function popcount64(v: bigint): number {
  let count = 0;
  while (v !== 0n) {
    v &= v - 1n;
    count++;
  }
  return count;
}

function removeLines(col: bigint, lines: bigint): bigint {
  let result = 0n;
  let shift = 0n;
  for (let y = BOARD_TOTAL_HEIGHT - 1; y >= 0; y--) {
    if ((lines >> BigInt(y)) & 1n) {
      shift++;
    } else {
      if ((col >> BigInt(y)) & 1n) {
        result |= 1n << BigInt(y + Number(shift));
      }
    }
  }
  return result;
}
