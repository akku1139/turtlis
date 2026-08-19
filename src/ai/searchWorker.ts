/// <reference lib="webworker" />

import { beamSearch } from './beamsearch';
import { BitBoard } from './bitboard';
import type { SearchState } from './types';
import { getMatrix } from './pure';

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data.type === 'search') {
    const searchId = data.searchId;
    const searchKey = data.searchKey;
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
      lastSpinAction: false,
      lastCleared: 0,
    };

    try {
      const best = beamSearch(
        state,
        data.beamWidth ?? 80,
        data.maxDepth,
        (progress) => {
          (self as unknown as DedicatedWorkerGlobalScope).postMessage({
            type: 'progress',
            searchId,
            searchKey,
            depth: progress.depth,
            totalDepth: progress.totalDepth,
            candidates: progress.candidates,
            bestAttack: progress.bestState.accumulatedAttack,
            placements: progress.bestState.placements.map((p) => ({
              piece: p.piece,
              rotation: p.rotation,
              x: p.x,
              y: p.y,
              lastActionWasRotation: p.lastActionWasRotation,
              lastKickIndex: p.lastKickIndex,
            })),
          });
        },
        data.warmStartPlacements,
        data.timeLimitMs,
        data.planBoardHashes,
      );

      const boardHashes: string[] = [];
      const simBoard = BitBoard.fromGrid(data.boardGrid);
      boardHashes.push(simBoard.hash().toString());
      for (const p of best.placements) {
        const matrix = getMatrix(p.piece, p.rotation);
        simBoard.merge(matrix, p.x, p.y);
        simBoard.clearLines();
        boardHashes.push(simBoard.hash().toString());
      }

      const placements = best.placements.map((p) => ({
        piece: p.piece,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        lastActionWasRotation: p.lastActionWasRotation,
        lastKickIndex: p.lastKickIndex,
      }));

      (self as unknown as DedicatedWorkerGlobalScope).postMessage({
        type: 'result',
        searchId,
        searchKey,
        placements,
        attack: best.accumulatedAttack,
        boardHashes,
      });
    } catch (err) {
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({
        type: 'error',
        searchId,
        searchKey,
        error: String(err),
      });
    }
  }
};
