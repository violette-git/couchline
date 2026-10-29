// Chess: every rule, refereed here. The board is a 64 character string, a8 first and h1 last
// (row by row from black's side). Uppercase is white, lowercase is black, '.' is empty.
import { Nope } from './util.js';

export const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
const FILES = 'abcdefgh';
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// Castling rights lost when anything moves from or to these squares.
const RIGHTS = { 60: 'KQ', 63: 'K', 56: 'Q', 4: 'kq', 7: 'k', 0: 'q' };

export const squareName = (i) => FILES[i & 7] + (8 - (i >> 3));
export function squareOf(name) {
  if (typeof name !== 'string' || !/^[a-h][1-8]$/.test(name)) return null;
  return (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
}
const colorOf = (p) => (p === '.' ? null : p < 'a' ? 'w' : 'b');
const other = (side) => (side === 'w' ? 'b' : 'w');
const on = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;

// Is square i attacked by side "by"?
export function attacked(board, i, by) {
  const r = i >> 3, f = i & 7;
  const mine = (p) => colorOf(p) === by;
  const at = (rr, ff) => board[rr * 8 + ff];
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const df of [-1, 1]) if (on(pr, f + df) && at(pr, f + df) === (by === 'w' ? 'P' : 'p')) return true;
  for (const [dr, df] of KNIGHT) if (on(r + dr, f + df) && mine(at(r + dr, f + df)) && at(r + dr, f + df).toUpperCase() === 'N') return true;
  for (const [dr, df] of KING) if (on(r + dr, f + df) && mine(at(r + dr, f + df)) && at(r + dr, f + df).toUpperCase() === 'K') return true;
  for (const [dirs, kinds] of [[DIAG, 'BQ'], [ORTHO, 'RQ']]) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (on(rr, ff)) {
        const p = at(rr, ff);
        if (p !== '.') {
          if (mine(p) && kinds.includes(p.toUpperCase())) return true;
          break;
        }
        rr += dr; ff += df;
      }
    }
  }
  return false;
}

const kingAt = (board, side) => board.indexOf(side === 'w' ? 'K' : 'k');
export const inCheck = (pos) => attacked(pos.board, kingAt(pos.board, pos.side), other(pos.side));

// Every move that follows the pieces' movement, before checking the king is safe.
function pseudo(pos) {
  const { board, side, castle, ep } = pos;
  const out = [];
  const add = (from, to, extra) => out.push({ from, to, ...extra });
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (colorOf(p) !== side) continue;
    const r = i >> 3, f = i & 7, kind = p.toUpperCase();
    if (kind === 'P') {
      const dir = side === 'w' ? -1 : 1;
      const last = side === 'w' ? 0 : 7;
      const pawnTo = (to) => {
        if (to >> 3 === last) for (const promo of 'qrbn') add(i, to, { promo });
        else add(i, to);
      };
      const one = i + dir * 8;
      if (board[one] === '.') {
        pawnTo(one);
        const two = one + dir * 8;
        if (r === (side === 'w' ? 6 : 1) && board[two] === '.') add(i, two);
      }
      for (const df of [-1, 1]) {
        if (!on(r + dir, f + df)) continue;
        const to = (r + dir) * 8 + f + df;
        if (colorOf(board[to]) === other(side)) pawnTo(to);
        else if (to === ep) add(i, to, { ep: true });
      }
    } else if (kind === 'N' || kind === 'K') {
      for (const [dr, df] of kind === 'N' ? KNIGHT : KING) {
        if (!on(r + dr, f + df)) continue;
        const to = (r + dr) * 8 + f + df;
        if (colorOf(board[to]) !== side) add(i, to);
      }
    } else {
      const dirs = kind === 'B' ? DIAG : kind === 'R' ? ORTHO : [...DIAG, ...ORTHO];
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (on(rr, ff)) {
          const to = rr * 8 + ff;
          if (board[to] !== '.') {
            if (colorOf(board[to]) !== side) add(i, to);
            break;
          }
          add(i, to);
          rr += dr; ff += df;
        }
      }
    }
  }
  // Castling: the rights, an empty path, and no check on the squares the king stands on or crosses.
  const them = other(side);
  const ok = (empty, safe) => empty.every((j) => board[j] === '.') && safe.every((j) => !attacked(board, j, them));
  if (side === 'w') {
    if (castle.includes('K') && board[60] === 'K' && board[63] === 'R' && ok([61, 62], [60, 61, 62])) add(60, 62, { castle: 'K' });
    if (castle.includes('Q') && board[60] === 'K' && board[56] === 'R' && ok([57, 58, 59], [60, 59, 58])) add(60, 58, { castle: 'Q' });
  } else {
    if (castle.includes('k') && board[4] === 'k' && board[7] === 'r' && ok([5, 6], [4, 5, 6])) add(4, 6, { castle: 'K' });
    if (castle.includes('q') && board[4] === 'k' && board[0] === 'r' && ok([1, 2, 3], [4, 3, 2])) add(4, 2, { castle: 'Q' });
  }
  return out;
}

