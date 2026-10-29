// Tic-tac-toe: two players, three in a row.
import { Nope, int } from './util.js';

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export default {
  setup({ players }) {
    return { board: Array(9).fill(null), marks: { [players[0].id]: 'X', [players[1].id]: 'O' }, turn: players[0].id, last: null, line: null, result: null };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const i = int(m?.cell, 0, 8);
    if (i == null || s.board[i]) throw new Nope('Pick an empty square.');
    s.board[i] = by;
    s.last = i;
    s.line = LINES.find((l) => l.every((j) => s.board[j] === by)) || null;
    if (s.line) s.result = { winners: [by] };
    else if (s.board.every(Boolean)) s.result = { winners: [] };
    else s.turn = ctx.players.find((p) => p.id !== by).id;
  },
};
