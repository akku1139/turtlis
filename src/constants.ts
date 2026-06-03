export const MINOS = {
  'I': { color: '#00FFFF', matrix: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  'J': { color: '#0000FF', matrix: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  'L': { color: '#FFA500', matrix: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
  'O': { color: '#FFFF00', matrix: [[1, 1], [1, 1]] },
  'S': { color: '#00FF00', matrix: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  'T': { color: '#800080', matrix: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  'Z': { color: '#FF0000', matrix: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
};

/** frame to millisecond */
export const F_TO_MS = 1000 / 60;

export const BOARD_WIDTH = 10;
export const BOARD_VISIBLE_HEIGHT = 20;
export const BOARD_HIDDEN_HEIGHT = 20;
export const BOARD_TOTAL_HEIGHT = BOARD_VISIBLE_HEIGHT + BOARD_HIDDEN_HEIGHT;
