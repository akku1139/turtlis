import { GameCore } from './gamecore.ts';
import { InputManager } from './inputmanager.ts';
import { Renderer } from './renderer.ts';
import { suggestBestPlan } from './ai/search.ts';

export class GameManager {
  core: GameCore;
  renderer: Renderer;
  input: InputManager;
  lastTime: number;
  aiWorker: Worker | null = null;

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

  suggestAI() {
    if (this.core.state !== 'PLAYING') return;

    const aiBtn = document.getElementById('aiSuggestBtn') as HTMLButtonElement | null;
    const aiOutput = document.getElementById('aiOutput');
    if (aiBtn) aiBtn.disabled = true;
    if (aiOutput) aiOutput.textContent = 'AI thinking...';

    if (!this.aiWorker) {
      this.aiWorker = new Worker(new URL('./ai/searchWorker.ts', import.meta.url), { type: 'module' });
      this.aiWorker.onmessage = (e) => {
        const data = e.data;
        if (data.type === 'result') {
          if (aiOutput) aiOutput.textContent = JSON.stringify(data.placements, null, 2);
        } else if (data.type === 'error') {
          if (aiOutput) aiOutput.textContent = 'AI error: ' + data.error;
        }
        if (aiBtn) aiBtn.disabled = false;
      };
      this.aiWorker.onerror = (e) => {
        if (aiOutput) aiOutput.textContent = 'Worker error: ' + e.message;
        if (aiBtn) aiBtn.disabled = false;
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
      beamWidth: 200,
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

    requestAnimationFrame(this.loop);
  }
}
