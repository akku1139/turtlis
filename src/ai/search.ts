import type { GameCore } from '../gamecore.ts';
import { BitBoard } from './bitboard.ts';
import { SearchState } from './types.ts';
import { beamSearch } from './beamsearch.ts';

export function buildSearchState(game: GameCore): SearchState {
  const board = BitBoard.fromGrid(game.board.grid);
  const bag = game.nextQueue.slice(); // nextQueueは現在の袋の残り（currentを除く）
  const current = game.currentMino.type;
  const hold = game.holdType;
  const canHold = game.canHold;
  const comboCount = game.comboCount;
  const difficultClearCount = game.difficultClearCount;

  return {
    board,
    current,
    bag,
    hold,
    canHold,
    comboCount,
    difficultClearCount,
    accumulatedAttack: 0,
    accumulatedScore: 0,
    placements: [],
  };
}

export function suggestBestPlan(game: GameCore): import('./types.ts').Placement[] {
  const state = buildSearchState(game);
  const best = beamSearch(state, 200, state.bag.length);
  return best.placements;
}
