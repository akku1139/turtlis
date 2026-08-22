import { GameCore } from '../gamecore.ts';
import { beamSearch } from '../ai/beamsearch.ts';
import { buildSearchState } from '../ai/search.ts';
import { dagSearch } from '../ai/dagsearch.ts';
import type { Placement } from '../ai/types.ts';
import { getMatrix } from '../ai/pure.ts';

export type SearchEngine = 'dag' | 'beam';

export interface HeadlessOptions {
  pps: number;
  beamWidth: number;
  maxDepth: number;
  timeLimitMs: number;
  maxPieces: number;
  realtime: boolean;
  search: SearchEngine;
  nodeBudget: number;
  pruneHoles: boolean;
  onPiece?: (info: {
    piece: number;
    attack: number;
    lines: number;
    apm: number;
    pps: number;
  }) => void;
}

export interface GameResult {
  seed: number;
  pieces: number;
  lines: number;
  attack: number;
  score: number;
  playTimeSec: number;
  apm: number;
  pps: number;
  b2bMax: number;
  comboMax: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyPlacement(core: GameCore, p: Placement): boolean {
  if (p.piece !== core.currentMino.type) {
    if (!core.canHold) return false;
    core.hold();
    if (core.currentMino.type !== p.piece) return false;
  }

  const matrix = getMatrix(p.piece, p.rotation);
  if (core.board.collides(matrix, p.x, p.y)) return false;

  core.currentMino.state = p.rotation;
  core.currentMino.matrix = matrix;
  core.minoX = p.x;
  core.minoY = p.y;
  core.lastActionWasRotation = p.lastActionWasRotation ?? false;
  core.lastKickIndex = p.lastKickIndex ?? 0;
  core.lockPiece();
  return true;
}

export function runHeadlessGame(options: HeadlessOptions, seed: number): GameResult {
  const core = new GameCore();
  core.rng = mulberry32(seed);
  core.start();

  // AI自動プレイ相当の設定（ブラウザのAI AUTOと同じ）
  core.config.gravityZero = true; // 重力なしでAIが直接配置する
  core.config.sdf = Infinity;
  core.config.arr = 0;
  core.config.das = 0;
  core.config.dcd = 0;
  core.config.preventAccident = false;

  const frameMs = 1000 / options.pps;

  while (core.state === 'PLAYING' && core.piecesPlaced < options.maxPieces) {
    let plan: Placement[] = [];
    const searchStart = Date.now();

    if (options.search === 'dag') {
      const result = dagSearch(
        buildSearchState(core).board,
        core.currentMino.type,
        core.nextQueue.slice(),
        core.holdType,
        core.canHold,
        core.comboCount,
        core.difficultClearCount,
        {
          depth: options.maxDepth,
          nodeBudget: options.nodeBudget,
          timeLimitMs: options.timeLimitMs,
          pruneHoles: options.pruneHoles,
        },
      );
      plan = result.placements;
    } else {
      const state = buildSearchState(core);
      const best = beamSearch(state, options.beamWidth, options.maxDepth, undefined, undefined, options.timeLimitMs);
      plan = best.placements;
    }
    const thinkTime = Date.now() - searchStart;

    let ok = false;
    if (plan.length > 0) {
      ok = applyPlacement(core, plan[0]);
    }

    if (!ok) break; // 配置できる手がない＝詰み

    if (options.realtime && thinkTime < frameMs) {
      const busyWaitUntil = Date.now() + (frameMs - thinkTime);
      while (Date.now() < busyWaitUntil) {
        // 実時間ペースを再現
      }
    }

    core.update(frameMs);

    if (options.onPiece) {
      options.onPiece({
        piece: core.piecesPlaced,
        attack: core.totalAttackSent,
        lines: core.lines,
        apm: (core.totalAttackSent / Math.max(core.playTime, 1 / 60)) * 60,
        pps: core.piecesPlaced / Math.max(core.playTime, 1 / 60),
      });
    }
  }

  return {
    seed,
    pieces: core.piecesPlaced,
    lines: core.lines,
    attack: core.totalAttackSent,
    score: core.score,
    playTimeSec: core.playTime,
    apm: (core.totalAttackSent / Math.max(core.playTime, 1 / 60)) * 60,
    pps: core.piecesPlaced / Math.max(core.playTime, 1 / 60),
    b2bMax: Math.max(0, core.difficultClearCount - 1),
    comboMax: Math.max(0, core.comboCount - 1),
  };
}
