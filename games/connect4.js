// Connect Four: seven columns, six rows, discs fall to the bottom.
import { Nope, int } from './util.js';

export const COLS = 7;
export const ROWS = 6;

// Every run of four through a cell, as lists of cell indexes (row * COLS + col).
function fourAt(board, i, who) {
  const r0 = Math.floor(i / COLS), c0 = i % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const run = [i];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign, c = c0 + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === who) {
        run.push(r * COLS + c);
        r += dr * sign; c += dc * sign;
      }
    }
    if (run.length >= 4) return run;
  }
  return null;
}

export default {
  setup({ players }) {
    return { board: Array(COLS * ROWS).fill(null), turn: players[0].id, last: null, line: null, result: null };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const col = int(m?.col, 0, COLS - 1);
    if (col == null) throw new Nope('Pick a column.');
    let row = ROWS - 1;
    while (row >= 0 && s.board[row * COLS + col]) row--;
    if (row < 0) throw new Nope('That column is full.');
    const i = row * COLS + col;
    s.board[i] = by;
    s.last = i;
    s.line = fourAt(s.board, i, by);
    if (s.line) s.result = { winners: [by] };
    else if (s.board.every(Boolean)) s.result = { winners: [] };
    else s.turn = ctx.players.find((p) => p.id !== by).id;
  },
};
