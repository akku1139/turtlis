import { GameCore } from './gamecore.ts';
import { InputManager } from './inputmanager.ts';
import { Renderer } from './renderer.ts';
import type { Placement } from './ai/types.ts';

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
  aiGhostSequence: Array<{ piece: import('./types.ts').MinoType; rotation: import('./types.ts').MinoState; x: number; y: number }> = [];

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
    const elements = ['cfgARR', 'cfgDAS', 'cfgDCD', 'cfgSDF', 'cfgPreventAccident', 'cfgCancelDasOnDir', 'cfgPreferMovement', 'cfgKickTable', 'cfgIRS', 'cfgIHS'];
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
    toggle?.addEventListener('change', () => {
      this.aiEnabled = toggle.checked;
      const output = document.getElementById('aiOutput');
      const statusOverlay = document.getElementById('aiStatusOverlay');
      const statusText = document.getElementById('aiStatusText');
      if (statusOverlay) statusOverlay.classList.toggle('hidden', !this.aiEnabled);
      if (this.aiEnabled) {
        if (output) output.textContent = 'AI waiting for new piece...';
        if (statusText) statusText.textContent = 'AI ON';
        this.lastSearchKey = '';
        this.aiGhostSequence = [];
        this.renderer.setAIGhostSequence([]);
        this.triggerSearchIfNeeded();
      } else {
        if (output) output.textContent = '';
        if (statusText) statusText.textContent = 'AI OFF';
        this.aiGhostSequence = [];
        this.renderer.setAIGhostSequence([]);
        this.aiPending = false;
        if (this.aiWorker) {
          this.aiWorker.terminate();
          this.aiWorker = null;
        }
        this.aiBusy = false;
      }
    });
  }

  private getSearchKey(): string {
    return `${this.core.piecesPlaced}|${this.core.currentMino.type}|${this.core.nextQueue.join(',')}|${this.core.holdType}|${this.core.comboCount}|${this.core.difficultClearCount}`;
  }

  private triggerSearchIfNeeded() {
    if (!this.aiEnabled || this.core.state !== 'PLAYING') return;
    const key = this.getSearchKey();
    if (key === this.lastSearchKey) return;
    this.lastSearchKey = key;

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
        if (statusText) statusText.textContent = 'AI ON';
        if (data.placements && data.placements.length > 0) {
          this.aiGhostSequence = data.placements.map(p => ({
            piece: p.piece,
            rotation: p.rotation,
            x: p.x,
            y: p.y,
          }));
        } else {
          this.aiGhostSequence = [];
        }
        this.renderer.setAIGhostSequence(this.aiGhostSequence);
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
      beamWidth: 80,
    });
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
