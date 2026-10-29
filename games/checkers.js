// Checkers, American rules. The board is a 64 character string, row by row from the top:
// 'a' and 'A' are the first player's man and king, 'b' and 'B' the second's, '.' is empty.
// The first player starts on the bottom three rows and moves up; only dark squares are used.
import { Nope, int } from './util.js';

// Moves in a row (each side's turn counts as one) with no capture or crowning before it's a draw:
// 40 moves for each side.
export const QUIET_LIMIT = 80;

const owner = (p) => (p === 'a' || p === 'A' ? 0 : p === 'b' || p === 'B' ? 1 : null);
const isKing = (p) => p === 'A' || p === 'B';
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function startBoard() {
  let b = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) b += (r + c) % 2 ? (r < 3 ? 'b' : r > 4 ? 'a' : '.') : '.';
  return b;
}

// The directions a piece can go: men only forward, kings both ways.
function dirs(p) {
  const fwd = owner(p) === 0 ? -1 : 1;
  const rows = isKing(p) ? [-1, 1] : [fwd];
  return rows.flatMap((dr) => [[dr, -1], [dr, 1]]);
}

function jumpsFrom(board, i) {
  const p = board[i];
  const r = i >> 3, c = i & 7;
  const out = [];
  for (const [dr, dc] of dirs(p)) {
    if (!on(r + 2 * dr, c + 2 * dc)) continue;
    const mid = (r + dr) * 8 + c + dc, to = (r + 2 * dr) * 8 + c + 2 * dc;
    const o = owner(board[mid]);
    if (o != null && o !== owner(p) && board[to] === '.') out.push([i, to]);
  }
  return out;
}

function stepsFrom(board, i) {
  const r = i >> 3, c = i & 7;
  return dirs(board[i]).filter(([dr, dc]) => on(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === '.').map(([dr, dc]) => [i, (r + dr) * 8 + c + dc]);
}

// Every move [from, to] the side may make now. Captures are required; a chain stays with one piece.
export function movesFor(board, side, chain = -1) {
  if (chain >= 0) return jumpsFrom(board, chain);
  const jumps = [], steps = [];
  for (let i = 0; i < 64; i++) {
    if (owner(board[i]) !== side) continue;
    jumps.push(...jumpsFrom(board, i));
    if (!jumps.length) steps.push(...stepsFrom(board, i));
  }
  return jumps.length ? jumps : steps;
}

const nameOf = (ctx, id) => ctx.players.find((p) => p.id === id)?.name || 'Someone';

export default {
  setup({ players }) {
    const board = startBoard();
    return {
      board, sides: [players[0].id, players[1].id], turn: players[0].id, chain: -1, quiet: 0,
      last: null, legal: movesFor(board, 0), result: null,
    };
  },

  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const side = s.sides.indexOf(by);
    const from = int(m?.from, 0, 63), to = int(m?.to, 0, 63);
    if (from == null || to == null) throw new Nope('Pick a piece, then a square.');
    if (s.chain >= 0 && from !== s.chain) throw new Nope('Keep jumping with the same piece.');
    if (owner(s.board[from]) !== side) throw new Nope('Pick one of your pieces.');
    if (!s.legal.some(([f, t]) => f === from && t === to)) {
      const jumping = Math.abs((to >> 3) - (from >> 3)) === 1 && s.legal.some(([f, t]) => Math.abs((t >> 3) - (f >> 3)) === 2);
      throw new Nope(jumping ? 'You have a capture, and captures are required.' : 'That piece can’t move there.');
    }
    const b = [...s.board];
    const piece = b[from];
    const jump = Math.abs((to >> 3) - (from >> 3)) === 2;
    b[to] = piece;
    b[from] = '.';
    let taken = null;
    if (jump) {
      taken = (from + to) / 2;
      b[taken] = '.';
    }
    const crowned = !isKing(piece) && (to >> 3) === (side === 0 ? 0 : 7);
    if (crowned) b[to] = piece.toUpperCase();
    s.board = b.join('');
    if (s.chain >= 0 && s.last) {
      s.last.path.push(to);
      s.last.caps.push(taken);
    } else s.last = { by, path: [from, to], caps: taken == null ? [] : [taken] };
    if (jump || crowned) s.quiet = 0;
    else s.quiet++;
    if (crowned) s.last.crowned = to;

    // Another jump with the same piece keeps the turn, unless it was just crowned.
    if (jump && !crowned && jumpsFrom(s.board, to).length) {
      s.chain = to;
      s.legal = movesFor(s.board, side, to);
      return;
    }
    s.chain = -1;
    const them = 1 - side;
    s.legal = movesFor(s.board, them);
    if (!s.legal.length) {
      const none = ![...s.board].some((p) => owner(p) === them);
      s.result = { winners: [by], text: none ? `${nameOf(ctx, by)} took every piece` : `${nameOf(ctx, s.sides[them])} can’t move. ${nameOf(ctx, by)} wins` };
      return;
    }
    if (s.quiet >= QUIET_LIMIT) {
      s.result = { winners: [], text: 'A draw. Forty moves each with no capture' };
      return;
    }
    s.turn = s.sides[them];
  },
};
