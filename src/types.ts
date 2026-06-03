export type MinoType = 'T' | 'S' | 'Z' | 'J' | 'L' | 'I' | 'O';
export type MinoState = 0 | 1 | 2 | 3
export type MinoMatrix = number[][]; // FIXME
export type MinoRotation = 'CW' | 'CCW' | '180';

export type InitialSystemOption = 'OFF' | 'HOLD' | 'TAP';

export type GameAction = 'MoveLeft' | 'SoftDrop' | 'HardDrop' | 'MoveRight' | 'RotateCCW' | 'RotateCW' | 'Rotate180' | 'Hold' | 'Hold' | 'Hold' | 'Reset' | 'Pause';
