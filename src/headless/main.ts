import { runHeadlessGame } from './runner.ts';
import type { GameResult } from './runner.ts';
import type { SearchEngine } from './runner.ts';

interface Args {
  games: number;
  pps: number;
  seed: number;
  beam: number;
  depth: number;
  timeMs: number;
  maxPieces: number;
  realtime: boolean;
  verbose: boolean;
  search: SearchEngine;
  nodes: number;
  pruneHoles: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string, def: number): number => {
    const i = args.indexOf(`--${name}`);
    if (i === -1 || i + 1 >= args.length) return def;
    const v = parseFloat(args[i + 1]);
    return Number.isFinite(v) ? v : def;
  };
  const getStr = (name: string, def: string): string => {
    const i = args.indexOf(`--${name}`);
    if (i === -1 || i + 1 >= args.length) return def;
    return args[i + 1];
  };
  const has = (name: string): boolean => args.includes(`--${name}`);

  const search = (getStr('search', 'dag') === 'beam' ? 'beam' : 'dag') as SearchEngine;

  return {
    games: Math.max(1, Math.floor(get('games', 10))),
    pps: get('pps', 1),
    seed: Math.floor(get('seed', 1)),
    beam: Math.max(1, Math.floor(get('beam', 150))),
    depth: Math.max(1, Math.floor(get('depth', 8))),
    timeMs: get('time', 900),
    maxPieces: Math.max(1, Math.floor(get('max-pieces', 500))),
    realtime: has('realtime'),
    verbose: has('verbose'),
    search,
    nodes: Math.max(100, Math.floor(get('nodes', 12000))),
    pruneHoles: has('prune-holes'),
  };
}

function summary(label: string, values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return `${label}: mean=${mean.toFixed(2)} median=${median.toFixed(2)} sd=${sd.toFixed(2)} min=${min.toFixed(2)} max=${max.toFixed(2)}`;
}

function main() {
  const args = parseArgs();

  console.log(`turtlis headless benchmark`);
  console.log(`search=${args.search} games=${args.games} pps=${args.pps} beam=${args.beam} depth=${args.depth} timeLimit=${args.timeMs}ms nodes=${args.nodes} maxPieces=${args.maxPieces}${args.realtime ? ' [realtime]' : ''}`);
  console.log('');

  const results: GameResult[] = [];
  const wallStart = Date.now();

  for (let i = 0; i < args.games; i++) {
    const seed = args.seed + i * 1000;
    const result = runHeadlessGame(
      {
        pps: args.pps,
        beamWidth: args.beam,
        maxDepth: args.depth,
        timeLimitMs: args.timeMs,
        maxPieces: args.maxPieces,
        realtime: args.realtime,
        search: args.search,
        nodeBudget: args.nodes,
        pruneHoles: args.pruneHoles,
      },
      seed,
    );
    results.push(result);

    console.log(
      `game ${String(i + 1).padStart(String(args.games).length)}: ` +
        `pieces=${String(result.pieces).padStart(4)} lines=${String(result.lines).padStart(4)} ` +
        `atk=${String(result.attack).padStart(5)} APM=${result.apm.toFixed(1).padStart(6)} ` +
        `PPS=${result.pps.toFixed(3)} score=${result.score}`,
    );

    if (args.verbose) {
      // ゲームごとの詳細は必要に応じてここで出力
    }
  }

  const wallSec = (Date.now() - wallStart) / 1000;

  console.log('');
  console.log(summary('APM     ', results.map((r) => r.apm)));
  console.log(summary('PPS     ', results.map((r) => r.pps)));
  console.log(summary('pieces  ', results.map((r) => r.pieces)));
  console.log(summary('lines   ', results.map((r) => r.lines)));
  console.log(summary('attack  ', results.map((r) => r.attack)));
  console.log('');
  console.log(`wall clock: ${wallSec.toFixed(1)}s (${(wallSec / args.games).toFixed(1)}s/game)`);

  const apmValues = results.map((r) => r.apm);
  const meanApm = apmValues.reduce((a, b) => a + b, 0) / apmValues.length;
  console.log(`\ntarget APM @ ${args.pps} PPS: 70 → ${meanApm >= 70 ? 'PASS ✔' : 'FAIL ✘'} (${meanApm.toFixed(1)})`);
}

main();