// The position after a move (which must come from pseudo or legal), and what it captured.
export function make(pos, m) {
  const b = [...pos.board];
  const piece = b[m.from];
  const white = piece < 'a';
  let captured = b[m.to] === '.' ? null : b[m.to];
  b[m.to] = m.promo ? (white ? m.promo.toUpperCase() : m.promo) : piece;
  b[m.from] = '.';
  if (m.ep) {
    const behind = m.to + (white ? 8 : -8);
    captured = b[behind];
    b[behind] = '.';
  }
  if (m.castle) {
    const [rf, rt] = m.castle === 'K' ? [m.from + 3, m.from + 1] : [m.from - 4, m.from - 1];
    b[rt] = b[rf];
    b[rf] = '.';
  }
  let castle = pos.castle;
  for (const sq of [m.from, m.to]) if (RIGHTS[sq]) castle = castle.replace(new RegExp(`[${RIGHTS[sq]}]`, 'g'), '');
  const pawn = piece.toUpperCase() === 'P';
  return {
    board: b.join(''),
    side: other(pos.side),
    castle,
    ep: pawn && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1,
    half: pawn || captured ? 0 : pos.half + 1,
    full: pos.full + (pos.side === 'b' ? 1 : 0),
    captured,
  };
}

export function legalMoves(pos) {
  return pseudo(pos).filter((m) => {
    const next = make(pos, m);
    return !attacked(next.board, kingAt(next.board, pos.side), next.side);
  });
}

// Counts leaf positions n moves deep: the standard way to check a move generator.
export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(make(pos, m), depth - 1);
  return n;
}

