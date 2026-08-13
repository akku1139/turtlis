/// <reference lib="webworker" />

import { beamSearch } from './beamsearch';
import { BitBoard } from './bitboard';
import type { SearchState, Placement } from './types';

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data.type === 'search') {
    const state: SearchState = {
      board: BitBoard.fromGrid(data.boardGrid),
      current: data.current,
      bag: data.bag,
      hold: data.hold,
      canHold: data.canHold,
      comboCount: data.comboCount,
      difficultClearCount: data.difficultClearCount,
      accumulatedAttack: 0,
      accumulatedScore: 0,
      placements: [],
    };

    try {
      const best = beamSearch(
        state,
        data.beamWidth ?? 80,
        undefined,
        (progress) => {
          (self as unknown as DedicatedWorkerGlobalScope).postMessage({
            type: 'progress',
            ...progress,
          });
        },
      );
      const placements = best.placements.map(p => ({
        piece: p.piece,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
      }));
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'result', placements });
    } catch (err) {
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'error', error: String(err) });
    }
  }
};
