import { GameCore } from './gamecore.ts';
import { InputManager } from './inputmanager.ts';
import { Renderer } from './renderer.ts';
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
  aiAutoEnabled: boolean = false;
  aiContinuousEnabled: boolean = false;
  aiBusy: boolean = false;
  aiSearchId: number = 0;
  lastSearchKey: string = '';

  private templateStock = new TemplateStock();
  private aiWarmStartPlacements: Array<{
    piece: MinoType;
    rotation: MinoState;
    x: number;
    y: number;
    lastActionWasRotation?: boolean;
    lastKickIndex?: number;
  }> = [];
  private lastProcessedPiecesPlaced = -1;
  private aiPlanBoardHashes: string[] = [];
  private aiPlacementQueue: Array<{
    piece: MinoType;
    rotation: MinoState;
    x: number;
    y: number;
    lastActionWasRotation?: boolean;
    lastKickIndex?: number;
  }> = [];

  aiGhostSequence: Array<{
    piece: MinoType;
    rotation: MinoState;
    x: number;
    y: number;
    lastActionWasRotation?: boolean;
    lastKickIndex?: number;
  }> = [];

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
    const elements = [
      'cfgARR',
      'cfgDAS',
      'cfgDCD',
      'cfgSDF',
      'cfgPreventAccident',
      'cfgCancelDasOnDir',
      'cfgPreferMovement',
      'cfgGravityZero',
      'cfgKickTable',
      'cfgIRS',
      'cfgIHS',
    ];
    elements.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
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
    const kickTableSelect = document.getElementById('cfgKickTable') as HTMLSelectElement | null;

    const updateAIEnabled = () => {
      const prevEnabled = this.aiEnabled;
      const prevAuto = this.aiAutoEnabled;
      const prevContinuous = this.aiContinuousEnabled;

      // SRS (not SRS+) が選択されている場合はAIを強制無効化
      if (kickTableSelect?.value === 'SRS') {
        this.aiEnabled = false;
        this.aiAutoEnabled = false;
        this.aiContinuousEnabled = false;
        if (toggle) {
          toggle.checked = false;
          toggle.disabled = true;
        }
        if (autoToggle) {
          autoToggle.checked = false;
          autoToggle.disabled = true;
        }
        if (continuousToggle) {
          continuousToggle.checked = false;
          continuousToggle.disabled = true;
        }
        this.restartSearch();

        const output = document.getElementById('aiOutput');
        const statusOverlay = document.getElementById('aiStatusOverlay');
        const statusText = document.getElementById('aiStatusText');
        const statusDetail = document.getElementById('aiStatusDetail');
        if (statusOverlay) statusOverlay.classList.add('hidden');
        if (output) output.textContent = '';
        if (statusText) statusText.textContent = 'AI OFF (SRS not supported)';
        if (statusDetail) statusDetail.textContent = '';
        return;
      }

      // SRS+ では通常どおり操作可能
      if (toggle) toggle.disabled = false;

      this.aiEnabled = toggle?.checked ?? false;
      this.aiAutoEnabled = autoToggle?.checked ?? false;
      this.aiContinuousEnabled = continuousToggle?.checked ?? false;

      // UI依存関係の disabled 制御
      if (autoToggle) autoToggle.disabled = !this.aiEnabled;
      if (continuousToggle) continuousToggle.disabled = !this.aiAutoEnabled;

      // Renderer に AI Auto 状態を反映
      this.renderer.setAIAutoActive(this.aiAutoEnabled);

      if (gravityZeroCheckbox) {
        gravityZeroCheckbox.disabled = this.aiAutoEnabled;
        if (this.aiAutoEnabled) {
          gravityZeroCheckbox.checked = true;
          this.core.updateConfigFromUI();
        }
      }

      const changed =
        prevEnabled !== this.aiEnabled ||
        prevAuto !== this.aiAutoEnabled ||
        prevContinuous !== this.aiContinuousEnabled;

      const output = document.getElementById('aiOutput');
      const statusOverlay = document.getElementById('aiStatusOverlay');
      const statusText = document.getElementById('aiStatusText');
      const statusDetail = document.getElementById('aiStatusDetail');
      const stockCount = document.getElementById('aiStockCount');

      if (statusOverlay) statusOverlay.classList.toggle('hidden', !this.aiEnabled);

      if (this.aiEnabled) {
        if (statusText) statusText.textContent = this.aiAutoEnabled ? 'AI AUTO' : 'AI ON';
        if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;
        if (changed) {
          this.restartSearch();
        } else {
          if (output) output.textContent = 'AI waiting for new piece...';
        }
      } else {
        if (output) output.textContent = '';
        if (statusText) statusText.textContent = 'AI OFF';
        if (statusDetail) statusDetail.textContent = '';
        if (stockCount) stockCount.textContent = '';
        this.aiGhostSequence = [];
        this.renderer.setAIGhostSequence([]);
        this.aiPlacementQueue = [];
        this.aiWarmStartPlacements = [];
        this.restartSearch(); // Ensure worker stopped
      }
    };

    toggle?.addEventListener('change', updateAIEnabled);
    autoToggle?.addEventListener('change', updateAIEnabled);
    continuousToggle?.addEventListener('change', updateAIEnabled);
    kickTableSelect?.addEventListener('change', updateAIEnabled);

    updateAIEnabled();
  }

  private restartSearch(): void {
    if (this.aiWorker) {
      this.aiWorker.terminate();
      this.aiWorker = null;
    }
    this.aiBusy = false;
    this.aiSearchId = 0;
    this.lastSearchKey = '';
    this.lastProcessedPiecesPlaced = this.core.piecesPlaced;
    this.aiPlacementQueue = [];       // ★ キューをクリア
    this.aiWarmStartPlacements = [];
    this.aiGhostSequence = [];
    this.aiPlanBoardHashes = [];
    this.renderer.setAIGhostSequence([]);
    if (this.aiEnabled) {
      this.triggerSearchIfNeeded();
    }
  }

  private getSearchKey(): string {
    return `${this.core.piecesPlaced}|${this.core.currentMino.type}|${this.core.nextQueue.join(',')}|${this.core.holdType}|${this.core.comboCount}|${this.core.difficultClearCount}`;
  }

  private triggerSearchIfNeeded() {
    if (!this.aiEnabled || this.core.state !== 'PLAYING') return;

    if (this.core.piecesPlaced < this.lastProcessedPiecesPlaced) {
      this.restartSearch();
      return;
    }

    if (this.core.piecesPlaced !== this.lastProcessedPiecesPlaced) {
      this.lastSearchKey = '';
      this.lastProcessedPiecesPlaced = this.core.piecesPlaced;
    }

    const key = this.getSearchKey();
    if (key === this.lastSearchKey) return;
    if (this.aiPlacementQueue.length > 0) return; // ★ キューが残っていれば探索しない
    this.lastSearchKey = key;

    const board = BitBoard.fromGrid(this.core.board.grid);
    const stockResult = this.templateStock.query(
      board,
      this.core.currentMino.type,
      this.core.nextQueue,
      this.core.holdType,
    );

    if (stockResult && stockResult.placements.length > 0) {
      this.aiGhostSequence = stockResult.placements;
      this.aiWarmStartPlacements = stockResult.placements.slice(1);
      this.renderer.setAIGhostSequence(this.aiGhostSequence);

      if (this.aiAutoEnabled) {
        // 自動操作時はテンプレートの手順をすべてキューに入れる
        this.aiPlacementQueue = [...this.aiGhostSequence];
      }
      return;
    }

    // 近似テンプレートがあれば、その配置列を warm start として利用する
    if (this.aiWarmStartPlacements.length === 0) {
      const approximate = this.templateStock.getBestApproximate(
        board,
        this.core.currentMino.type,
        this.core.nextQueue,
        this.core.holdType,
      );
      if (approximate && approximate.placements.length > 1) {
        this.aiWarmStartPlacements = approximate.placements.slice(0, 2);
      }
    }

    if (this.aiBusy) return;
    this.aiBusy = true;

    const output = document.getElementById('aiOutput');
    const statusDetail = document.getElementById('aiStatusDetail');
    const statusText = document.getElementById('aiStatusText');
    const stockCount = document.getElementById('aiStockCount');

    if (statusText) statusText.textContent = this.aiAutoEnabled ? 'AI AUTO' : 'AI ON';
    if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;
    const totalDepthGuess = this.core.nextQueue.length + 1;
    if (output) output.textContent = `Searching... 0/${totalDepthGuess}`;
    if (statusDetail) statusDetail.textContent = `Depth 0/${totalDepthGuess}`;

    if (!this.aiWorker) {
      this.aiWorker = new Worker(new URL('./ai/searchWorker.ts', import.meta.url), {
        type: 'module',
      });

      this.aiWorker.onmessage = (e) => {
        const data = e.data;

        if (data.type === 'result') {
          if (data.searchId !== this.aiSearchId) return;

          if (data.searchKey !== this.getSearchKey()) {
            this.aiBusy = false;
            return;
          }

          this.aiBusy = false;
          if (output) output.textContent = JSON.stringify(data.placements, null, 2);
          if (statusDetail) statusDetail.textContent = 'Finished';
          if (statusText) statusText.textContent = this.aiAutoEnabled ? 'AI AUTO' : 'AI ON';
          if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;

          if (data.placements && data.placements.length > 0) {
            this.aiGhostSequence = data.placements.map(
              (p: { piece: MinoType; rotation: MinoState; x: number; y: number; lastActionWasRotation?: boolean; lastKickIndex?: number }) => ({
                piece: p.piece,
                rotation: p.rotation,
                x: p.x,
                y: p.y,
                lastActionWasRotation: p.lastActionWasRotation,
                lastKickIndex: p.lastKickIndex,
              }),
            );
            this.aiWarmStartPlacements = this.aiGhostSequence.slice(1);
            this.aiPlanBoardHashes = data.boardHashes ?? [];

            this.templateStock.store(
              BitBoard.fromGrid(this.core.board.grid),
              this.core.currentMino.type,
              this.core.nextQueue.slice(),
              this.core.holdType,
              data.placements,
              data.attack ?? 0,
            );
            if (stockCount) stockCount.textContent = `Stock: ${this.templateStock.size}`;

            if (this.aiAutoEnabled) {
              // ★ キューに全手をセット
              this.aiPlacementQueue = [...this.aiGhostSequence];
            }
          } else {
            this.aiGhostSequence = [];
            this.aiWarmStartPlacements = [];
            this.aiPlacementQueue = [];
          }
          this.renderer.setAIGhostSequence(this.aiGhostSequence);
        } else if (data.type === 'progress') {
          if (data.searchId !== this.aiSearchId) return;
          if (data.searchKey !== this.getSearchKey()) return;

        if (output)
          output.textContent = `Searching... ${data.depth}/${data.totalDepth} (candidates: ${data.candidates}, best ATK: ${data.bestAttack ?? 0})`;
        if (statusDetail)
          statusDetail.textContent = `Depth ${data.depth}/${data.totalDepth} | Candidates: ${data.candidates} | Best ATK: ${data.bestAttack ?? 0} | Stock: ${this.templateStock.size}`;

          if (data.placements) {
            this.aiGhostSequence = data.placements.map(
              (p: { piece: MinoType; rotation: MinoState; x: number; y: number; lastActionWasRotation?: boolean; lastKickIndex?: number }) => ({
                piece: p.piece,
                rotation: p.rotation,
                x: p.x,
                y: p.y,
                lastActionWasRotation: p.lastActionWasRotation,
                lastKickIndex: p.lastKickIndex,
              }),
            );
            this.renderer.setAIGhostSequence(this.aiGhostSequence);
          }
        } else if (data.type === 'error') {
          if (data.searchId !== this.aiSearchId) return;

          if (data.searchKey !== this.getSearchKey()) {
            this.aiBusy = false;
            return;
          }

          this.aiBusy = false;
          if (output) output.textContent = 'AI error: ' + data.error;
          if (statusDetail) statusDetail.textContent = 'Error';
          if (statusText) statusText.textContent = 'AI ERROR';
          this.aiGhostSequence = [];
          this.renderer.setAIGhostSequence([]);
        }
      };

      this.aiWorker.onerror = (e) => {
        this.aiBusy = false;
        if (output) output.textContent = 'Worker error: ' + e.message;
        this.aiGhostSequence = [];
        this.renderer.setAIGhostSequence([]);
      };
    }

    this.aiSearchId++;
    this.aiWorker.postMessage({
      type: 'search',
      searchId: this.aiSearchId,
      searchKey: key,
      boardGrid: this.core.board.grid,
      current: this.core.currentMino.type,
      bag: this.core.nextQueue.slice(),
      hold: this.core.holdType,
      canHold: this.core.canHold,
      comboCount: this.core.comboCount,
      difficultClearCount: this.core.difficultClearCount,
      beamWidth: 100,
      maxDepth: 10,
      timeLimitMs: 2500,
      warmStartPlacements: this.aiWarmStartPlacements,
      planBoardHashes: this.aiPlanBoardHashes,
    });
    this.aiWarmStartPlacements = [];
  }

  private executeAIPlacement(p: {
    piece: MinoType;
    rotation: MinoState;
    x: number;
    y: number;
    lastActionWasRotation?: boolean;
    lastKickIndex?: number;
  }) {
    if (this.core.state !== 'PLAYING') return;

    if (p.piece !== this.core.currentMino.type) {
      if (!this.core.canHold) {
        this.aiPlacementQueue = []; // ★ キューを破棄
        return;
      }
      this.core.hold();
      if (this.core.currentMino.type !== p.piece) {
        this.aiPlacementQueue = [];
        return;
      }
    }

    const matrix = getMatrix(p.piece, p.rotation);
    if (this.core.board.collides(matrix, p.x, p.y)) {
      this.aiGhostSequence = [];
      this.renderer.setAIGhostSequence([]);
      this.aiWarmStartPlacements = [];
      this.aiPlacementQueue = [];
      this.lastSearchKey = '';
      return;
    }

    this.core.currentMino.state = p.rotation;
    this.core.currentMino.matrix = matrix;
    this.core.minoX = p.x;
    this.core.minoY = p.y;
    this.core.lastActionWasRotation = p.lastActionWasRotation ?? false;
    this.core.lastKickIndex = p.lastKickIndex ?? 0;
    this.core.lockPiece();

    this.lastSearchKey = '';
    this.lastProcessedPiecesPlaced = this.core.piecesPlaced;
    this.aiGhostSequence = [];
    this.renderer.setAIGhostSequence([]);
    this.aiWarmStartPlacements = [];
    this.aiPlanBoardHashes = [];
    // aiPlacementQueue は shift 済みなのでここでクリアしない

    if (this.aiAutoEnabled && !this.aiContinuousEnabled) {
      const autoToggle = document.getElementById('aiAutoToggle') as HTMLInputElement | null;
      if (autoToggle) {
        autoToggle.checked = false;
        autoToggle.dispatchEvent(new Event('change'));
      }
    }
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

    if (this.aiPlacementQueue.length > 0 && this.aiAutoEnabled && this.core.state === 'PLAYING') {
      const placement = this.aiPlacementQueue.shift();
      if (placement) {
        this.executeAIPlacement(placement);
        this.lastSearchKey = '';
        this.lastProcessedPiecesPlaced = this.core.piecesPlaced;
      }
    }

    this.renderer.render(this.core);
    this.triggerSearchIfNeeded();

    requestAnimationFrame(this.loop);
  }
}
