import type { GameAction } from './types.ts';
import { GameCore } from './gamecore.ts';

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
} as const satisfies Record<string, GameAction>;

export class InputManager {
  core: GameCore;
  keys: Partial<Record<typeof KEY_BINDINGS[keyof typeof KEY_BINDINGS], boolean>>;
  timers: Partial<Record<typeof KEY_BINDINGS[keyof typeof KEY_BINDINGS], number>>;
  lastMoveKey: 'MoveLeft' | 'MoveRight' | null;
  dasCharged: Map<typeof KEY_BINDINGS[keyof typeof KEY_BINDINGS] | null, number>;

  constructor(gameCore: GameCore) {
    this.core = gameCore;
    this.keys = {};
    this.timers = {};
    this.dasCharged = new Map();
    this.lastMoveKey = null;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      const action = KEY_BINDINGS[e.code as keyof typeof KEY_BINDINGS]; // HACK: 次の行で確実に弾かれるからas使う
      if (action) {
        if (action === 'Reset') { this.core.start(); return; }
        if (action === 'Pause') { this.core.togglePause(); return; }
        if (this.core.state === 'GAMEOVER') { this.core.start(); return; }

        if (action === 'MoveLeft' || action === 'MoveRight') {
          if (!this.keys[action]) {
            this.lastMoveKey = action;
            const opposite = action === 'MoveLeft' ? 'MoveRight' : 'MoveLeft';
            this.dasCharged.set(opposite, 0);
            this.timers[opposite] = 0;

            if (this.core.config.cancelDasOnDir) {
              this.dasCharged.set(action, 0);
            }
          }
        }

        if (!this.keys[action]) {
          this.keys[action] = true;
          this.timers[action] = 0;
          this.dasCharged.set(action, 0);

          this.core.keyPresses++;
          this.core.handleAction(action);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const action = KEY_BINDINGS[e.code as keyof typeof KEY_BINDINGS]; // HACK
      if (action) {
        this.keys[action] = false;

        if (action === 'MoveLeft' || action === 'MoveRight') {
          const opposite = action === 'MoveLeft' ? 'MoveRight' : 'MoveLeft';
          if (this.keys[opposite]) {
            this.lastMoveKey = opposite;
            this.dasCharged.set(opposite, 0);
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

  update(dt: number) {
    if (this.core.state !== 'PLAYING') {
      this.checkBufferInputs();
      return;
    }

    this.core.isSoftDropping = !!this.keys['SoftDrop'];

    const activeMoveKey = this.lastMoveKey;
    let isDASCharged = false;

    if (activeMoveKey && this.keys[activeMoveKey]) {
      this.dasCharged.set(activeMoveKey, this.dasCharged.get(activeMoveKey)! + dt); // FIXME: !していいのか
      if (this.dasCharged.get(activeMoveKey) as number >= this.core.config.das) {
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
        this.timers[activeMoveKey]! += dt;  // FIXME: !していいのか

        if (this.core.config.arr === 0) {
          while (!this.core.board.collides(this.core.currentMino.matrix, this.core.minoX + (activeMoveKey === 'MoveLeft' ? -1 : 1), this.core.minoY)) {
            this.core.handleAction(activeMoveKey);
          }
        } else if (this.timers[activeMoveKey]! >= this.core.config.arr) {
          this.core.handleAction(activeMoveKey);
          this.timers[activeMoveKey]! -= this.core.config.arr;
        }
      }
    }
  }
}
