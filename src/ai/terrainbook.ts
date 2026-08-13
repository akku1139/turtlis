import type { SearchState } from './types.ts';
import { computeTerrainScore } from './evaluate.ts';

// オフラインで構築する地形ライブラリの簡易版
export class TerrainBook {
  private entries = new Map<string, { expectedAttack: number; bag: string[] }>();

  query(state: SearchState): number {
    const boardHash = state.board.hash().toString();
    const bagKey = state.bag.join(',');

    // 完全一致
    const exact = this.entries.get(`${boardHash}|${bagKey}`);
    if (exact) return exact.expectedAttack;

    // 盤面のみ一致
    const boardOnly = this.entries.get(boardHash);
    if (boardOnly) {
      const compat = this.bagCompatibility(boardOnly.bag, state.bag);
      return boardOnly.expectedAttack * compat;
    }

    // 近似検索は省略（今回は0を返す）
    return 0;
  }

  add(board: import('./bitboard.ts').BitBoard, entry: { expectedAttack: number; bag: string[] }) {
    this.entries.set(board.hash().toString(), entry);
  }

  private bagCompatibility(entryBag: string[], currentBag: string[]): number {
    if (entryBag.length === 0 || currentBag.length === 0) return 0.5;
    const common = entryBag.filter((p) => currentBag.includes(p)).length;
    return 0.5 + 0.5 * (common / Math.max(entryBag.length, currentBag.length));
  }
}

export class BadTerrainDB {
  private badBoards = new Map<string, string>();

  lookup(board: import('./bitboard.ts').BitBoard): string | undefined {
    const hash = board.hash().toString();
    return this.badBoards.get(hash);
  }

  add(board: import('./bitboard.ts').BitBoard, reason: string) {
    this.badBoards.set(board.hash().toString(), reason);
  }
}
