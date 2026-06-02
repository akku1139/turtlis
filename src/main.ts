import './style.css'

/**
 * ==========================================
 * グローバル設定・定数
 * ==========================================
 */
const BOARD_WIDTH = 10;
const BOARD_VISIBLE_HEIGHT = 20;
const BOARD_HIDDEN_HEIGHT = 20;
const BOARD_TOTAL_HEIGHT = BOARD_VISIBLE_HEIGHT + BOARD_HIDDEN_HEIGHT;

const MINOS = {
  'I': { color: '#00FFFF', matrix: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  'J': { color: '#0000FF', matrix: [[1,0,0],[1,1,1],[0,0,0]] },
  'L': { color: '#FFA500', matrix: [[0,0,1],[1,1,1],[0,0,0]] },
  'O': { color: '#FFFF00', matrix: [[1,1],[1,1]] },
  'S': { color: '#00FF00', matrix: [[0,1,1],[1,1,0],[0,0,0]] },
  'T': { color: '#800080', matrix: [[0,1,0],[1,1,1],[0,0,0]] },
  'Z': { color: '#FF0000', matrix: [[1,1,0],[0,1,1],[0,0,0]] }
};

const F_TO_MS = 1000 / 60;

/**
 * ==========================================
 * モジュール1: KickTable (キックテーブル)
 * ==========================================
 */
class KickTable {
  getKicks(minoType, fromState, toState) { return [[0, 0]]; }
}

class SRSKickTable extends KickTable {
  constructor() {
    super();
    this.kicksJLSTZ = {
      "0->1": [[ 0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
      "1->0": [[ 0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
      "1->2": [[ 0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
      "2->1": [[ 0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
      "2->3": [[ 0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]],
      "3->2": [[ 0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
      "3->0": [[ 0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
      "0->3": [[ 0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]]
    };
    this.kicksI = {
      "0->1": [[ 0, 0], [-2, 0], [ 1, 0], [-2,-1], [ 1, 2]],
      "1->0": [[ 0, 0], [ 2, 0], [-1, 0], [ 2, 1], [-1,-2]],
      "1->2": [[ 0, 0], [-1, 0], [ 2, 0], [-1, 2], [ 2,-1]],
      "2->1": [[ 0, 0], [ 1, 0], [-2, 0], [ 1,-2], [-2, 1]],
      "2->3": [[ 0, 0], [ 2, 0], [-1, 0], [ 2, 1], [-1,-2]],
      "3->2": [[ 0, 0], [-2, 0], [ 1, 0], [-2,-1], [ 1, 2]],
      "3->0": [[ 0, 0], [ 1, 0], [-2, 0], [ 1,-2], [-2, 1]],
      "0->3": [[ 0, 0], [-1, 0], [ 2, 0], [-1, 2], [ 2,-1]]
    };
    this.kicks180 = {
      "0->2": [[0,0], [0,1], [0,-1], [1,0], [-1,0]],
      "1->3": [[0,0], [1,0], [-1,0], [0,1], [0,-1]],
      "2->0": [[0,0], [0,-1], [0,1], [-1,0], [1,0]],
      "3->1": [[0,0], [-1,0], [1,0], [0,-1], [0,1]]
    };
  }

  getKicks(minoType, fromState, toState) {
    const key = `${fromState}->${toState}`;
    if (Math.abs(fromState - toState) === 2) {
      return this.kicks180[key] || [[0, 0]];
    }
    if (minoType === 'O') return [[0, 0]];
    const table = minoType === 'I' ? this.kicksI : this.kicksJLSTZ;
    return table[key] || [[0, 0]];
  }
}

class SRSPlusKickTable extends SRSKickTable {
  constructor() {
    super();
    this.kicks180_I = {
      "0->2": [[ 0, 0], [-1, 0], [-2, 0], [ 1, 0], [ 2, 0], [ 0, 1]],
      "1->3": [[ 0, 0], [ 0, 1], [ 0, 2], [ 0,-1], [ 0,-2], [-1, 0]],
      "2->0": [[ 0, 0], [ 1, 0], [ 2, 0], [-1, 0], [-2, 0], [ 0,-1]],
      "3->1": [[ 0, 0], [ 0, 1], [ 0, 2], [ 0,-1], [ 0,-2], [ 1, 0]]
    };
    this.kicks180_T = {
      "0->2": [[ 0, 0], [ 0, 1], [ 1, 1], [-1, 1], [ 1, 0], [-1, 0]],
      "1->3": [[ 0, 0], [ 1, 0], [ 1, 2], [ 1, 1], [ 0, 2], [ 0, 1]],
      "2->0": [[ 0, 0], [ 0,-1], [-1,-1], [ 1,-1], [-1, 0], [ 1, 0]],
      "3->1": [[ 0, 0], [-1, 0], [-1, 2], [-1, 1], [ 0, 2], [ 0, 1]]
    };
  }

  getKicks(minoType, fromState, toState) {
    const key = `${fromState}->${toState}`;
    if (Math.abs(fromState - toState) === 2) {
      if (minoType === 'I') return this.kicks180_I[key] || [[0, 0]];
      if (minoType === 'T') return this.kicks180_T[key] || [[0, 0]];
      return this.kicks180[key] || [[0, 0]];
    }
    return super.getKicks(minoType, fromState, toState);
  }
}

/**
 * ==========================================
 * モジュール2: Tetromino
 * ==========================================
 */
class Tetromino {
  constructor(type) {
    this.type = type;
    this.matrix = this.cloneMatrix(MINOS[type].matrix);
    this.state = 0;
  }

  cloneMatrix(matrix) {
    return matrix.map(row => [...row]);
  }

  getRotatedMatrix(direction) {
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

/**
 * ==========================================
 * モジュール3: Board (盤面管理)
 * ==========================================
 */
class Board {
  constructor(width, height) {
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

  collides(matrix, x, y) {
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

  merge(matrix, x, y, type) {
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

/**
 * ==========================================
 * モジュール4: GameCore
 * ==========================================
 */
class GameCore {
  constructor() {
    this.kickTable = new SRSPlusKickTable();
    this.board = new Board(BOARD_WIDTH, BOARD_TOTAL_HEIGHT);
    this.reset();
  }

  reset() {
    this.board.clear();
    this.state = 'READY';
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.comboCount = 0;
    this.difficultClearCount = 0;

    this.piecesPlaced = 0;
    this.keyPresses = 0;
    this.playTime = 0;
    this.totalAttackSent = 0;

    this.nextQueue = [];
    this.holdType = null;
    this.canHold = true;

    this.currentMino = null;
    this.minoX = 0;
    this.minoY = 0;

    this.fallTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = 0;

    this.gravityDelay = 1000;
    this.lockDelay = 500;

    this.actionMessage = "";
    this.comboMessage = "";
    this.lastAttackMessage = "";
    this.actionTimer = 0;

    this.lastActionWasRotation = false;
    this.lastKickIndex = 0;
    this.isSoftDropping = false;

    this.config = {
      arr: 0,
      das: 5.7 * F_TO_MS,
      dcd: 0,
      sdf: Infinity,
      preventAccident: true,
      cancelDasOnDir: false,
      preferMovement: true,
      irs: 'TAP',
      ihs: 'TAP'
    };

    this.dcdTimer = 0;
    this.accidentalHardDropPreventTimer = 0;

    this.bufferedHold = false;
    this.bufferedRotation = null;
  }

  start() {
    this.reset();
    this.updateConfigFromUI();
    this.fillNextQueue();
    this.state = 'PLAYING';
    this.spawnPiece();
  }

  updateConfigFromUI() {
    const arrVal = parseFloat(document.getElementById('cfgARR').value);
    const dasVal = parseFloat(document.getElementById('cfgDAS').value);
    const dcdVal = parseFloat(document.getElementById('cfgDCD').value);
    const sdfVal = parseFloat(document.getElementById('cfgSDF').value);

    document.getElementById('arrVal').textContent = arrVal === 0 ? "0.0F (ワープ)" : `${arrVal.toFixed(1)}F (${Math.round(arrVal * F_TO_MS)}ms)`;
    document.getElementById('dasVal').textContent = `${dasVal.toFixed(1)}F (${Math.round(dasVal * F_TO_MS)}ms)`;
    document.getElementById('dcdVal').textContent = dcdVal === 0 ? "0.0F (なし)" : `${dcdVal.toFixed(1)}F (${Math.round(dcdVal * F_TO_MS)}ms)`;
    document.getElementById('sdfVal').textContent = sdfVal > 40 ? "INF (無限)" : `${sdfVal}x`;

    this.config.arr = arrVal * F_TO_MS;
    this.config.das = dasVal * F_TO_MS;
    this.config.dcd = dcdVal * F_TO_MS;
    this.config.sdf = sdfVal > 40 ? Infinity : sdfVal;

    this.config.preventAccident = document.getElementById('cfgPreventAccident').checked;
    this.config.cancelDasOnDir = document.getElementById('cfgCancelDasOnDir').checked;
    this.config.preferMovement = document.getElementById('cfgPreferMovement').checked;
    this.config.irs = document.getElementById('cfgIRS').value;
    this.config.ihs = document.getElementById('cfgIHS').value;

    const kickTableType = document.getElementById('cfgKickTable').value;
    if (kickTableType === 'SRS+' && !(this.kickTable instanceof SRSPlusKickTable)) {
      this.kickTable = new SRSPlusKickTable();
    } else if (kickTableType === 'SRS' && this.kickTable instanceof SRSPlusKickTable) {
      this.kickTable = new SRSKickTable();
    }
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
    }
  }

  fillNextQueue() {
    const types = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    this.nextQueue.push(...types);
  }

  spawnPiece() {
    if (this.bufferedHold && this.canHold) {
      this.bufferedHold = false;
      this.executeHold();
      return;
    }
    this.bufferedHold = false;

    const nextType = this.nextQueue.shift();
    this.currentMino = new Tetromino(nextType);

    if (this.nextQueue.length <= 7) {
      this.fillNextQueue();
    }

    // ★ Oミノのみ出現X位置を4（左右4マス空け中央）に設定、それ以外は3
    this.minoX = (nextType === 'O') ? 4 : 3;

    let maxRow = 0;
    const matrix = this.currentMino.matrix;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          maxRow = Math.max(maxRow, r);
        }
      }
    }

    // 22段目に出現させる（下辺のインデックスが 18 = 20 - 2 になるように）
    this.minoY = (BOARD_HIDDEN_HEIGHT - 2) - maxRow;

    if (this.comboCount > 1) {
      while (this.minoY > 0 && this.board.collides(this.currentMino.matrix, this.minoX, this.minoY)) {
        this.minoY--;
      }
    }

    if (this.board.collides(this.currentMino.matrix, this.minoX, this.minoY)) {
      this.state = 'GAMEOVER';
      return;
    }

    if (this.bufferedRotation) {
      const rotDir = this.bufferedRotation;
      this.bufferedRotation = null;
      this.handleRotate(rotDir);
    }

    this.lowestY = this.minoY;

    this.gravityDelay = Math.max(16.67, Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1) * 1000);
    this.fallTimer = this.gravityDelay;

    this.lockTimer = 0;
    this.lockResets = 0;
    this.canHold = true;
    this.lastActionWasRotation = false;
    this.lastKickIndex = 0;

    this.dcdTimer = this.config.dcd;
  }

  update(dt) {
    if (this.state !== 'PLAYING') return;

    this.playTime += dt / 1000;

    if (this.actionTimer > 0) {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) {
        this.actionMessage = "";
        this.comboMessage = "";
        this.lastAttackMessage = "";
      }
    }

    if (this.accidentalHardDropPreventTimer > 0) {
      this.accidentalHardDropPreventTimer -= dt;
    }

    if (this.dcdTimer > 0) {
      this.dcdTimer -= dt;
    }

    this.gravityDelay = Math.max(16.67, Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1) * 1000);

    let isGrounded = this.board.collides(this.currentMino.matrix, this.minoX, this.minoY + 1);

    if (isGrounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= this.lockDelay || this.lockResets >= 15) {
        this.lockPiece();
      }
    } else {
      let speedMultiplier = 1;
      if (this.isSoftDropping && this.config.sdf !== Infinity) {
        speedMultiplier = this.config.sdf;
      }

      this.fallTimer += dt * speedMultiplier;
      let currentGravity = this.gravityDelay;

      while (this.fallTimer >= currentGravity) {
        this.fallTimer -= currentGravity;
        if (!this.board.collides(this.currentMino.matrix, this.minoX, this.minoY + 1)) {
          this.minoY++;

          if (this.minoY > this.lowestY) {
            this.lowestY = this.minoY;
            this.lockResets = 0;
            this.lockTimer = 0;
          }

          if (this.isSoftDropping) {
            this.score += 1;
          }
          this.lastActionWasRotation = false;
        } else {
          this.fallTimer = 0;
          break;
        }
      }
    }
  }

  getGhostY() {
    let ghostY = this.minoY;
    while (!this.board.collides(this.currentMino.matrix, this.minoX, ghostY + 1)) {
      ghostY++;
    }
    return ghostY;
  }

  handleAction(action) {
    if (this.state !== 'PLAYING') return;
    let success = false;
    let isMovement = false;

    switch(action) {
      case 'MoveLeft':
        if (this.dcdTimer > 0) return;
        if (!this.board.collides(this.currentMino.matrix, this.minoX - 1, this.minoY)) {
          this.minoX--;
          success = true;
          isMovement = true;
          this.lastActionWasRotation = false;
        }
        break;
      case 'MoveRight':
        if (this.dcdTimer > 0) return;
        if (!this.board.collides(this.currentMino.matrix, this.minoX + 1, this.minoY)) {
          this.minoX++;
          success = true;
          isMovement = true;
          this.lastActionWasRotation = false;
        }
        break;
      case 'SoftDrop':
        if (this.config.sdf === Infinity) {
          let dropCount = 0;
          while (!this.board.collides(this.currentMino.matrix, this.minoX, this.minoY + 1)) {
            this.minoY++;
            dropCount++;
          }
          if (dropCount > 0) {
            this.score += dropCount;
            success = true;
            isMovement = true;
            this.lastActionWasRotation = false;
          }
        }
        break;
      case 'HardDrop':
        if (this.config.preventAccident && this.accidentalHardDropPreventTimer > 0) return;
        let dropCount = 0;
        while (!this.board.collides(this.currentMino.matrix, this.minoX, this.minoY + 1)) {
          this.minoY++;
          dropCount++;
        }
        this.score += dropCount * 2;
        if (dropCount > 0) {
          this.lastActionWasRotation = false;
        }
        this.lockPiece();
        break;
      case 'RotateCW':
        success = this.handleRotate('CW');
        isMovement = true;
        break;
      case 'RotateCCW':
        success = this.handleRotate('CCW');
        isMovement = true;
        break;
      case 'Rotate180':
        success = this.handleRotate('180');
        isMovement = true;
        break;
      case 'Hold':
        this.hold();
        break;
    }

    if (success && isMovement) {
      if (this.minoY > this.lowestY) {
        this.lowestY = this.minoY;
        this.lockResets = 0;
        this.lockTimer = 0;
      }

      if (this.board.collides(this.currentMino.matrix, this.minoX, this.minoY + 1)) {
        if (this.lockResets < 15) {
          this.lockTimer = 0;
          this.lockResets++;
        } else {
          this.lockPiece();
        }
      }
    }

    if (success && this.isSoftDropping && this.config.sdf === Infinity) {
      let reDropCount = 0;
      while (!this.board.collides(this.currentMino.matrix, this.minoX, this.minoY + 1)) {
        this.minoY++;
        reDropCount++;
      }
      if (reDropCount > 0) {
        this.score += reDropCount;
        if (this.minoY > this.lowestY) {
          this.lowestY = this.minoY;
          this.lockResets = 0;
          this.lockTimer = 0;
        }
        if (this.board.collides(this.currentMino.matrix, this.minoX, this.minoY + 1)) {
          if (this.lockResets < 15) {
            this.lockTimer = 0;
            this.lockResets++;
          } else {
            this.lockPiece();
          }
        }
      }
    }
  }

  handleRotate(direction) {
    if (this.currentMino.type === 'O') return false;

    let toState = this.currentMino.state;
    if (direction === 'CW') toState = (toState + 1) % 4;
    else if (direction === 'CCW') toState = (toState + 3) % 4;
    else if (direction === '180') toState = (toState + 2) % 4;

    const newMatrix = this.currentMino.getRotatedMatrix(direction);
    const kicks = this.kickTable.getKicks(this.currentMino.type, this.currentMino.state, toState);

    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const testX = this.minoX + dx;
      const testY = this.minoY - dy;

      if (!this.board.collides(newMatrix, testX, testY)) {
        this.minoX = testX;
        this.minoY = testY;
        this.currentMino.matrix = newMatrix;
        this.currentMino.state = toState;
        this.lastActionWasRotation = true;
        this.lastKickIndex = i;
        return true;
      }
    }
    return false;
  }

  hold() {
    if (!this.canHold) return;
    this.executeHold();
  }

  executeHold() {
    if (this.holdType === null) {
      this.holdType = this.currentMino.type;
      this.spawnPiece();
    } else {
      const temp = this.holdType;
      this.holdType = this.currentMino.type;
      this.currentMino = new Tetromino(temp);

      // ★ Oミノのみ出現X位置を4（左右4マス空け中央）に設定、それ以外は3
      this.minoX = (temp === 'O') ? 4 : 3;

      let maxRow = 0;
      const matrix = this.currentMino.matrix;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c]) {
            maxRow = Math.max(maxRow, r);
          }
        }
      }
      this.minoY = (BOARD_HIDDEN_HEIGHT - 2) - maxRow;

      if (this.comboCount > 1) {
        while (this.minoY > 0 && this.board.collides(this.currentMino.matrix, this.minoX, this.minoY)) {
          this.minoY--;
        }
      }

      if (this.board.collides(this.currentMino.matrix, this.minoX, this.minoY)) {
        this.state = 'GAMEOVER';
      }

      this.lowestY = this.minoY;

      this.gravityDelay = Math.max(16.67, Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1) * 1000);
      this.fallTimer = this.gravityDelay;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lastActionWasRotation = false;
    }
    this.canHold = false;
  }

  checkTSpin() {
    if (this.currentMino.type !== 'T' || !this.lastActionWasRotation) {
      return { isSpin: false };
    }

    const cx = this.minoX + 1;
    const cy = this.minoY + 1;

    const corners = [
      { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
      { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
    ];

    const facing = {
      0: [{dx: -1, dy: -1}, {dx: 1, dy: -1}],
      1: [{dx: 1, dy: -1}, {dx: 1, dy: 1}],
      2: [{dx: 1, dy: 1}, {dx: -1, dy: 1}],
      3: [{dx: -1, dy: 1}, {dx: -1, dy: -1}]
    }[this.currentMino.state];

    let occupied = 0;
    let facingOccupied = 0;

    corners.forEach(c => {
      const px = cx + c.dx;
      const py = cy + c.dy;
      if (px < 0 || px >= BOARD_WIDTH || py >= BOARD_TOTAL_HEIGHT || (py >= 0 && this.board.grid[py][px])) {
        occupied++;
        if (facing.some(fc => fc.dx === c.dx && fc.dy === c.dy)) {
          facingOccupied++;
        }
      }
    });

    // TETR.IOのSpin-Mini (Immobile) 判定
    const m = this.currentMino.matrix;
    const x = this.minoX;
    const y = this.minoY;
    const isImmobile = this.board.collides(m, x - 1, y) &&
              this.board.collides(m, x + 1, y) &&
              this.board.collides(m, x, y - 1) &&
              this.board.collides(m, x, y + 1);

    if (occupied < 3) {
      if (isImmobile) {
        return { isSpin: true, isMini: true };
      }
      return { isSpin: false };
    }

    let isMini = facingOccupied < 2;

    if (this.lastKickIndex === 4) {
      isMini = false;
    }

    return { isSpin: true, isMini: isMini };
  }

  checkOtherSpin() {
    if (this.currentMino.type === 'T' || this.currentMino.type === 'O') return false;
    if (!this.lastActionWasRotation) return false;

    const m = this.currentMino.matrix;
    const x = this.minoX;
    const y = this.minoY;

    if (this.board.collides(m, x - 1, y) &&
      this.board.collides(m, x + 1, y) &&
      this.board.collides(m, x, y - 1) &&
      this.board.collides(m, x, y + 1)) {
      return true;
    }
    return false;
  }

  lockPiece() {
    this.piecesPlaced++;

    const tSpinResult = this.checkTSpin();
    let otherSpin = false;
    if (!tSpinResult.isSpin) {
      otherSpin = this.checkOtherSpin();
    }

    this.board.merge(this.currentMino.matrix, this.minoX, this.minoY, this.currentMino.type);
    const cleared = this.board.clearLines();

    let isAllClear = true;
    for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (this.board.grid[y][x] !== null) {
          isAllClear = false;
          break;
        }
      }
      if (!isAllClear) break;
    }

    let scoreGained = 0;
    let actionName = "";
    let isSpinAction = false;
    let isQuad = cleared === 4;

    let baseAttack = 0;

    if (tSpinResult.isSpin) {
      isSpinAction = true;
      if (tSpinResult.isMini) {
        if (cleared === 0) { actionName = "MINI T-SPIN ZERO"; scoreGained = 100 * this.level; baseAttack = 0; }
        else if (cleared === 1) { actionName = "MINI T-SPIN SINGLE"; scoreGained = 200 * this.level; baseAttack = 0; }
        else if (cleared === 2) { actionName = "MINI T-SPIN DOUBLE"; scoreGained = 400 * this.level; baseAttack = 1; }
        else if (cleared === 3) {
          actionName = "T-SPIN TRIPLE";
          scoreGained = 1600 * this.level;
          baseAttack = 6;
          tSpinResult.isMini = false;
        }
      } else {
        if (cleared === 0) { actionName = "T-SPIN ZERO"; scoreGained = 400 * this.level; baseAttack = 0; }
        else if (cleared === 1) { actionName = "T-SPIN SINGLE"; scoreGained = 800 * this.level; baseAttack = 2; }
        else if (cleared === 2) { actionName = "T-SPIN DOUBLE"; scoreGained = 1200 * this.level; baseAttack = 4; }
        else if (cleared === 3) { actionName = "T-SPIN TRIPLE"; scoreGained = 1600 * this.level; baseAttack = 6; }
      }
    } else if (otherSpin) {
      isSpinAction = true;
      const mType = this.currentMino.type;
      if (cleared === 0) { actionName = `MINI ${mType}-SPIN ZERO`; scoreGained = 100 * this.level; baseAttack = 0; }
      else if (cleared === 1) { actionName = `MINI ${mType}-SPIN SINGLE`; scoreGained = 200 * this.level; baseAttack = 0; }
      else if (cleared === 2) { actionName = `MINI ${mType}-SPIN DOUBLE`; scoreGained = 400 * this.level; baseAttack = 1; }
    } else {
      if (cleared === 1) { actionName = "SINGLE"; scoreGained = 100 * this.level; baseAttack = 0; }
      else if (cleared === 2) { actionName = "DOUBLE"; scoreGained = 300 * this.level; baseAttack = 1; }
      else if (cleared === 3) { actionName = "TRIPLE"; scoreGained = 500 * this.level; baseAttack = 2; }
      else if (cleared === 4) { actionName = "QUAD!"; scoreGained = 800 * this.level; baseAttack = 4; }
    }

    // B2B & Combo 判定
    this.comboMessage = "";

    let previousB2BCount = this.difficultClearCount > 1 ? this.difficultClearCount - 1 : 0;
    let b2bBreakBonus = 0;

    if (cleared > 0) {
      if (isQuad || isSpinAction) {
        this.difficultClearCount++;
      } else {
        // 通常消去によるB2Bブレイク時のATK加算 (B2Bがx4(内部カウントではdifficultClearCountが5以上、表示上x4)以上の場合のみ発生)
        if (previousB2BCount >= 4) {
          b2bBreakBonus = previousB2BCount;
        }
        this.difficultClearCount = 0;
      }

      if (this.difficultClearCount > 1) {
        scoreGained = Math.floor(scoreGained * 1.5);
      }

      this.comboCount++;
      if (this.comboCount > 1) {
        const comboBonus = 50 * (this.comboCount - 1) * this.level;
        scoreGained += comboBonus;
        this.comboMessage = `${this.comboCount - 1} COMBO!`;
      }
    } else {
      this.comboCount = 0;
    }

    // --- TETR.IO Multiplier Attack System ---
    let b2bBonus = (cleared > 0 && (isQuad || isSpinAction) && this.difficultClearCount > 1) ? 1 : 0;
    let base = baseAttack + b2bBonus + b2bBreakBonus;

    if (isAllClear && cleared > 0) {
      base += 5; // Perfect Clear による追加火力
      actionName = (actionName ? actionName + "\n" : "") + "PERFECT CLEAR!";

      if (this.difficultClearCount <= 1) {
        this.difficultClearCount = 2;
      } else {
        this.difficultClearCount += 2;
      }
    }

    let totalAttack = 0;
    if (cleared > 0) {
      let x = this.comboCount - 1;
      if (base === 0) {
        if (x >= 2) {
          totalAttack = Math.log(1 + 1.25 * x);
        } else {
          totalAttack = 0;
        }
      } else {
        totalAttack = base * (1 + 0.25 * x);
      }
      totalAttack = Math.floor(totalAttack);
    }

    this.totalAttackSent += totalAttack;

    if (scoreGained > 0 || isSpinAction) {
      this.score += scoreGained;
      this.lines += cleared;
      this.actionMessage = actionName;
      this.actionTimer = 2000;

      if (totalAttack > 0) {
        this.lastAttackMessage = `+${totalAttack} ATK`;
      }

      const targetLevel = Math.floor(this.lines / 10) + 1;
      if (targetLevel > this.level) {
        this.level = Math.min(15, targetLevel);
        if (this.actionMessage) {
          this.actionMessage += `\nLEVEL UP! (LV.${this.level})`;
        } else {
          this.actionMessage = `LEVEL UP! (LV.${this.level})`;
        }
      }
    }

    if (this.config.preventAccident) {
      this.accidentalHardDropPreventTimer = 8 * F_TO_MS;
    }

    if (this.state !== 'GAMEOVER') {
      this.spawnPiece();
    }
  }
}

/**
 * ==========================================
 * モジュール5: InputManager
 * ==========================================
 */
const KEY_BINDINGS = {
  'KeyA': 'MoveLeft',
  'KeyW': 'SoftDrop',
  'KeyS': 'HardDrop',
  'KeyD': 'MoveRight',
  'ArrowLeft': 'RotateCCW',
  'ArrowRight': 'RotateCW',
  'ArrowUp': 'Rotate180',
  'ShiftLeft': 'Hold',
  'ShiftRight': 'Hold',
  'KeyC': 'Hold',
  'KeyR': 'Reset',
  'KeyP': 'Pause'
};

class InputManager {
  constructor(gameCore) {
    this.core = gameCore;
    this.keys = {};
    this.timers = {};
    this.dasCharged = {};
    this.lastMoveKey = null;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      const action = KEY_BINDINGS[e.code];
      if (action) {
        if (action === 'Reset') { this.core.start(); return; }
        if (action === 'Pause') { this.core.togglePause(); return; }
        if (this.core.state === 'GAMEOVER') { this.core.start(); return; }

        if (action === 'MoveLeft' || action === 'MoveRight') {
          if (!this.keys[action]) {
            this.lastMoveKey = action;
            const opposite = action === 'MoveLeft' ? 'MoveRight' : 'MoveLeft';
            this.dasCharged[opposite] = 0;
            this.timers[opposite] = 0;

            if (this.core.config.cancelDasOnDir) {
              this.dasCharged[action] = 0;
            }
          }
        }

        if (!this.keys[action]) {
          this.keys[action] = true;
          this.timers[action] = 0;
          this.dasCharged[action] = 0;

          this.core.keyPresses++;
          this.core.handleAction(action);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const action = KEY_BINDINGS[e.code];
      if (action) {
        this.keys[action] = false;

        if (action === 'MoveLeft' || action === 'MoveRight') {
          const opposite = action === 'MoveLeft' ? 'MoveRight' : 'MoveLeft';
          if (this.keys[opposite]) {
            this.lastMoveKey = opposite;
            this.dasCharged[opposite] = 0;
            this.timers[opposite] = 0;
          } else {
            this.lastMoveKey = null;
          }
        }
      }
    });
  }

  checkBufferInputs() {
    if (this.core.state !== 'PLAYING') return;

    if (this.core.config.ihs !== 'OFF') {
      const isHoldActive = this.keys['Hold'];
      if (this.core.config.ihs === 'HOLD' && isHoldActive) {
        this.core.bufferedHold = true;
      } else if (this.core.config.ihs === 'TAP' && isHoldActive) {
        this.core.bufferedHold = true;
      }
    }

    if (this.core.config.irs !== 'OFF') {
      if (this.keys['RotateCW']) {
        this.core.bufferedRotation = 'CW';
      } else if (this.keys['RotateCCW']) {
        this.core.bufferedRotation = 'CCW';
      } else if (this.keys['Rotate180']) {
        this.core.bufferedRotation = '180';
      }
    }
  }

  update(dt) {
    if (this.core.state !== 'PLAYING') {
      this.checkBufferInputs();
      return;
    }

    this.core.isSoftDropping = !!this.keys['SoftDrop'];

    const activeMoveKey = this.lastMoveKey;
    let isDASCharged = false;

    if (activeMoveKey && this.keys[activeMoveKey]) {
      this.dasCharged[activeMoveKey] += dt;
      if (this.dasCharged[activeMoveKey] >= this.core.config.das) {
        isDASCharged = true;
      }
    }

    let processMovement = true;

    if (this.keys['SoftDrop']) {
      const canSoftDrop = !this.core.board.collides(this.core.currentMino.matrix, this.core.minoX, this.core.minoY + 1);

      if (canSoftDrop) {
        const shouldPrioritizeSoftDrop = !activeMoveKey || isDASCharged;

        if (shouldPrioritizeSoftDrop) {
          this.core.handleAction('SoftDrop');
          if (this.core.config.sdf === Infinity) {
            processMovement = false;
          }
        } else {
          if (this.core.config.preferMovement) {
            this.core.isSoftDropping = false;
          } else {
            this.core.handleAction('SoftDrop');
          }
        }
      }
    }

    if (processMovement && activeMoveKey && this.keys[activeMoveKey]) {
      if (isDASCharged) {
        this.timers[activeMoveKey] += dt;

        if (this.core.config.arr === 0) {
          while (!this.core.board.collides(this.core.currentMino.matrix, this.core.minoX + (activeMoveKey === 'MoveLeft' ? -1 : 1), this.core.minoY)) {
            this.core.handleAction(activeMoveKey);
          }
        } else if (this.timers[activeMoveKey] >= this.core.config.arr) {
          this.core.handleAction(activeMoveKey);
          this.timers[activeMoveKey] -= this.core.config.arr;
        }
      }
    }
  }
}

/**
 * ==========================================
 * モジュール6: Renderer
 * ==========================================
 */
class Renderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.blockSize = 24;

    this.boardOffsetX = 120;
    this.boardOffsetY = 120;
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  drawBlockRaw(px, py, type, size, isGhost = false, isGray = false) {
    let color = MINOS[type].color;
    if (isGray) {
      color = '#475569';
    }

    if (isGhost) {
      this.ctx.fillStyle = this.hexToRgba(color, 0.15);
      this.ctx.fillRect(px, py, size, size);
      this.ctx.strokeStyle = this.hexToRgba(color, 0.7);
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(px, py, size, size);
    } else {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(px, py, size, size);

      this.ctx.fillStyle = 'rgba(255,255,255,0.25)';
      this.ctx.fillRect(px, py, size, 2.5);
      this.ctx.fillRect(px, py, 2.5, size);
      this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
      this.ctx.fillRect(px, py + size - 2.5, size, 2.5);
      this.ctx.fillRect(px + size - 2.5, py, 2.5, size);
    }
  }

  drawGridBlock(x, y, type, isGhost = false) {
    const px = this.boardOffsetX + x * this.blockSize;
    const py = this.boardOffsetY + y * this.blockSize;
    this.drawBlockRaw(px, py, type, this.blockSize, isGhost);
  }

  drawMiniMino(matrix, type, x, y, isGray = false) {
    const n = matrix.length;
    const bSize = 13;
    const offsetX = x + (4 - n) * bSize / 2;
    const offsetY = y + (4 - n) * bSize / 2;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          this.drawBlockRaw(offsetX + c * bSize, offsetY + r * bSize, type, bSize, false, isGray);
        }
      }
    }
  }

  render(core) {
    this.ctx.fillStyle = '#060b13';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let isDanger = false;
    for (let y = 0; y <= BOARD_TOTAL_HEIGHT - 18; y++) {
      if (core.board.grid[y].some(cell => cell !== null)) {
        isDanger = true;
        break;
      }
    }

    this.ctx.fillStyle = '#010409';
    this.ctx.fillRect(this.boardOffsetX, this.boardOffsetY, BOARD_WIDTH * this.blockSize, BOARD_VISIBLE_HEIGHT * this.blockSize);

    this.ctx.strokeStyle = isDanger ? '#ef4444' : '#60a5fa';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(this.boardOffsetX - 1, this.boardOffsetY - 1, BOARD_WIDTH * this.blockSize + 2, BOARD_VISIBLE_HEIGHT * this.blockSize + 2);

    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 1;
    for(let i = 1; i < BOARD_WIDTH; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.boardOffsetX + i*this.blockSize, this.boardOffsetY);
      this.ctx.lineTo(this.boardOffsetX + i*this.blockSize, this.boardOffsetY + BOARD_VISIBLE_HEIGHT*this.blockSize);
      this.ctx.stroke();
    }
    for(let i = 1; i < BOARD_VISIBLE_HEIGHT; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.boardOffsetX, this.boardOffsetY + i*this.blockSize);
      this.ctx.lineTo(this.boardOffsetX + BOARD_WIDTH*this.blockSize, this.boardOffsetY + i*this.blockSize);
      this.ctx.stroke();
    }

    for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (core.board.grid[y][x]) {
          this.drawGridBlock(x, y - BOARD_HIDDEN_HEIGHT, core.board.grid[y][x]);
        }
      }
    }

    if (core.state === 'PLAYING' || core.state === 'PAUSED') {
      const ghostY = core.getGhostY();
      const n = core.currentMino.matrix.length;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (core.currentMino.matrix[r][c]) {
            const drawY = ghostY + r - BOARD_HIDDEN_HEIGHT;
            this.drawGridBlock(core.minoX + c, drawY, core.currentMino.type, true);
          }
        }
      }

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (core.currentMino.matrix[r][c]) {
            const drawY = core.minoY + r - BOARD_HIDDEN_HEIGHT;
            this.drawGridBlock(core.minoX + c, drawY, core.currentMino.type, false);
          }
        }
      }
    }

    if (isDanger && core.state === 'PLAYING' && core.nextQueue.length > 0) {
      const nextType = core.nextQueue[0];
      const tetro = new Tetromino(nextType);
      let maxRow = 0;
      for (let r = 0; r < tetro.matrix.length; r++) {
        for (let c = 0; c < tetro.matrix[r].length; c++) {
          if (tetro.matrix[r][c]) maxRow = Math.max(maxRow, r);
        }
      }
      let spawnY = (BOARD_HIDDEN_HEIGHT - 2) - maxRow;
      if (core.comboCount > 1) {
        while (spawnY > 0 && core.board.collides(tetro.matrix, 3, spawnY)) {
          spawnY--;
        }
      }

      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      const centers = [];
      for (let r = 0; r < tetro.matrix.length; r++) {
        for (let c = 0; c < tetro.matrix[r].length; c++) {
          if (tetro.matrix[r][c]) {
            const px = this.boardOffsetX + (3 + c) * this.blockSize;
            const py = this.boardOffsetY + (spawnY + r - BOARD_HIDDEN_HEIGHT) * this.blockSize;
            const cx = px + this.blockSize / 2;
            const cy = py + this.blockSize / 2;
            centers.push({x: cx, y: cy, r, c});

            const d = this.blockSize / 4;
            this.ctx.moveTo(cx - d, cy - d);
            this.ctx.lineTo(cx + d, cy + d);
            this.ctx.moveTo(cx + d, cy - d);
            this.ctx.lineTo(cx - d, cy + d);
          }
        }
      }
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const dx = Math.abs(centers[i].c - centers[j].c);
          const dy = Math.abs(centers[i].r - centers[j].r);
          if (dx + dy === 1) {
            this.ctx.moveTo(centers[i].x, centers[i].y);
            this.ctx.lineTo(centers[j].x, centers[j].y);
          }
        }
      }
      this.ctx.stroke();
    }

    // --- HUD 左側 ---
    this.ctx.fillStyle = '#64748b';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'left';

    this.ctx.fillText("HOLD", 30, 140);
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(20, 150, 70, 70);
    if (core.holdType) {
      this.drawMiniMino(MINOS[core.holdType].matrix, core.holdType, 25, 155, !core.canHold);
    }

    let logY = 245;

    if (core.actionTimer > 0 && core.actionMessage) {
      this.ctx.fillStyle = '#60a5fa';
      this.ctx.font = 'bold italic 13px sans-serif';
      const lines = core.actionMessage.split('\n');
      lines.forEach(line => {
        this.ctx.fillText(line, 20, logY);
        logY += 18;
      });
      if (core.lastAttackMessage) {
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillText(core.lastAttackMessage, 20, logY);
        logY += 18;
      }
    }

    if (core.difficultClearCount > 1) {
      const b2b = core.difficultClearCount - 1;
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.font = 'bold italic 15px sans-serif';
      this.ctx.fillText(`B2B x${b2b}`, 20, logY);
      logY += 20;
    }

    if (core.actionTimer > 0 && core.comboMessage) {
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.font = 'bold italic 13px sans-serif';
      this.ctx.fillText(core.comboMessage, 20, logY);
      logY += 18;
    }

    const statsY = 390;
    const pps = core.playTime > 0 ? (core.piecesPlaced / core.playTime).toFixed(2) : "0.00";
    const kps = core.piecesPlaced > 0 ? (core.keyPresses / core.piecesPlaced).toFixed(2) : "0.00";
    const apm = core.playTime > 0 ? (core.totalAttackSent / (core.playTime / 60)).toFixed(2) : "0.00";

    this.ctx.fillStyle = '#475569';
    this.ctx.font = 'bold 13px sans-serif';
    this.ctx.fillText(`- STATS -`, 20, statsY);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillText(`PIECES`, 20, statsY + 20);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 14px "Courier New", monospace';
    this.ctx.fillText(`${core.piecesPlaced}`, 20, statsY + 35);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillText(`PPS`, 20, statsY + 55);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 14px "Courier New", monospace';
    this.ctx.fillText(`${pps}`, 20, statsY + 70);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillText(`KEYS`, 20, statsY + 90);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 14px "Courier New", monospace';
    this.ctx.fillText(`${core.keyPresses}`, 20, statsY + 105);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillText(`KPS`, 20, statsY + 125);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 14px "Courier New", monospace';
    this.ctx.fillText(`${kps}`, 20, statsY + 140);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillText(`TOTAL ATK`, 20, statsY + 160);
    this.ctx.fillStyle = '#ef4444';
    this.ctx.font = 'bold 14px "Courier New", monospace';
    this.ctx.fillText(`${core.totalAttackSent}`, 20, statsY + 175);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillText(`APM`, 20, statsY + 195);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 14px "Courier New", monospace';
    this.ctx.fillText(`${apm}`, 20, statsY + 210);

    // --- HUD 右側 ---
    this.ctx.fillStyle = '#64748b';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.fillText("NEXT", 390, 100);
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.strokeRect(380, 110, 70, 260);
    for (let i = 0; i < 5; i++) {
      const nextType = core.nextQueue[i];
      if (nextType) {
        this.drawMiniMino(MINOS[nextType].matrix, nextType, 385, 120 + i * 50);
      }
    }

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillText(`SCORE`, 390, 400);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 22px "Courier New", monospace';
    this.ctx.fillText(`${core.score}`, 390, 425);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.fillText(`LINES`, 390, 460);
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.font = 'bold 20px "Courier New", monospace';
    this.ctx.fillText(`${core.lines}`, 390, 480);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.fillText(`LEVEL`, 390, 520);
    this.ctx.fillStyle = '#a78bfa';
    this.ctx.font = 'bold 20px "Courier New", monospace';
    this.ctx.fillText(`${core.level}`, 390, 540);


    if (core.state === 'PAUSED') {
      this.ctx.fillStyle = 'rgba(1, 4, 9, 0.85)';
      this.ctx.fillRect(this.boardOffsetX, this.boardOffsetY, BOARD_WIDTH * this.blockSize, BOARD_VISIBLE_HEIGHT * this.blockSize);

      this.ctx.fillStyle = '#3b82f6';
      this.ctx.textBaseline = 'middle';
      this.ctx.textAlign = 'center';
      this.ctx.font = 'bold 26px sans-serif';
      this.ctx.fillText("PAUSE", this.boardOffsetX + (BOARD_WIDTH * this.blockSize)/2, this.boardOffsetY + 240);

      this.ctx.fillStyle = '#f8fafc';
      this.ctx.font = '12px sans-serif';
      this.ctx.fillText("Press 'P' to resume", this.boardOffsetX + (BOARD_WIDTH * this.blockSize)/2, this.boardOffsetY + 280);
      this.ctx.textBaseline = 'alphabetic';
    }

    if (core.state === 'GAMEOVER') {
      this.ctx.fillStyle = 'rgba(1, 4, 9, 0.85)';
      this.ctx.fillRect(this.boardOffsetX, this.boardOffsetY, BOARD_WIDTH * this.blockSize, BOARD_VISIBLE_HEIGHT * this.blockSize);

      this.ctx.fillStyle = '#ef4444';
      this.ctx.textBaseline = 'middle';
      this.ctx.textAlign = 'center';
      this.ctx.font = 'bold 26px sans-serif';
      this.ctx.fillText("GAME OVER", this.boardOffsetX + (BOARD_WIDTH * this.blockSize)/2, this.boardOffsetY + 240);

      this.ctx.fillStyle = '#f8fafc';
      this.ctx.font = '12px sans-serif';
      this.ctx.fillText("Press 'R' to restart", this.boardOffsetX + (BOARD_WIDTH * this.blockSize)/2, this.boardOffsetY + 280);
      this.ctx.textBaseline = 'alphabetic';
    }
  }
}

/**
 * ==========================================
 * モジュール7: GameManager
 * ==========================================
 */
class GameManager {
  constructor() {
    this.core = new GameCore();
    this.renderer = new Renderer('gameCanvas');
    this.input = new InputManager(this.core);

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);

    this.setupConfigListeners();
  }

  setupConfigListeners() {
    const elements = ['cfgARR', 'cfgDAS', 'cfgDCD', 'cfgSDF', 'cfgPreventAccident', 'cfgCancelDasOnDir', 'cfgPreferMovement', 'cfgKickTable', 'cfgIRS', 'cfgIHS'];
    elements.forEach(id => {
      const el = document.getElementById(id);
      if(el) {
        el.addEventListener('input', () => this.core.updateConfigFromUI());
        el.addEventListener('change', () => this.core.updateConfigFromUI());
      }
    });
  }

  start() {
    this.core.start();
    requestAnimationFrame(this.loop);
  }

  loop(time) {
    const dt = time - this.lastTime;
    this.lastTime = time;

    this.input.update(dt);
    this.core.update(dt);
    this.renderer.render(this.core);

    requestAnimationFrame(this.loop);
  }
}

window.onload = () => {
  const game = new GameManager();
  game.start();
};
