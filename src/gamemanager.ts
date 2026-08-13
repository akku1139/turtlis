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
  lastSearchKey: string = '';
  aiResult: Placement | null = null;

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
      if (this.aiEnabled) {
        if (output) output.textContent = 'AI waiting for new piece...';
        this.lastSearchKey = '';
        this.triggerSearchIfNeeded();
      } else {
        if (output) output.textContent = '';
        this.renderer.setAIGhost(null);
        this.aiPending = false;
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
    if (this.aiBusy) {
      this.aiPending = true;
      return;
    }
    this.aiBusy = true;
    const output = document.getElementById('aiOutput');
    if (output) output.textContent = 'AI thinking...';

    if (!this.aiWorker) {
      this.aiWorker = new Worker(new URL('./ai/searchWorker.ts', import.meta.url), { type: 'module' });
      this.aiWorker.onmessage = (e) => {
        const data = e.data;
        if (data.type === 'result') {
          this.aiBusy = false;
          if (output) output.textContent = JSON.stringify(data.placements, null, 2);
          if (data.placements && data.placements.length > 0) {
            const first = data.placements[0];
            this.renderer.setAIGhost({
              piece: first.piece,
              rotation: first.rotation,
              x: first.x,
              y: first.y,
              matrix: [], // renderer 側で再構築
              lastActionWasRotation: false,
              lastKickIndex: 0,
            });
          } else {
            this.renderer.setAIGhost(null);
          }
          if (this.aiPending) {
            this.aiPending = false;
            this.triggerSearchIfNeeded();
          }
        } else if (data.type === 'progress') {
          if (output) output.textContent = `AI thinking... (${data.depth}/${data.totalDepth}, candidates: ${data.candidates})`;
        } else if (data.type === 'error') {
          this.aiBusy = false;
          if (output) output.textContent = 'AI error: ' + data.error;
          this.renderer.setAIGhost(null);
          if (this.aiPending) {
            this.aiPending = false;
            this.triggerSearchIfNeeded();
          }
        }
      };
      this.aiWorker.onerror = (e) => {
        this.aiBusy = false;
        if (output) output.textContent = 'Worker error: ' + e.message;
        this.renderer.setAIGhost(null);
        if (this.aiPending) {
          this.aiPending = false;
          this.triggerSearchIfNeeded();
        }
      };
    }

    this.aiWorker.postMessage({
      type: 'search',
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
