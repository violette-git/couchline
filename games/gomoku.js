// Five in a Row (freestyle gomoku) on a 15 by 15 board. The board is a 225 character string,
// row by row: '0' and '1' are the players' stones, '.' is empty. Five or more in a row wins.
import { Nope, int } from './util.js';

export const SIZE = 15;

// The longest run through cell i for side, as cell indexes, if it's five or more.
export function runAt(board, i, side) {
  const r0 = Math.floor(i / SIZE), c0 = i % SIZE;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const run = [i];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign, c = c0 + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === side) {
        run.push(r * SIZE + c);
        r += dr * sign; c += dc * sign;
      }
    }
    if (run.length >= 5) return run.sort((a, b) => a - b);
  }
  return null;
}

export default {
  setup({ players }) {
    return { board: '.'.repeat(SIZE * SIZE), sides: [players[0].id, players[1].id], turn: players[0].id, last: -1, line: null, result: null };
  },

  move(s, by, m) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const i = int(m?.cell, 0, SIZE * SIZE - 1);
    if (i == null || s.board[i] !== '.') throw new Nope('Pick an empty point.');
    const side = String(s.sides.indexOf(by));
    s.board = s.board.slice(0, i) + side + s.board.slice(i + 1);
    s.last = i;
    s.line = runAt(s.board, i, side);
    if (s.line) s.result = { winners: [by] };
    else if (!s.board.includes('.')) s.result = { winners: [], text: 'The board is full. A draw' };
    else s.turn = s.sides[1 - Number(side)];
  },
};
