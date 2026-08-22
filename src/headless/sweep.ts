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
  { name: 'quad-base', reward: {}, heuristic: {} },
  {
    name: 'sc-mild',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 4.0], spinClears: [0, 2.5, 6.0, 8.0], miniSpinClears: [0, 1.0, 2.5], nonTSpinClears: [0, 3.0, 5.0], b2bClear: 2.5, combo: 1.8, wastedT: -1.0, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.3, tSlot: 0.9 },
  },
  {
    name: 'sc-slot',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 4.0], spinClears: [0, 2.5, 6.0, 8.0], miniSpinClears: [0, 1.0, 2.5], nonTSpinClears: [0, 3.0, 5.0], b2bClear: 2.5, combo: 1.8, wastedT: -1.0, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.3, tSlot: 2.0, narrowHole: 0.4 },
  },
  {
    name: 'sc-slot2',
    reward: { normalClears: [0, -2.0, -2.5, -2.0, 4.0], spinClears: [0, 2.5, 6.0, 8.0], miniSpinClears: [0, 1.0, 2.5], nonTSpinClears: [0, 3.0, 5.0], b2bClear: 2.5, combo: 1.8, wastedT: -1.0, attack: 0, perfectClear: 12 },
    heuristic: { tetrisWellDepth: 0.3, tSlot: 3.0, narrowHole: 0.8 },
  },
];

interface Result { apm: number; pps: number; pieces: number; attack: number; app: number; spins: number; b2b: number }

function runConfig(cfg: Config, seeds: number[], pieces: number, timeMs: number, depth: number): Result {
  setWeights({ ...DEFAULT_REWARD_WEIGHTS, ...cfg.reward }, { ...DEFAULT_HEURISTIC_WEIGHTS, ...cfg.heuristic });
  let apm = 0, pcs = 0, atk = 0, spins = 0, b2b = 0, timeSec = 0;
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
    pcs += r.pieces;
    atk += r.attack;
    b2b += r.b2bMax;
    timeSec += r.playTimeSec;
    for (const [k, v] of Object.entries(r.clearCounts)) {
      if (k.includes('SPIN') && k !== 'MINI T-SPIN ZERO' && !k.startsWith('MINI T-')) spins += v;
      if (!k.includes('T-SPIN') && k.includes('SPIN')) spins += 0; // 重複防止
    }
  }
  return { apm: apm / seeds.length, pps: timeSec > 0 ? pcs / timeSec : 0, pieces: pcs / seeds.length, attack: atk / seeds.length, app: atk / Math.max(1, pcs), spins: spins / seeds.length, b2b: b2b / seeds.length };
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
    console.log(`${cfg.name.padEnd(14)} APM=${r.apm.toFixed(1).padStart(6)} APP=${r.app.toFixed(3)} nonTspin=${r.spins.toFixed(1)} b2b=${r.b2b.toFixed(1)} pieces=${r.pieces.toFixed(0)}`);
  }
  console.log('\n--- ranking ---');
  for (const { name, r } of [...results].sort((a, b) => b.r.apm - a.r.apm)) {
    console.log(`${name.padEnd(14)} ${r.apm.toFixed(1)}`);
  }
}

main();
