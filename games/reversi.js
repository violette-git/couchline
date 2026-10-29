// Othello: the board is a 64 character string, row by row: '0' is the first player's disc,
// '1' the second's, '.' is empty. The first player starts with d5 and e4 and moves first.
import { Nope, int } from './util.js';

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function startBoard() {
  const b = Array(64).fill('.');
  b[27] = '1'; b[36] = '1'; b[28] = '0'; b[35] = '0';
  return b.join('');
}

// The discs a move at i would flip for side ('0' or '1'), or [] if it isn't a legal move.
export function flipsFor(board, i, side) {
  if (board[i] !== '.') return [];
  const r0 = i >> 3, c0 = i & 7;
  const out = [];
  for (const [dr, dc] of DIRS) {
    const run = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] !== '.' && board[r * 8 + c] !== side) {
      run.push(r * 8 + c);
      r += dr; c += dc;
    }
    if (run.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === side) out.push(...run);
  }
  return out;
}

export const movesFor = (board, side) => [...Array(64).keys()].filter((i) => flipsFor(board, i, side).length);
const count = (board, side) => [...board].filter((x) => x === side).length;
const nameOf = (ctx, id) => ctx.players.find((p) => p.id === id)?.name || 'Someone';

export default {
  setup({ players }) {
    const board = startBoard();
    return { board, sides: [players[0].id, players[1].id], turn: players[0].id, last: -1, flips: [], pass: null, legal: movesFor(board, '0'), result: null };
  },

  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const side = String(s.sides.indexOf(by));
    const i = int(m?.cell, 0, 63);
    if (i == null || s.board[i] !== '.') throw new Nope('Pick an empty square.');
    const flips = flipsFor(s.board, i, side);
    if (!flips.length) throw new Nope('That move doesn’t trap any discs.');
    const b = [...s.board];
    b[i] = side;
    for (const j of flips) b[j] = side;
    s.board = b.join('');
    s.last = i;
    s.flips = flips;
    s.pass = null;
    const them = side === '0' ? '1' : '0';
    const theirs = movesFor(s.board, them);
    if (theirs.length) {
      s.turn = s.sides[Number(them)];
      s.legal = theirs;
      return;
    }
    const mine = movesFor(s.board, side);
    if (mine.length) {
      // They can't move, so they pass and it's this player's turn again.
      s.pass = s.sides[Number(them)];
      s.legal = mine;
      ctx.say(`${nameOf(ctx, s.pass)} has no move and passes.`);
      return;
    }
    s.legal = [];
    const a = count(s.board, '0'), z = count(s.board, '1');
    const winners = a === z ? [] : [s.sides[a > z ? 0 : 1]];
    s.result = { winners, text: winners.length ? `${nameOf(ctx, winners[0])} wins, ${Math.max(a, z)} to ${Math.min(a, z)}` : `A draw, ${a} each` };
  },
};
