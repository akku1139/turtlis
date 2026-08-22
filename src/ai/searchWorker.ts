/// <reference lib="webworker" />

import { dagSearch } from './dagsearch';
import { BitBoard } from './bitboard';

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data.type === 'search') {
    const searchId = data.searchId;
    const searchKey = data.searchKey;

    try {
      const board = BitBoard.fromGrid(data.boardGrid);
      const result = dagSearch(
        board,
        data.current,
        data.bag,
        data.hold,
        data.canHold,
        data.comboCount,
        data.difficultClearCount,
        {
          depth: data.maxDepth ?? 8,
          nodeBudget: data.nodeBudget ?? (data.beamWidth ?? 80) * 200,
          timeLimitMs: data.timeLimitMs ?? 2500,
          pruneHoles: false,
          preferredBoardHashes: undefined,
          onProgress: (info) => {
            (self as unknown as DedicatedWorkerGlobalScope).postMessage({
              type: 'progress',
              searchId,
              searchKey,
              depth: info.depth,
              totalDepth: data.maxDepth ?? 8,
              candidates: info.nodes,
              bestAttack: info.attack,
              placements: info.placements.map((p) => ({
                piece: p.piece,
                rotation: p.rotation,
                x: p.x,
                y: p.y,
                lastActionWasRotation: p.lastActionWasRotation,
                lastKickIndex: p.lastKickIndex,
              })),
            });
          },
        },
      );

      // 盤面ハッシュ列（計画の各段階の盤面）
      const boardHashes: string[] = result.boardHashes;

      const placements = result.placements.map((p) => ({
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
        attack: result.attack,
        boardHashes,
        nodes: result.nodes,
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
