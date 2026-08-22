/**
 * 重みグリッドサーチハーネス。
 * 短いゲームを複数回実行してコンフィグごとの APM を比較する。
 *
 *   node src/headless/sweep.ts
 */
import { runHeadlessGame } from './runner.ts';
import { setWeights, DEFAULT_REWARD_WEIGHTS, DEFAULT_HEURISTIC_WEIGHTS } from '../ai/evaluate.ts';
import type { RewardWeights, HeuristicWeights } from '../ai/evaluate.ts';

interface Config {
  name: string;
  reward: Partial<RewardWeights>;
  heuristic: Partial<HeuristicWeights>;
}

const configs: Config[] = [
  {
    name: 'qr',
    reward: {       normalClears: [0, -2.0, -1.5, -1.0, 5.0],
      spinClears: [0, 1.5, 4.5, 6.5],
      b2bClear: 1.5,
      combo: 1.8,
      wastedT: -1.5,
      attack: 0,
      perfectClear: 12, },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0 },
  },
  {
    name: 'qr-plus',
    reward: { normalClears: [0, -2.0, -1.5, -1.0, 7.0], spinClears: [0, 1.5, 4.5, 6.5], b2bClear: 2.5, combo: 1.8, wastedT: -1.5, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0 },
  },
  {
    name: 'qr-no-dbl',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 5.0], spinClears: [0, 1.5, 4.5, 6.5], b2bClear: 1.5, combo: 1.8, wastedT: -1.5, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0 },
  },
  {
    name: 'qr-well10',
    reward: {       normalClears: [0, -2.0, -1.5, -1.0, 5.0],
      spinClears: [0, 1.5, 4.5, 6.5],
      b2bClear: 1.5,
      combo: 1.8,
      wastedT: -1.5,
      attack: 0,
      perfectClear: 12, },
    heuristic: { tetrisWellDepth: 1.0, wellSum: 0, clearProgress: 0, nearFull: 0 },
  },
  {
    name: 'qr-tss-low',
    reward: { normalClears: [0, -2.0, -1.5, -1.0, 5.0], spinClears: [0, 0.3, 4.5, 6.5], b2bClear: 2.0, combo: 1.8, wastedT: -1.0, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0 },
  },
  {
    name: 'qr-combo25',
    reward: { normalClears: [0, -2.0, -1.5, -1.0, 5.0], spinClears: [0, 1.5, 4.5, 6.5], b2bClear: 1.5, combo: 2.5, wastedT: -1.5, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0 },
  },
];

interface Result { apm: number; pps: number; pieces: number; attack: number }

function runConfig(cfg: Config, seeds: number[], pieces: number, timeMs: number, depth: number): Result {
  setWeights({ ...DEFAULT_REWARD_WEIGHTS, ...cfg.reward }, { ...DEFAULT_HEURISTIC_WEIGHTS, ...cfg.heuristic });
  let apm = 0, pps = 0, pcs = 0, atk = 0;
  for (const seed of seeds) {
    const r = runHeadlessGame(
      {
        pps: 1,
        beamWidth: 100,
        maxDepth: depth,
        timeLimitMs: timeMs,
        maxPieces: pieces,
        realtime: false,
        search: 'dag',
        nodeBudget: 30000,
        pruneHoles: false,
      },
      seed,
    );
    apm += r.apm;
    pps += r.pps;
    pcs += r.pieces;
    atk += r.attack;
  }
  return { apm: apm / seeds.length, pps: pps / seeds.length, pieces: pcs / seeds.length, attack: atk / seeds.length };
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: number): number => {
    const eq = args.find((a) => a.startsWith(`--${name}=`));
    if (eq) return parseFloat(eq.slice(name.length + 3));
    const i = args.indexOf(`--${name}`);
    return i !== -1 && i + 1 < args.length ? parseFloat(args[i + 1]) : def;
  };
  const seeds = (args.find((a) => a.startsWith('--seeds=')) ?? '--seeds=1,1001,2001')
    .replace('--seeds=', '')
    .split(',')
    .map(Number);
  const pieces = Math.floor(getArg('pieces', 40));
  const timeMs = getArg('time', 250);
  const depth = Math.floor(getArg('depth', 8));

  console.log(`sweep: seeds=${seeds.join(',')} pieces=${pieces} timeMs=${timeMs} depth=${depth} nodes=30000`);
  const results: Array<{ name: string; r: Result }> = [];
  for (const cfg of configs) {
    const r = runConfig(cfg, seeds, pieces, timeMs, depth);
    results.push({ name: cfg.name, r });
    console.log(`${cfg.name.padEnd(14)} APM=${r.apm.toFixed(1).padStart(6)} atk=${r.attack.toFixed(1).padStart(6)} pieces=${r.pieces.toFixed(0)} pps=${r.pps.toFixed(2)}`);
  }
  console.log('\n--- ranking ---');
  for (const { name, r } of [...results].sort((a, b) => b.r.apm - a.r.apm)) {
    console.log(`${name.padEnd(14)} ${r.apm.toFixed(1)}`);
  }
}

main();
