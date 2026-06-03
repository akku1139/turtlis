import type { MinoType, MinoState, MinoRotation, InitialSystemOption, GameAction } from './types.ts';
import { type KickTable, SRSKickTable, SRSPlusKickTable } from './kicktable.ts';
import { Tetromino } from './tetromino.ts';
import { Board } from './board.ts';
import { BOARD_HIDDEN_HEIGHT, BOARD_TOTAL_HEIGHT, BOARD_WIDTH, F_TO_MS } from './constants.ts';

export class GameCore {
  kickTable: KickTable;
  board: Board;

  state!: string;
  score!: number;
  lines!: number;
  level!: number;
  comboCount!: number;
  difficultClearCount!: number;

  piecesPlaced!: number;
  keyPresses!: number;
  playTime!: number;
  totalAttackSent!: number;

  nextQueue!: MinoType[];
  holdType!: MinoType | null; // FIXME
  canHold!: boolean;

  currentMino!: Tetromino;
  minoX!: number;
  minoY!: number;

  fallTimer!: number;
  lockTimer!: number;
  lockResets!: number;
  lowestY!: number;

  gravityDelay!: number;
  lockDelay!: number;

  actionMessage!: string;
  comboMessage!: string;
  lastAttackMessage!: string;
  actionTimer!: number;

  lastActionWasRotation!: boolean;
  lastKickIndex!: number; // FIXME ?
  isSoftDropping!: boolean;

  config!: {
    arr: number,
    das: number,
    dcd: number,
    sdf: number,
    preventAccident: boolean,
    cancelDasOnDir: boolean,
    preferMovement: boolean,
    irs: InitialSystemOption,
    ihs: InitialSystemOption,
  };

  dcdTimer!: number;
  accidentalHardDropPreventTimer!: number;

  bufferedHold!: boolean;
  bufferedRotation!: MinoRotation | null; // FIXME

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

    this.currentMino = null as any as Tetromino; // HACK
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
      ihs: 'TAP',
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
    const arrVal = parseFloat((document.getElementById('cfgARR') as HTMLInputElement).value);
    const dasVal = parseFloat((document.getElementById('cfgDAS') as HTMLInputElement).value);
    const dcdVal = parseFloat((document.getElementById('cfgDCD') as HTMLInputElement).value);
    const sdfVal = parseFloat((document.getElementById('cfgSDF') as HTMLInputElement).value);

    (document.getElementById('arrVal') as HTMLSpanElement).textContent = arrVal === 0 ? "0.0F (ワープ)" : `${arrVal.toFixed(1)}F (${Math.round(arrVal * F_TO_MS)}ms)`;
    (document.getElementById('dasVal') as HTMLSpanElement).textContent = `${dasVal.toFixed(1)}F (${Math.round(dasVal * F_TO_MS)}ms)`;
    (document.getElementById('dcdVal') as HTMLSpanElement).textContent = dcdVal === 0 ? "0.0F (なし)" : `${dcdVal.toFixed(1)}F (${Math.round(dcdVal * F_TO_MS)}ms)`;
    (document.getElementById('sdfVal') as HTMLSpanElement).textContent = sdfVal > 40 ? "INF (無限)" : `${sdfVal}x`;

    this.config.arr = arrVal * F_TO_MS;
    this.config.das = dasVal * F_TO_MS;
    this.config.dcd = dcdVal * F_TO_MS;
    this.config.sdf = sdfVal > 40 ? Infinity : sdfVal;

    this.config.preventAccident = (document.getElementById('cfgPreventAccident') as HTMLInputElement).checked;
    this.config.cancelDasOnDir = (document.getElementById('cfgCancelDasOnDir') as HTMLInputElement).checked;
    this.config.preferMovement = (document.getElementById('cfgPreferMovement') as HTMLInputElement).checked;
    this.config.irs = (document.getElementById('cfgIRS') as HTMLSelectElement).value as InitialSystemOption;
    this.config.ihs = (document.getElementById('cfgIHS') as HTMLSelectElement).value as InitialSystemOption;

    const kickTableType = (document.getElementById('cfgKickTable') as HTMLSelectElement).value;
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
    this.nextQueue.push(...types as MinoType[]);
  }

  spawnPiece() {
    if (this.bufferedHold && this.canHold) {
      this.bufferedHold = false;
      this.executeHold();
      return;
    }
    this.bufferedHold = false;

    const nextType = this.nextQueue.shift();
    this.currentMino = new Tetromino(nextType as MinoType);

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

  update(dt: number) {
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

  handleAction(action: GameAction) {
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

  handleRotate(direction: MinoRotation) {
    if (this.currentMino.type === 'O') return false;

    let toState = this.currentMino.state;
    if (direction === 'CW') toState = (toState + 1) % 4;
    else if (direction === 'CCW') toState = (toState + 3) % 4;
    else if (direction === '180') toState = (toState + 2) % 4;

    const newMatrix = this.currentMino.getRotatedMatrix(direction);
    const kicks = this.kickTable.getKicks(this.currentMino.type, this.currentMino.state, toState as MinoState);

    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const testX = this.minoX + dx;
      const testY = this.minoY - dy;

      if (!this.board.collides(newMatrix, testX, testY)) {
        this.minoX = testX;
        this.minoY = testY;
        this.currentMino.matrix = newMatrix;
        this.currentMino.state = toState as MinoState;
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
