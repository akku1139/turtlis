import { GameCore } from './gamecore.ts';
import { InputManager } from './inputmanager.ts';
import { Renderer } from './renderer.ts';

export class GameManager {
  core: GameCore;
  renderer: Renderer;
  input: InputManager;
  lastTime: number;

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

  loop(time: number) {
    const dt = time - this.lastTime;
    this.lastTime = time;

    this.input.update(dt);
    this.core.update(dt);
    this.renderer.render(this.core);

    requestAnimationFrame(this.loop);
  }
}
