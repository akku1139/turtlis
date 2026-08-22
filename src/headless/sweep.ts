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
    name: 'nh0.0',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 5.0], b2bClear: 1.5, combo: 1.8, wastedT: -1.5, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0, narrowHole: 0 },
  },
  {
    name: 'nh0.3',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 5.0], b2bClear: 1.5, combo: 1.8, wastedT: -1.5, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0, narrowHole: 0.3 },
  },
  {
    name: 'nh0.8',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 5.0], b2bClear: 1.5, combo: 1.8, wastedT: -1.5, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0, narrowHole: 0.8 },
  },
  {
    name: 'nh1.5',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 5.0], b2bClear: 1.5, combo: 1.8, wastedT: -1.5, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.6, wellSum: 0, clearProgress: 0, nearFull: 0, narrowHole: 1.5 },
  },
];

interface Result { apm: number; pps: number; pieces: number; attack: number; spins: number; b2b: number }

function runConfig(cfg: Config, seeds: number[], pieces: number, timeMs: number, depth: number): Result {
  setWeights({ ...DEFAULT_REWARD_WEIGHTS, ...cfg.reward }, { ...DEFAULT_HEURISTIC_WEIGHTS, ...cfg.heuristic });
  let apm = 0, pps = 0, pcs = 0, atk = 0, spins = 0, b2b = 0;
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
    b2b += r.b2bMax;
    for (const [k, v] of Object.entries(r.clearCounts)) {
      if (k.includes('SPIN') && k !== 'MINI T-SPIN ZERO' && !k.startsWith('MINI T-')) spins += v;
      if (!k.includes('T-SPIN') && k.includes('SPIN')) spins += 0; // 重複防止
    }
  }
  return { apm: apm / seeds.length, pps: pps / seeds.length, pieces: pcs / seeds.length, attack: atk / seeds.length, spins: spins / seeds.length, b2b: b2b / seeds.length };
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
    console.log(`${cfg.name.padEnd(14)} APM=${r.apm.toFixed(1).padStart(6)} atk=${r.attack.toFixed(1).padStart(6)} nonTspin=${r.spins.toFixed(1)} b2b=${r.b2b.toFixed(1)} pieces=${r.pieces.toFixed(0)}`);
  }
  console.log('\n--- ranking ---');
  for (const { name, r } of [...results].sort((a, b) => b.r.apm - a.r.apm)) {
    console.log(`${name.padEnd(14)} ${r.apm.toFixed(1)}`);
  }
}

main();
