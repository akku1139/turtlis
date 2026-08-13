import type { MinoType, MinoState } from '../types.ts';
import type { BitBoard } from './bitboard.ts';
import { BOARD_TOTAL_HEIGHT } from '../constants.ts';

interface StockEntry {
  boardHash: string;
  features: number[];
  placements: Array<{
    piece: MinoType;
    rotation: MinoState;
    x: number;
    y: number;
    lastActionWasRotation?: boolean;
    lastKickIndex?: number;
  }>;
  expectedAttack: number;
  bagKey: string;
  current: MinoType;
  hold: MinoType | null;
}

export class TemplateStock {
  private entries = new Map<string, StockEntry>();
  private maxEntries = 1000;

  get size(): number {
    return this.entries.size;
  }

  private computeFeatures(board: BitBoard): number[] {
    const heights = new Array(10).fill(0);
    for (let x = 0; x < 10; x++) {
      let col = board.cols[x];
      let y = 0;
      while (col !== 0n && y < BOARD_TOTAL_HEIGHT) {
        if (col & 1n) {
          heights[x] = BOARD_TOTAL_HEIGHT - y;
          break;
        }
        col >>= 1n;
        y++;
      }
    }
    const maxH = Math.max(...heights);
    const minH = Math.min(...heights);
    const avgH = heights.reduce((a, b) => a + b, 0) / 10;
    let holes = 0;
    for (let x = 0; x < 10; x++) {
      let col = board.cols[x];
      let filled = false;
      for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
        if (col & 1n) filled = true;
        else if (filled) holes++;
        col >>= 1n;
      }
    }
    return [
      ...heights.map(h => h / 20),
      holes / 20,
      maxH / 20,
      minH / 20,
      avgH / 20,
    ];
  }

  private similarity(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  query(
    board: BitBoard,
    current: MinoType,
    bag: MinoType[],
    hold: MinoType | null,
  ): {
    placements: StockEntry['placements'];
    expectedAttack: number;
  } | null {
    const features = this.computeFeatures(board);
    const exactKey = `${board.hash()}|${current}|${bag.join(',')}|${hold}`;
    const exact = this.entries.get(exactKey);
    if (exact) {
      return { placements: exact.placements, expectedAttack: exact.expectedAttack };
    }

    let best: StockEntry | null = null;
    let bestDist = Infinity;
    for (const entry of this.entries.values()) {
      if (entry.current !== current) continue;
      const dist = this.similarity(features, entry.features);
      if (dist < bestDist) {
        bestDist = dist;
        best = entry;
      }
    }

    if (best && bestDist < 0.5) {
      return { placements: best.placements, expectedAttack: best.expectedAttack };
    }

    return null;
  }

  store(
    board: BitBoard,
    current: MinoType,
    bag: MinoType[],
    hold: MinoType | null,
    placements: StockEntry['placements'],
    expectedAttack: number,
  ) {
    const key = `${board.hash()}|${current}|${bag.join(',')}|${hold}`;
    const features = this.computeFeatures(board);
    this.entries.set(key, {
      boardHash: board.hash().toString(),
      features,
      placements,
      expectedAttack,
      bagKey: bag.join(','),
      current,
      hold,
    });

    if (this.entries.size > this.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey) this.entries.delete(firstKey);
    }
  }
}
