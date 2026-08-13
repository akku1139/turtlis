import type { SearchState, Placement } from './types.ts';
import { generatePlacementsFast as generatePlacements } from './movegen.ts';
import { simulateLock, simulateHold } from './pure.ts';
import { evaluateState } from './evaluate.ts';

export function beamSearch(
  root: SearchState,
  beamWidth: number = 80,
  maxDepth?: number,
  onProgress?: (info: { depth: number; totalDepth: number; candidates: number }) => void,
): SearchState {
  const depth = maxDepth ?? root.bag.length + 1;
  let beam: SearchState[] = [root];

  for (let d = 0; d < depth; d++) {
    const candidates: SearchState[] = [];

    for (const state of beam) {
      // 現在ミノをそのまま配置
      const placements = generatePlacements(state.board, state.current);
      for (const p of placements) {
        const { result, nextBoard } = simulateLock(
          state.board,
          p,
          state.comboCount,
          state.difficultClearCount,
          1, // levelは簡易的に1で固定（必要に応じて変更）
        );
        const nextBag = state.bag.slice();
        const nextCurrent = nextBag.shift();
        if (!nextCurrent) continue;

        const nextState: SearchState = {
          board: nextBoard,
          current: nextCurrent,
          bag: nextBag,
          hold: state.hold,
          canHold: true,
          comboCount: result.newComboCount,
          difficultClearCount: result.newDifficultClearCount,
          accumulatedAttack: state.accumulatedAttack + result.totalAttack,
          accumulatedScore: state.accumulatedScore + result.scoreGained,
          placements: [...state.placements, p],
        };
        candidates.push(nextState);
      }

      // ホールドしてから配置
      if (state.canHold) {
        const held = simulateHold(state.current, state.hold, state.bag);
        const heldState: SearchState = {
          board: state.board.clone(),
          current: held.newCurrent,
          bag: held.newBag,
          hold: held.newHold,
          canHold: false,
          comboCount: state.comboCount,
          difficultClearCount: state.difficultClearCount,
          accumulatedAttack: state.accumulatedAttack,
          accumulatedScore: state.accumulatedScore,
          placements: state.placements,
        };
        const heldPlacements = generatePlacements(heldState.board, heldState.current);
        for (const p of heldPlacements) {
          const { result, nextBoard } = simulateLock(
            heldState.board,
            p,
            heldState.comboCount,
            heldState.difficultClearCount,
            1,
          );
          const nextBag = heldState.bag.slice();
          const nextCurrent = nextBag.shift();
          if (!nextCurrent) continue;

          const nextState: SearchState = {
            board: nextBoard,
            current: nextCurrent,
            bag: nextBag,
            hold: heldState.hold,
            canHold: true,
            comboCount: result.newComboCount,
            difficultClearCount: result.newDifficultClearCount,
            accumulatedAttack: heldState.accumulatedAttack + result.totalAttack,
            accumulatedScore: heldState.accumulatedScore + result.scoreGained,
            placements: [...heldState.placements, p],
          };
          candidates.push(nextState);
        }
      }
    }

    if (candidates.length === 0) break;

    // 重複除去（簡易：盤面ハッシュとbagで）
    const seen = new Map<string, SearchState>();
    for (const c of candidates) {
      const key = `${c.board.hash()}|${c.bag.join(',')}|${c.hold}|${c.comboCount}|${c.difficultClearCount}`;
      if (!seen.has(key)) seen.set(key, c);
    }
    const unique = Array.from(seen.values());

    // 評価値でソートして上位beamWidth個
    unique.sort((a, b) => evaluateState(b) - evaluateState(a));
    beam = unique.slice(0, beamWidth);

    if (onProgress) {
      onProgress({ depth: d + 1, totalDepth: depth, candidates: unique.length });
    }
  }

  // 最終ビームの最良を返す
  beam.sort((a, b) => evaluateState(b) - evaluateState(a));
  return beam[0];
}
