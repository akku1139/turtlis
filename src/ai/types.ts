import type { MinoType, MinoState } from '../types.ts';
import type { BitBoard } from './bitboard.ts';

export interface Placement {
  piece: MinoType;
  rotation: MinoState;
  x: number;
  y: number;
  matrix: number[][];
  lastActionWasRotation: boolean;
  lastKickIndex: number;
}

export interface SearchState {
  board: BitBoard;
  current: MinoType;
  bag: MinoType[];          // 現在の袋の残り（次に落ちる順）
  hold: MinoType | null;
  canHold: boolean;
  comboCount: number;
  difficultClearCount: number;
  accumulatedAttack: number;
  accumulatedScore: number;
  placements: Placement[];
}

export interface TerrainScore {
  total: number;
  b2bPotential: number;
  tSlotCount: number;
  quadWellDepth: number;
  centerStackHeight: number;
  hazard: number;
}
