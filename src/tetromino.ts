import type { MinoType, MinoMatrix, MinoState, MinoRotation } from './types.ts';
import { MINOS } from './constants.ts';

export class Tetromino {
  type: MinoType;
  matrix: MinoMatrix;
  state: MinoState;

  constructor(type: MinoType) {
    this.type = type;
    this.matrix = this.cloneMatrix(MINOS[type].matrix);
    this.state = 0;
  }

  cloneMatrix(matrix: MinoMatrix) {
    return matrix.map(row => [...row]);
  }

  getRotatedMatrix(direction: MinoRotation) {
    const n = this.matrix.length;
    let newMatrix = Array.from({length: n}, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (direction === 'CW') {
          newMatrix[c][n - 1 - r] = this.matrix[r][c];
        } else if (direction === 'CCW') {
          newMatrix[n - 1 - c][r] = this.matrix[r][c];
        } else if (direction === '180') {
          newMatrix[n - 1 - r][n - 1 - c] = this.matrix[r][c];
        }
      }
    }
    return newMatrix;
  }
}
