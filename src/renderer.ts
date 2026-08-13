import type { MinoType, MinoMatrix } from './types.ts';
import { BOARD_HIDDEN_HEIGHT, BOARD_TOTAL_HEIGHT, BOARD_VISIBLE_HEIGHT, BOARD_WIDTH, MINOS } from './constants.ts';
import { Tetromino } from './tetromino.ts';
import type { GameCore } from './gamecore.ts';
import type { Placement } from './ai/types.ts';
import { getMatrix } from './ai/pure.ts';

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  readonly blockSize: number;
  readonly boardOffsetX: number;
  readonly boardOffsetY: number;
  aiGhostSequence: Array<{ piece: MinoType; rotation: import('./types.ts').MinoState; x: number; y: number; lastActionWasRotation?: boolean; lastKickIndex?: number }> = [];
  aiAutoActive: boolean = false;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !(canvas instanceof HTMLCanvasElement))
      throw new Error('Could not get canvas');
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx)
      throw new Error('Could not get context');
    this.ctx = ctx;
    this.blockSize = 24;

    this.boardOffsetX = 120;
    this.boardOffsetY = 120;
  }

  hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  drawBlockRaw(px: number, py: number, type: MinoType | null, size: number, isGhost = false, isGray = false) {
    let color: string;
    if (isGray || type === null) {
      color = '#475569';
    } else {
      color = MINOS[type].color;
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

  drawGridBlock(x: number, y: number, type: MinoType | null, isGhost = false) {
    const px = this.boardOffsetX + x * this.blockSize;
    const py = this.boardOffsetY + y * this.blockSize;
    this.drawBlockRaw(px, py, type, this.blockSize, isGhost);
  }

  drawMiniMino(matrix: MinoMatrix, type: MinoType | null, x: number, y: number, isGray = false) {
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

  setAIGhostSequence(sequence: Array<{ piece: MinoType; rotation: import('./types.ts').MinoState; x: number; y: number; lastActionWasRotation?: boolean; lastKickIndex?: number }>) {
    this.aiGhostSequence = sequence;
  }

  setAIAutoActive(active: boolean) {
    this.aiAutoActive = active;
  }

  render(core: GameCore) {
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
      // AI自動操作中は通常ゴーストを非表示にして AI 予測と混ざらないようにする
      if (!this.aiAutoActive) {
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (core.currentMino.matrix[r][c]) {
              const drawY = ghostY + r - BOARD_HIDDEN_HEIGHT;
              this.drawGridBlock(core.minoX + c, drawY, core.currentMino.type, true);
            }
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

      // AIゴーストシーケンス表示（複数手、透明度を変えて描画）
      this.aiGhostSequence.forEach((ghost, idx) => {
        const matrix = getMatrix(ghost.piece, ghost.rotation);
        const nAI = matrix.length;
        const alpha = Math.max(0.2, 0.7 - idx * 0.08);
        const color = MINOS[ghost.piece].color;
        for (let r = 0; r < nAI; r++) {
          for (let c = 0; c < nAI; c++) {
            if (matrix[r][c]) {
              const drawY = ghost.y + r - BOARD_HIDDEN_HEIGHT;
              if (drawY >= 0 && drawY < BOARD_VISIBLE_HEIGHT) {
                const px = this.boardOffsetX + (ghost.x + c) * this.blockSize;
                const py = this.boardOffsetY + drawY * this.blockSize;
                this.ctx.fillStyle = this.hexToRgba(color, alpha * 0.25);
                this.ctx.fillRect(px, py, this.blockSize, this.blockSize);
                this.ctx.strokeStyle = this.hexToRgba(color, alpha * 0.9);
                this.ctx.lineWidth = 1.5;
                this.ctx.setLineDash([4, 3]);
                this.ctx.strokeRect(px, py, this.blockSize, this.blockSize);
                this.ctx.setLineDash([]);
              }
            }
          }
        }
      });
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
