import { GameCore } from './gamecore.ts';
import { InputManager } from './inputmanager.ts';
import { Renderer } from './renderer.ts';
import { Tetromino } from './tetromino.ts';
import { getMatrix } from './ai/pure.ts';
import type { MinoType, MinoState } from './types.ts';
import { BitBoard } from './ai/bitboard.ts';
import { TemplateStock } from './ai/templatestock.ts';

export class GameManager {
  core: GameCore;
  renderer: Renderer;
  input: InputManager;
  lastTime: number;
  aiWorker: Worker | null = null;
  aiEnabled: boolean = false;
  aiBusy: boolean = false;
  aiPending: boolean = false;
  aiSearchId: number = 0;
  lastSearchKey: string = '';
  aiAutoEnabled: boolean = false;
  aiGhostSequence: Array<{ piece: MinoType; rotation: MinoState; x: number; y: number; lastActionWasRotation?: boolean; lastKickIndex?: number }> = [];
  private templateStock = new TemplateStock();
  aiContinuousEnabled: boolean = false;

  constructor() {
    this.core = new GameCore();
    this.renderer = new Renderer('gameCanvas');
    this.input = new InputManager(this.core);

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);

    this.setupConfigListeners();
    this.setupAI();
  }

  setupConfigListeners() {
    const elements = ['cfgARR', 'cfgDAS', 'cfgDCD', 'cfgSDF', 'cfgPreventAccident', 'cfgCancelDasOnDir', 'cfgPreferMovement', 'cfgGravityZero', 'cfgKickTable', 'cfgIRS', 'cfgIHS'];
    elements.forEach(id => {
      const el = document.getElementById(id);
      if(el) {
        el.addEventListener('input', () => this.core.updateConfigFromUI());
        el.addEventListener('change', () => this.core.updateConfigFromUI());
      }
    });
  }

  setupAI() {
    const toggle = document.getElementById('aiToggle') as HTMLInputElement | null;
    const autoToggle = document.getElementById('aiAutoToggle') as HTMLInputElement | null;
    const continuousToggle = document.getElementById('aiContinuousToggle') as HTMLInputElement | null;
    const gravityZeroCheckbox = document.getElementById('cfgGravityZero') as HTMLInputElement | null;

    const updateAIEnabled = () => {
      this.aiEnabled = toggle?.checked ?? false;
      this.aiAutoEnabled = autoToggle?.checked ?? false;
      this.aiContinuousEnabled = continuousToggle?.checked ?? false;
      if (gravityZeroCheckbox) {
        gravityZeroCheckbox.disabled = this.aiAutoEnabled;
        if (this.aiAutoEnabled) {
          gravityZeroCheckbox.checked = true;
          this.core.updateConfigFromUI();
        }
      }
      const output = document.getElementById('aiOutput');
      const statusOverlay = document.getElementById('aiStatusOverlay');
      const statusText = document.getElementById('aiStatusText');
      const statusDetail = document.getElementById('aiStatusDetail');
      const stockCount = document.getElementById('aiStockCount');
      if (statusOverlay) statusOverlay.classList.toggle('hidden', !this.aiEnabled);
      if (this.aiEnabled) {
        if (statusText) statusText.textContent = this.aiAutoEnabled ? 'AI AUTO' : 'AI ON';
        if (output) output.textContent = 'AI waiting for new piece...';
        if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;
        this.lastSearchKey = '';
        this.aiGhostSequence = [];
        this.renderer.setAIGhostSequence([]);
        this.triggerSearchIfNeeded();
      } else {
        if (output) output.textContent = '';
        if (statusText) statusText.textContent = 'AI OFF';
        if (statusDetail) statusDetail.textContent = '';
        if (stockCount) stockCount.textContent = '';
        this.aiGhostSequence = [];
        this.renderer.setAIGhostSequence([]);
        this.aiPending = false;
        if (this.aiWorker) {
          this.aiWorker.terminate();
          this.aiWorker = null;
        }
        this.aiBusy = false;
      }
    };

    toggle?.addEventListener('change', updateAIEnabled);
    autoToggle?.addEventListener('change', updateAIEnabled);
    continuousToggle?.addEventListener('change', updateAIEnabled);

    updateAIEnabled();
  }

  private getSearchKey(): string {
    return `${this.core.piecesPlaced}|${this.core.currentMino.type}|${this.core.nextQueue.join(',')}|${this.core.holdType}|${this.core.comboCount}|${this.core.difficultClearCount}`;
  }

  private triggerSearchIfNeeded() {
    if (!this.aiEnabled || this.core.state !== 'PLAYING') return;
    const key = this.getSearchKey();
    if (key === this.lastSearchKey) return;
    this.lastSearchKey = key;

    // テンプレートストックを先に照会
    const board = BitBoard.fromGrid(this.core.board.grid);
    const stockResult = this.templateStock.query(
      board,
      this.core.currentMino.type,
      this.core.nextQueue,
      this.core.holdType,
    );
    if (stockResult) {
      this.aiBusy = false;
      this.aiGhostSequence = stockResult.placements;
      this.renderer.setAIGhostSequence(this.aiGhostSequence);
      const stockCount = document.getElementById('aiStockCount');
      if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;
      if (this.aiAutoEnabled && this.aiGhostSequence.length > 0) {
        this.executeAIPlacement(this.aiGhostSequence[0]);
      }
      return;
    }

    // 新しい探索を開始する前に、実行中なら古いワーカーを終了
    if (this.aiWorker) {
      this.aiWorker.terminate();
      this.aiWorker = null;
    }
    this.aiBusy = false;
    this.aiPending = false;
    this.aiSearchId++;

    const searchId = this.aiSearchId;
    this.aiBusy = true;
    const output = document.getElementById('aiOutput');
    const statusDetail = document.getElementById('aiStatusDetail');
    const statusText = document.getElementById('aiStatusText');
    if (statusText) statusText.textContent = 'AI ON';
    const stockCount = document.getElementById('aiStockCount');
    if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;
    const totalDepthGuess = this.core.nextQueue.length + 1;
    if (output) output.textContent = `Searching... 0/${totalDepthGuess}`;
    if (statusDetail) statusDetail.textContent = `Depth 0/${totalDepthGuess}`;

    this.aiWorker = new Worker(new URL('./ai/searchWorker.ts', import.meta.url), { type: 'module' });
    this.aiWorker.onmessage = (e) => {
      const data = e.data;
      if (data.searchId !== searchId) return; // 古い探索の結果は無視

      if (data.type === 'result') {
        this.aiBusy = false;
        if (output) output.textContent = JSON.stringify(data.placements, null, 2);
        if (statusDetail) statusDetail.textContent = 'Finished';
        if (statusText) statusText.textContent = this.aiAutoEnabled ? 'AI AUTO' : 'AI ON';
        if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;
        if (data.placements && data.placements.length > 0) {
          this.aiGhostSequence = data.placements.map(p => ({
            piece: p.piece,
            rotation: p.rotation,
            x: p.x,
            y: p.y,
            lastActionWasRotation: p.lastActionWasRotation,
            lastKickIndex: p.lastKickIndex,
          }));
        } else {
          this.aiGhostSequence = [];
        }
        this.renderer.setAIGhostSequence(this.aiGhostSequence);

        // 結果をテンプレートストックに追加
        if (data.placements && data.placements.length > 0) {
          this.templateStock.store(
            BitBoard.fromGrid(this.core.board.grid),
            this.core.currentMino.type,
            this.core.nextQueue.slice(),
            this.core.holdType,
            data.placements,
            data.attack ?? 0,
          );
          if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;
        }

        if (this.aiAutoEnabled && this.aiGhostSequence.length > 0) {
          this.executeAIPlacement(this.aiGhostSequence[0]);
          if (!this.aiContinuousEnabled) {
            const autoToggle = document.getElementById('aiAutoToggle') as HTMLInputElement | null;
            if (autoToggle) autoToggle.checked = false;
            this.aiAutoEnabled = false;
          }
        }
        // 終了後、新たな探索が必要か確認
        if (this.aiPending) {
          this.aiPending = false;
          this.triggerSearchIfNeeded();
        }
      } else if (data.type === 'progress') {
        if (output) output.textContent = `Searching... ${data.depth}/${data.totalDepth} (candidates: ${data.candidates})`;
        if (statusDetail) statusDetail.textContent = `Depth ${data.depth}/${data.totalDepth} | Candidates: ${data.candidates}`;
        if (data.placements) {
          this.aiGhostSequence = data.placements.map(p => ({
            piece: p.piece,
            rotation: p.rotation,
            x: p.x,
            y: p.y,
            lastActionWasRotation: p.lastActionWasRotation,
            lastKickIndex: p.lastKickIndex,
          }));
          this.renderer.setAIGhostSequence(this.aiGhostSequence);
        }
      } else if (data.type === 'error') {
        this.aiBusy = false;
        if (output) output.textContent = 'AI error: ' + data.error;
        if (statusDetail) statusDetail.textContent = 'Error';
        if (statusText) statusText.textContent = 'AI ERROR';
        this.aiGhostSequence = [];
        this.renderer.setAIGhostSequence([]);
        if (this.aiPending) {
          this.aiPending = false;
          this.triggerSearchIfNeeded();
        }
      }
    };
    this.aiWorker.onerror = (e) => {
      this.aiBusy = false;
      if (output) output.textContent = 'Worker error: ' + e.message;
      this.aiGhostSequence = [];
      this.renderer.setAIGhostSequence([]);
      if (this.aiPending) {
        this.aiPending = false;
        this.triggerSearchIfNeeded();
      }
    };

    this.aiWorker.postMessage({
      type: 'search',
      searchId,
      boardGrid: this.core.board.grid,
      current: this.core.currentMino.type,
      bag: this.core.nextQueue.slice(),
      hold: this.core.holdType,
      canHold: this.core.canHold,
      comboCount: this.core.comboCount,
      difficultClearCount: this.core.difficultClearCount,
      beamWidth: 60,
    });
  }

  private executeAIPlacement(p: { piece: MinoType; rotation: MinoState; x: number; y: number; lastActionWasRotation?: boolean; lastKickIndex?: number }) {
    if (this.core.state !== 'PLAYING') return;
    if (p.piece !== this.core.currentMino.type) {
      if (!this.core.canHold) return; // ホールドできない場合は実行不能
      this.core.hold();
      // hold後、現在のミノがp.pieceになっているはず
      if (this.core.currentMino.type !== p.piece) return; // それでも一致しない場合は諦める
    }
    // 現在のミノを指定回転に設定
    this.core.currentMino.state = p.rotation;
    this.core.currentMino.matrix = getMatrix(p.piece, p.rotation);
    this.core.minoX = p.x;
    this.core.minoY = p.y;
    this.core.lastActionWasRotation = p.lastActionWasRotation ?? false;
    this.core.lastKickIndex = p.lastKickIndex ?? 0;
    this.core.lockPiece();
    // 設置後、AIの探索状態をリセットして新たな探索を促す
    this.lastSearchKey = '';
    this.aiBusy = false;
    this.aiGhostSequence = [];
    this.renderer.setAIGhostSequence([]);
    // 明示的に次の探索を開始
    this.triggerSearchIfNeeded();
  }

  start() {
    this.core.start();
    requestAnimationFrame(this.loop);
  }

  loop(time: number) {
    const dt = time - this.lastTime;
    this.lastTime = time;

    this.input.update(dt);
    this.core.update(dt);
    this.renderer.render(this.core);

    this.triggerSearchIfNeeded();

    requestAnimationFrame(this.loop);
  }
}
