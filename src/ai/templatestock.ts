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
      const lo = board.words[x * 2];
      const hi = board.words[x * 2 + 1];
      if (lo !== 0) {
        heights[x] = BOARD_TOTAL_HEIGHT - (31 - Math.clz32(lo & -lo));
      } else if (hi !== 0) {
        heights[x] = BOARD_TOTAL_HEIGHT - (32 + (31 - Math.clz32(hi & -hi)));
      } else {
        heights[x] = 0;
      }
    }
    const maxH = Math.max(...heights);
    const minH = Math.min(...heights);
    const avgH = heights.reduce((a, b) => a + b, 0) / 10;
    let holes = 0;
    for (let x = 0; x < 10; x++) {
      const lo = board.words[x * 2];
      const hi = board.words[x * 2 + 1];
      if (lo === 0 && hi === 0) continue;
      let topY: number;
      if (lo !== 0) topY = 31 - Math.clz32(lo & -lo);
      else topY = 32 + (31 - Math.clz32(hi & -hi));
      let seen = false;
      for (let y = topY; y < BOARD_TOTAL_HEIGHT; y++) {
        const filled = y < 32 ? ((lo >>> y) & 1) !== 0 : ((hi >>> (y - 32)) & 1) !== 0;
        if (filled) seen = true;
        else if (seen) holes++;
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
    const exactKey = `${board.hash()}|${current}|${bag.join(',')}|${hold}`;
    const exact = this.entries.get(exactKey);
    if (exact) {
      return { placements: exact.placements, expectedAttack: exact.expectedAttack };
    }

    return null;
  }

  getBestApproximate(
    board: BitBoard,
    _current: MinoType,
    _bag: MinoType[],
    _hold: MinoType | null,
  ): StockEntry | null {
    const features = this.computeFeatures(board);
    let best: StockEntry | null = null;
    let bestDist = Infinity;

    for (const entry of this.entries.values()) {
      const dist = this.similarity(features, entry.features);
      if (dist < bestDist) {
        bestDist = dist;
        best = entry;
      }
    }

    // 距離が近いものだけを採用する（完全一致ほど厳密でなくてもよい）
    if (best && bestDist < 0.55) {
      return best;
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
