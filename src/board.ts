import type { MinoType, MinoMatrix } from './types.ts';

export class Board {
  width: number;
  height: number;
  grid: (MinoType | null)[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = this.createEmptyGrid();
  }

  createEmptyGrid() {
    return Array.from({length: this.height}, () => Array(this.width).fill(null));
  }

  clear() {
    this.grid = this.createEmptyGrid();
  }

  collides(matrix: MinoMatrix, x: number, y: number) {
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          let boardX = x + c;
          let boardY = y + r;
          if (boardX < 0 || boardX >= this.width || boardY >= this.height) {
            return true;
          }
          if (boardY >= 0 && this.grid[boardY][boardX]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  merge(matrix: MinoMatrix, x: number, y: number, type: MinoType) {
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          let boardY = y + r;
          let boardX = x + c;
          if (boardY >= 0 && boardY < this.height && boardX >= 0 && boardX < this.width) {
            this.grid[boardY][boardX] = type;
          }
        }
      }
    }
  }

  clearLines() {
    let linesCleared = 0;
    for (let y = this.height - 1; y >= 0; y--) {
      if (this.grid[y].every(cell => cell !== null)) {
        this.grid.splice(y, 1);
        this.grid.unshift(Array(this.width).fill(null));
        linesCleared++;
        y++;
      }
    }
    return linesCleared;
  }
}
