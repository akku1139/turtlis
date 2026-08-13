import type { SearchState, Placement } from './types.ts';
import { generatePlacements } from './movegen.ts';
import { simulateLock, simulateHold } from './pure.ts';
import { evaluateState, countHoles } from './evaluate.ts';
import { getMatrix } from './pure.ts';
import type { MinoState } from '../types.ts';

export function beamSearch(
  root: SearchState,
  beamWidth: number = 50,
  maxDepth?: number,
  onProgress?: (info: {
    depth: number;
    totalDepth: number;
    candidates: number;
    bestState: SearchState;
  }) => void,
  warmStartPlacements?: Placement[],
  timeLimitMs?: number,
  planBoardHashes?: string[],
): SearchState {
  const depth = Math.min(maxDepth ?? root.bag.length + 1, root.bag.length + 1);
  let beam: SearchState[] = [root];
  let startDepth = 0;
  const searchStart = Date.now();
  const initialHoles = countHoles(root.board);

  if (warmStartPlacements && warmStartPlacements.length > 0) {
    const { state, appliedCount } = applyWarmStart(root, warmStartPlacements);
    if (appliedCount > 0) {
      beam = [state];
      startDepth = Math.min(appliedCount, depth);
    }
  }

  for (let d = startDepth; d < depth; d++) {
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
          lastSpinAction: result.isSpinAction,
          lastCleared: result.cleared,
          depth: d + 1,
        };
        candidates.push(nextState);
      }

      // ホールドしてから配置
      if (state.canHold && (state.hold !== null || state.bag.length > 0)) {
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
            lastSpinAction: result.isSpinAction,
            lastCleared: result.cleared,
            depth: d + 1,
          };
          candidates.push(nextState);
        }
      }
    }

    if (candidates.length === 0) break;

    // 重複除去（盤面・バッグ・攻撃力などを考慮）
    const seen = new Map<string, SearchState>();
    for (const c of candidates) {
      const key = `${c.board.hash()}|${c.bag.join(',')}|${c.hold}|${c.comboCount}|${c.difficultClearCount}|${c.accumulatedAttack}`;
      if (!seen.has(key)) seen.set(key, c);
    }
    const unique = Array.from(seen.values());

    // 評価値 + 前回計画との一致ボーナスでソート
    const planBonus = (s: SearchState): number => {
      if (planBoardHashes && s.depth !== undefined && s.depth < planBoardHashes.length) {
        return s.board.hash().toString() === planBoardHashes[s.depth] ? 6.0 : 0.0;
      }
      return 0.0;
    };
    const scored = unique.map(s => {
      const holesNow = countHoles(s.board);
      const holeBonus = (initialHoles - holesNow) * 5.0;
      return {
        s,
        score: evaluateState(s) + planBonus(s) + holeBonus,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    for (let i = 0; i < scored.length; i++) {
      unique[i] = scored[i].s;
    }

    // スピン状態を優先してビームを構成する（新しい探索視点）
    const spinStates = unique.filter((s) => s.lastSpinAction && s.lastCleared > 0);
    const normalStates = unique.filter((s) => !(s.lastSpinAction && s.lastCleared > 0));
    const spinSlots = Math.min(spinStates.length, Math.floor(beamWidth * 0.6));
    const topSpins = spinStates.slice(0, spinSlots);
    const remainingSlots = beamWidth - topSpins.length;
    const topNormals = normalStates.slice(0, remainingSlots);
    beam = [...topSpins, ...topNormals];

    if (timeLimitMs && Date.now() - searchStart > timeLimitMs) {
      break;
    }

    if (onProgress) {
      onProgress({
        depth: d + 1,
        totalDepth: depth,
        candidates: unique.length,
        bestState: beam[0],
      });
    }
  }

  // 最終ビームの最良を返す
  beam.sort((a, b) => evaluateState(b) - evaluateState(a));
  return beam[0];
}

function applyWarmStart(
  root: SearchState,
  warmStartPlacements: Placement[],
): { state: SearchState; appliedCount: number } {
  let state = root;
  const applied: Placement[] = [];

  for (const p of warmStartPlacements) {
    if (state.current !== p.piece) {
      if (!state.canHold || (state.hold === null && state.bag.length === 0)) break;
      const held = simulateHold(state.current, state.hold, state.bag);
      if (held.newCurrent !== p.piece) break;
      state = {
        ...state,
        current: held.newCurrent,
        hold: held.newHold,
        bag: held.newBag,
        canHold: false,
      };
    }

    const placement: Placement = {
      piece: p.piece,
      rotation: p.rotation as MinoState,
      x: p.x,
      y: p.y,
      matrix: getMatrix(p.piece, p.rotation as MinoState),
      lastActionWasRotation: p.lastActionWasRotation ?? false,
      lastKickIndex: p.lastKickIndex ?? 0,
    };

    if (state.board.collides(placement.matrix, placement.x, placement.y)) {
      return { state: root, appliedCount: 0 };
    }

    const { result, nextBoard } = simulateLock(
      state.board,
      placement,
      state.comboCount,
      state.difficultClearCount,
      1,
    );
    const nextBag = state.bag.slice();
    const nextCurrent = nextBag.shift();
    if (!nextCurrent) break;

    state = {
      board: nextBoard,
      current: nextCurrent,
      bag: nextBag,
      hold: state.hold,
      canHold: true,
      comboCount: result.newComboCount,
      difficultClearCount: result.newDifficultClearCount,
      accumulatedAttack: state.accumulatedAttack + result.totalAttack,
      accumulatedScore: state.accumulatedScore + result.scoreGained,
      placements: [...state.placements, placement],
      lastSpinAction: result.isSpinAction,
      lastCleared: result.cleared,
      depth: (state.depth ?? 0) + 1,
    };
    applied.push(placement);
  }

  return { state, appliedCount: applied.length };
}