export function fromFen(fen) {
  const [placement, side = 'w', castle = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const board = placement.split('/').map((row) => row.replace(/\d/g, (d) => '.'.repeat(Number(d)))).join('');
  return { board, side, castle: castle === '-' ? '' : castle, ep: ep === '-' ? -1 : squareOf(ep), half: Number(half), full: Number(full) };
}

// Standard algebraic notation, like Nbd7, exd6, O-O, e8=Q+, Qh4#.
function san(pos, m, legal, next, nextLegal) {
  let s;
  if (m.castle) s = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else {
    const piece = pos.board[m.from];
    const kind = piece.toUpperCase();
    const capture = pos.board[m.to] !== '.' || m.ep;
    if (kind === 'P') {
      s = `${capture ? `${FILES[m.from & 7]}x` : ''}${squareName(m.to)}${m.promo ? `=${m.promo.toUpperCase()}` : ''}`;
    } else {
      s = kind;
      const rivals = legal.filter((o) => o.to === m.to && o.from !== m.from && pos.board[o.from] === piece);
      if (rivals.length) {
        const name = squareName(m.from);
        if (!rivals.some((o) => (o.from & 7) === (m.from & 7))) s += name[0];
        else if (!rivals.some((o) => o.from >> 3 === m.from >> 3)) s += name[1];
        else s += name;
      }
      s += `${capture ? 'x' : ''}${squareName(m.to)}`;
    }
  }
  if (inCheck(next)) s += nextLegal.length ? '+' : '#';
  return s;
}

// Draws by material: king against king, a lone minor piece, or bishops all on one square color.
export function insufficient(board) {
  const minors = [];
  for (let i = 0; i < 64; i++) {
    const k = board[i].toUpperCase();
    if (k === 'P' || k === 'R' || k === 'Q') return false;
    if (k === 'N' || k === 'B') minors.push({ k, shade: ((i >> 3) + (i & 7)) % 2 });
  }
  if (minors.length <= 1) return true;
  return minors.every((x) => x.k === 'B' && x.shade === minors[0].shade);
}

// What makes two positions the same for repetition: pieces, side to move, castling, and an
// en passant square only when that capture is actually possible.
const keyOf = (pos, legal) => `${pos.board} ${pos.side} ${pos.castle} ${legal.some((m) => m.ep) ? pos.ep : '-'}`;

const nameOf = (ctx, id) => ctx.players.find((p) => p.id === id)?.name || 'Someone';

// Recomputes what the next player may do and ends the game if the position calls for it.
function settle(s, ctx) {
  const pos = s;
  const legal = legalMoves(pos);
  const check = inCheck(pos);
  s.check = check ? kingAt(s.board, s.side) : -1;
  s.legal = [...new Set(legal.map((m) => squareName(m.from) + squareName(m.to)))];
  s.turn = s.colors[s.side];
  const key = keyOf(pos, legal);
  s.keys.push(key);
  const mover = s.colors[other(s.side)];
  if (!legal.length) {
    s.result = check ? { winners: [mover], text: `Checkmate. ${nameOf(ctx, mover)} wins` } : { winners: [], text: 'Stalemate. A draw' };
    s.end = check ? 'mate' : 'stalemate';
  } else if (insufficient(s.board)) {
    s.result = { winners: [], text: 'A draw. Neither side can checkmate' };
    s.end = 'material';
  } else if (s.half >= 100) {
    s.result = { winners: [], text: 'A draw by the fifty move rule' };
    s.end = 'fifty';
  } else if (s.keys.filter((k) => k === key).length >= 3) {
    s.result = { winners: [], text: 'A draw by threefold repetition' };
    s.end = 'repetition';
  }
  return legal;
}

export function newState(ctx, pos = fromFen(`${START} w KQkq - 0 1`)) {
  const { players } = ctx;
  const s = {
    ...pos, colors: { w: players[0].id, b: players[1].id }, turn: null,
    last: null, moves: [], taken: { w: '', b: '' }, offer: null, offered: {}, keys: [], check: -1, legal: [], end: null, result: null,
  };
  settle(s, ctx);
  return s;
}

export default {
  setup(_, ctx) {
    return newState(ctx);
  },

  move(s, by, m, ctx) {
    const mySide = s.colors.w === by ? 'w' : s.colors.b === by ? 'b' : null;
    if (!mySide) throw new Nope('You’re watching this one.');
    const them = s.colors[other(mySide)];
    if (m?.resign === true) {
      s.result = { winners: [them], text: `${nameOf(ctx, by)} resigned. ${nameOf(ctx, them)} wins` };
      s.end = 'resign';
      s.offer = null;
      return;
    }
    if (m?.offerDraw === true) {
      if (s.offer === by) throw new Nope('Your draw offer is waiting for an answer.');
      if (s.offer === them) { m = { acceptDraw: true }; } else {
        if (s.offered[by] === s.moves.length) throw new Nope('Make a move before offering again.');
        s.offer = by;
        s.offered[by] = s.moves.length;
        ctx.say(`${nameOf(ctx, by)} offers a draw.`, by);
        return;
      }
    }
    if (m?.acceptDraw === true || m?.declineDraw === true) {
      if (s.offer !== them) throw new Nope('There’s no draw offer to answer.');
      s.offer = null;
      if (m.acceptDraw) {
        s.result = { winners: [], text: 'A draw by agreement' };
        s.end = 'agreed';
      } else ctx.say(`${nameOf(ctx, by)} declined the draw.`, by);
      return;
    }
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const from = squareOf(m?.from), to = squareOf(m?.to);
    if (from == null || to == null) throw new Nope('Pick a piece, then a square.');
    if (colorOf(s.board[from]) !== mySide) throw new Nope('Pick one of your pieces.');
    const legal = legalMoves(s);
    const fits = legal.filter((x) => x.from === from && x.to === to);
    if (!fits.length) {
      const could = pseudo(s).some((x) => x.from === from && x.to === to);
      throw new Nope(could ? (inCheck(s) ? 'You need to get out of check.' : 'That would leave your king in check.') : 'That piece can’t move there.');
    }
    let mv = fits[0];
    if (fits.length > 1) {
      const promo = typeof m.promo === 'string' ? m.promo.toLowerCase() : '';
      mv = fits.find((x) => x.promo === promo);
      if (!mv) throw new Nope('Pick a piece to promote to.');
    }
    const before = { board: s.board, side: s.side, castle: s.castle, ep: s.ep, half: s.half, full: s.full };
    const next = make(before, mv);
    const { captured, ...pos } = next;
    Object.assign(s, pos);
    if (captured) s.taken[mySide] += captured;
    // A pawn move or a capture can never be undone, so earlier positions can't repeat.
    if (!next.half) s.keys = [];
    if (s.offer && s.offer !== by) s.offer = null;
    s.last = { from, to };
    const nextLegal = settle(s, ctx);
    s.moves.push(san(before, mv, legal, next, nextLegal));
  },

  view(s) {
    const { keys, offered, ...rest } = s;
    return rest;
  },
};
