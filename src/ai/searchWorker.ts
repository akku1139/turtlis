/// <reference lib="webworker" />

import { beamSearch } from './beamsearch';
import { BitBoard } from './bitboard';
import type { SearchState, Placement } from './types';

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data.type === 'search') {
    const searchId = data.searchId;
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
            searchId,
            depth: progress.depth,
            totalDepth: progress.totalDepth,
            candidates: progress.candidates,
            placements: progress.bestState.placements.map(p => ({
              piece: p.piece,
              rotation: p.rotation,
              x: p.x,
              y: p.y,
              lastActionWasRotation: p.lastActionWasRotation,
              lastKickIndex: p.lastKickIndex,
            })),
          });
        },
      );
      const placements = best.placements.map(p => ({
        piece: p.piece,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        lastActionWasRotation: p.lastActionWasRotation,
        lastKickIndex: p.lastKickIndex,
      }));
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'result', searchId, placements });
    } catch (err) {
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'error', searchId, error: String(err) });
    }
  }
};
