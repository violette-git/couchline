// Checkers, Chess, Othello, Five in a Row, and Mancala.
import assert from 'node:assert/strict';
import { play } from './harness.js';
import { checker } from '../helpers.js';
import { perft, fromFen, newState, squareOf } from '../../games/chess.js';
import { movesFor as checkersMoves, QUIET_LIMIT } from '../../games/checkers.js';
import { movesFor as reversiMoves } from '../../games/reversi.js';
import { SIZE } from '../../games/gomoku.js';

const check = checker();

// ---------- chess ----------
const START = fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
assert.equal(perft(START, 1), 20);
assert.equal(perft(START, 2), 400);
assert.equal(perft(START, 3), 8902);
check.ok('chess: perft from the start is 20, 400, 8902');
// "Kiwipete": castling both ways, en passant, promotions, and pins all at once.
const KIWI = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
assert.equal(perft(KIWI, 1), 48);
assert.equal(perft(KIWI, 2), 2039);
// En passant that would expose the king along a rank, and checks from a discovered rook.
assert.equal(perft(fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 3), 2812);
// Promotions with checks, castling rights lost by captures.
assert.equal(perft(fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 2), 264);
check.ok('chess: perft on known tricky positions (castling, en passant, promotion, pins)');

// Plays a list of moves like 'e2e4' or 'e7e8q', each by whoever is to move.
const chessMoves = (g, list) => {
  for (const mv of list.split(' ')) g.move(g.state.turn, { from: mv.slice(0, 2), to: mv.slice(2, 4), promo: mv[4] });
};
const chessAt = (fen) => {
  const g = play('chess');
  g.state = newState(g.ctx, fromFen(fen));
  return g;
};

let g = play('chess');
assert.equal(g.state.colors.w, 'p1', 'the first player is white');
assert.equal(g.state.turn, 'p1');
assert.equal(g.state.legal.length, 20);
assert.match(g.refused('p2', { from: 'e7', to: 'e5' }), /not your turn/);
assert.match(g.refused('p1', { from: 'e7', to: 'e5' }), /your pieces/);
assert.match(g.refused('p1', { from: 'e2', to: 'e5' }), /can’t move there/);
assert.match(g.refused('p1', { from: 'z9', to: 'e4' }), /Pick a piece/);
g.refused('p1', { from: 'e2' });
g.refused('p1', null);
g.refused('p1', { from: ['e2'], to: 'e4' });
g.refused('p1', { from: 'b1', to: 'd2' });
g.move('p1', { from: 'e2', to: 'e4' });
assert.equal(g.state.ep, squareOf('e3'));
assert.equal(g.state.turn, 'p2');
assert.deepEqual(g.state.last, { from: squareOf('e2'), to: squareOf('e4') });
check.ok('chess: turns, whose pieces, shapes of moves, bad payloads');

// Fool's mate.
g = play('chess');
chessMoves(g, 'f2f3 e7e5 g2g4 d8h4');
assert.deepEqual(g.state.result.winners, ['p2']);
assert.equal(g.state.end, 'mate');
assert.equal(g.state.result.text, 'Checkmate. P2 wins');
assert.deepEqual(g.state.moves, ['f3', 'e5', 'g4', 'Qh4#']);
assert.equal(g.state.check, squareOf('e1'), 'the mated king is marked');
check.ok('chess: fool’s mate ends the game, with Qh4# in the move list');

// Castling, and the notation along the way.
g = play('chess');
chessMoves(g, 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1');
assert.equal(g.state.board[squareOf('g1')], 'K');
assert.equal(g.state.board[squareOf('f1')], 'R');
assert.equal(g.state.board[squareOf('h1')], '.');
assert.equal(g.state.castle, 'kq');
assert.deepEqual(g.state.moves, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']);
// Queenside, for black.
g = chessAt('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
chessMoves(g, 'e8c8');
assert.equal(g.state.board.slice(0, 8), '..kr...r');
assert.equal(g.state.castle, 'KQ');
assert.equal(g.state.moves.at(-1), 'O-O-O');
// Not out of, through, or into check; not after the rook has moved; not with a piece in the way.
g = chessAt('r3k2r/8/8/8/8/8/8/R3K1r1 w KQkq - 0 1');
g.refused('p1', { from: 'e1', to: 'c1' }); // in check from g1
g = chessAt('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
g.refused('p1', { from: 'e1', to: 'g1' }); // through f1, attacked
g.move('p1', { from: 'e1', to: 'c1' }); // the queenside is fine
g = chessAt('r3k2r/8/8/8/8/8/6r1/R3K2R w KQkq - 0 1');
g.refused('p1', { from: 'e1', to: 'g1' }); // into g1, attacked
g = chessAt('r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1');
g.move('p1', { from: 'e1', to: 'c1' }); // b1 attacked is fine: the king doesn't cross it
g = chessAt('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1');
g.refused('p1', { from: 'e1', to: 'c1' }); // b1 is blocked
g = chessAt('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
chessMoves(g, 'h1h2 a8a7 h2h1 a7a8');
assert.equal(g.state.castle, 'Qk');
g.refused('p1', { from: 'e1', to: 'g1' });
// Capturing a rook on its corner takes away that castling right.
g = chessAt('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
chessMoves(g, 'a1a8');
assert.equal(g.state.castle, 'Kk');
assert.equal(g.state.moves.at(-1), 'Rxa8+');
check.ok('chess: castling both sides, and every condition that stops it');

// En passant, only right after the double step.
g = play('chess');
chessMoves(g, 'e2e4 a7a6 e4e5 d7d5');
g.move('p1', { from: 'e5', to: 'd6' });
assert.equal(g.state.board[squareOf('d5')], '.', 'the passed pawn is taken');
assert.equal(g.state.board[squareOf('d6')], 'P');
assert.equal(g.state.moves.at(-1), 'exd6');
assert.equal(g.state.taken.w, 'p');
g = play('chess');
chessMoves(g, 'e2e4 d7d5 e4e5 f7f5 h2h3 a7a6');
g.refused('p1', { from: 'e5', to: 'f6' }); // too late
g.refused('p1', { from: 'e5', to: 'd6' });
// En passant that would uncover a check along the rank is refused.
g = chessAt('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
assert.match(g.refused('p1', { from: 'e5', to: 'd6' }), /king in check/);
check.ok('chess: en passant, its timing, and its pins');

// Promotion with a choice of piece.
g = chessAt('8/P6k/8/8/8/8/8/K7 w - - 0 1');
assert.match(g.refused('p1', { from: 'a7', to: 'a8' }), /promote/);
assert.match(g.refused('p1', { from: 'a7', to: 'a8', promo: 'k' }), /promote/);
assert.match(g.refused('p1', { from: 'a7', to: 'a8', promo: 'qq' }), /promote/);
g.move('p1', { from: 'a7', to: 'a8', promo: 'n' });
assert.equal(g.state.board[0], 'N');
assert.equal(g.state.moves.at(-1), 'a8=N');
g = chessAt('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
g.move('p1', { from: 'a7', to: 'b8', promo: 'q' });
assert.equal(g.state.moves.at(-1), 'axb8=Q+');
assert.ok(g.state.legal.includes('h8h7') && g.state.turn === 'p2');
g = chessAt('k7/8/8/8/8/8/p7/7K b - - 0 1');
g.move('p2', { from: 'a2', to: 'a1', promo: 'r' });
assert.equal(g.state.board[squareOf('a1')], 'r', 'black promotes to a black piece');
assert.equal(g.state.check, squareOf('h1'));
check.ok('chess: promotion needs a piece, and makes that piece');

// Check: you must answer it.
g = play('chess');
chessMoves(g, 'e2e4 f7f6 d1h5');
assert.equal(g.state.check, squareOf('e8'));
assert.equal(g.state.moves.at(-1), 'Qh5+');
assert.match(g.refused('p2', { from: 'a7', to: 'a6' }), /check/);
g.move('p2', { from: 'g7', to: 'g6' });
assert.equal(g.state.check, -1);
// A pinned piece can't move off the line.
g = chessAt('4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1');
assert.match(g.refused('p1', { from: 'e2', to: 'c3' }), /king in check/);
assert.ok(!g.state.legal.some((m) => m.startsWith('e2')));
// Disambiguation in notation: Nbd2 and R1a3.
g = chessAt('4k3/8/8/8/8/5N2/8/RN2K2R w - - 0 1');
chessMoves(g, 'b1d2');
assert.equal(g.state.moves.at(-1), 'Nbd2');
g = chessAt('4k3/8/R7/8/8/8/8/R3K3 w - - 0 1');
chessMoves(g, 'a1a3');
assert.equal(g.state.moves.at(-1), 'R1a3');
check.ok('chess: check must be answered, pins hold, notation disambiguates');

// Stalemate.
g = chessAt('7k/4Q3/6K1/8/8/8/8/8 w - - 0 1');
g.move('p1', { from: 'e7', to: 'f7' });
assert.deepEqual(g.state.result.winners, []);
assert.equal(g.state.end, 'stalemate');
assert.equal(g.state.moves.at(-1), 'Qf7');
check.ok('chess: stalemate is a draw');

// Insufficient material.
g = chessAt('k7/8/8/8/8/8/1r6/KB6 w - - 0 1');
g.move('p1', { from: 'a1', to: 'b2' });
assert.equal(g.state.end, 'material', 'king and bishop against king');
g = chessAt('k7/8/8/8/8/8/1r6/KN6 w - - 0 1');
g.move('p1', { from: 'a1', to: 'b2' });
assert.equal(g.state.end, 'material', 'king and knight against king');
g = chessAt('kb6/8/8/8/8/8/1r6/K1B5 w - - 0 1');
g.move('p1', { from: 'a1', to: 'b2' });
assert.equal(g.state.end, 'material', 'bishops on the same color');
g = chessAt('k1b5/8/8/8/8/8/1r6/K1B5 w - - 0 1');
g.move('p1', { from: 'a1', to: 'b2' });
assert.equal(g.state.result, null, 'bishops on both colors can still mate');
g = chessAt('kn6/8/8/8/8/8/1r6/KN6 w - - 0 1');
g.move('p1', { from: 'a1', to: 'b2' });
assert.equal(g.state.result, null, 'two knights play on');
check.ok('chess: insufficient material is a draw, and only then');

// The fifty move rule.
g = chessAt('k7/8/8/8/8/8/8/KR6 w - - 99 80');
g.move('p1', { from: 'b1', to: 'b2' });
assert.equal(g.state.end, 'fifty');
g = chessAt('k7/8/8/8/8/8/8/KR6 w - - 98 80');
g.move('p1', { from: 'b1', to: 'b2' });
assert.equal(g.state.result, null);
g = chessAt('k7/p7/8/8/8/8/8/KR6 b - - 99 80');
g.move('p2', { from: 'a7', to: 'a6' });
assert.equal(g.state.result, null, 'a pawn move resets the count');
assert.equal(g.state.half, 0);
// Mate on the hundredth half move is still mate.
g = chessAt('k7/8/1K6/8/8/8/8/7R w - - 99 80');
g.move('p1', { from: 'h1', to: 'h8' });
assert.equal(g.state.end, 'mate');
check.ok('chess: the fifty move rule, and mate beats it');

// Threefold repetition.
g = play('chess');
chessMoves(g, 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1');
assert.equal(g.state.result, null);
chessMoves(g, 'f6g8');
assert.equal(g.state.end, 'repetition');
assert.deepEqual(g.state.result.winners, []);
g = play('chess');
chessMoves(g, 'g1f3 g8f6 f3g1 f6g8 e2e4 e7e5 g1f3 g8f6 f3g1 f6g8');
assert.equal(g.state.result, null, 'a pawn move breaks the repetition');
check.ok('chess: threefold repetition is a draw');

// Resigning and draws by agreement.
g = play('chess');
g.move('p2', { resign: true });
assert.deepEqual(g.state.result.winners, ['p1'], 'you can resign on their turn');
assert.equal(g.state.result.text, 'P2 resigned. P1 wins');
g = play('chess');
g.refused('p2', { acceptDraw: true });
g.move('p1', { offerDraw: true });
assert.equal(g.state.offer, 'p1');
assert.equal(g.view('p2').offer, 'p1');
g.refused('p1', { offerDraw: true });
g.refused('p1', { acceptDraw: true });
g.move('p2', { declineDraw: true });
assert.equal(g.state.offer, null);
g.refused('p1', { offerDraw: true }); // not again until a move
chessMoves(g, 'e2e4');
g.move('p1', { offerDraw: true });
chessMoves(g, 'e7e5');
assert.equal(g.state.offer, null, 'moving instead of answering declines it');
g.move('p2', { offerDraw: true });
g.move('p1', { offerDraw: true }); // offering back accepts
assert.equal(g.state.end, 'agreed');
assert.deepEqual(g.state.result.winners, []);
g = play('chess');
g.move('p1', { offerDraw: true });
chessMoves(g, 'e2e4');
assert.equal(g.state.offer, 'p1', 'the offer stands while its maker moves');
g.move('p2', { acceptDraw: true });
assert.equal(g.state.result.text, 'A draw by agreement');
check.ok('chess: resign, offer, decline, accept, and offers that lapse');

g = play('chess');
chessMoves(g, 'g1f3 g8f6');
const cv = g.view('p2');
assert.equal(cv.keys, undefined, 'repetition bookkeeping stays on the server');
assert.equal(cv.offered, undefined);
assert.ok(cv.legal.includes('f3g5') && cv.legal.every((m) => /^[a-h][1-8][a-h][1-8]$/.test(m)));
assert.ok(JSON.stringify(cv).length < 1200, 'the view stays small');
check.ok('chess: the view is small and holds only the board, moves, and legal squares');

// ---------- checkers ----------
// Squares: row * 8 + column from the top. The first player ('a') starts at the bottom.
const at = (r, c) => r * 8 + c;
const boardOf = (pieces) => {
  const b = Array(64).fill('.');
  for (const [r, c, p] of pieces) b[at(r, c)] = p;
  return b.join('');
};
const checkersAt = (pieces, turn = 'p1') => {
  const g = play('checkers');
  g.state.board = boardOf(pieces);
  g.state.turn = turn;
  g.state.legal = checkersMoves(g.state.board, turn === 'p1' ? 0 : 1);
  return g;
};

g = play('checkers');
assert.equal([...g.state.board].filter((p) => p === 'a').length, 12);
assert.equal([...g.state.board].filter((p) => p === 'b').length, 12);
assert.ok([...g.state.board].every((p, i) => p === '.' || ((i >> 3) + (i & 7)) % 2 === 1), 'only dark squares');
assert.equal(g.state.turn, 'p1');
assert.equal(g.state.legal.length, 7);
g.refused('p2', { from: at(2, 1), to: at(3, 0) });
g.refused('p1', { from: at(2, 1), to: at(3, 0) });
g.refused('p1', { from: at(5, 0), to: at(6, 1) }); // backwards and occupied
g.refused('p1', { from: at(5, 0), to: at(4, 0) }); // not diagonal
g.refused('p1', { from: 'x', to: 3 });
g.refused('p1', { from: at(5, 0), to: 64 });
g.move('p1', { from: at(5, 2), to: at(4, 3) });
assert.equal(g.state.turn, 'p2');
g.move('p2', { from: at(2, 3), to: at(3, 4) });
assert.deepEqual(g.state.last.path, [at(2, 3), at(3, 4)]);
check.ok('checkers: setup, turns, men move one square forward on dark squares');

// Captures are required.
g = checkersAt([[5, 2, 'a'], [4, 3, 'b'], [7, 0, 'a'], [0, 7, 'b']]);
assert.match(g.refused('p1', { from: at(7, 0), to: at(6, 1) }), /required/);
g.move('p1', { from: at(5, 2), to: at(3, 4) });
assert.equal(g.state.board[at(4, 3)], '.', 'the jumped piece is gone');
assert.deepEqual(g.state.last.caps, [at(4, 3)]);
// Men don't capture backwards, kings do.
g = checkersAt([[4, 3, 'a'], [5, 4, 'b'], [0, 1, 'b']]);
assert.ok(!g.state.legal.some(([, t]) => t === at(6, 5)), 'a man can’t jump backwards');
g = checkersAt([[4, 3, 'A'], [5, 4, 'b'], [0, 1, 'b']]);
assert.deepEqual(g.state.legal, [[at(4, 3), at(6, 5)]]);
g.move('p1', { from: at(4, 3), to: at(6, 5) });
check.ok('checkers: captures are required, men capture forward, kings both ways');

// A multi-jump keeps the turn with the same piece until the chain ends.
g = checkersAt([[6, 1, 'a'], [5, 2, 'b'], [3, 4, 'b'], [7, 6, 'a'], [0, 1, 'b']]);
g.move('p1', { from: at(6, 1), to: at(4, 3) });
assert.equal(g.state.turn, 'p1', 'the turn stays for the next jump');
assert.equal(g.state.chain, at(4, 3));
assert.match(g.refused('p1', { from: at(7, 6), to: at(6, 5) }), /same piece/);
g.refused('p2', { from: at(0, 1), to: at(1, 0) });
g.move('p1', { from: at(4, 3), to: at(2, 5) });
assert.equal(g.state.turn, 'p2');
assert.equal(g.state.chain, -1);
assert.deepEqual(g.state.last.path, [at(6, 1), at(4, 3), at(2, 5)]);
assert.deepEqual(g.state.last.caps, [at(5, 2), at(3, 4)]);
check.ok('checkers: multi-jumps stay with one piece and keep the turn');

// Crowning ends the turn, even with another jump open to the new king.
g = checkersAt([[2, 1, 'a'], [1, 2, 'b'], [1, 4, 'b'], [7, 0, 'a'], [5, 6, 'b']]);
g.move('p1', { from: at(2, 1), to: at(0, 3) });
assert.equal(g.state.board[at(0, 3)], 'A');
assert.equal(g.state.turn, 'p2', 'crowning ends the turn');
assert.equal(g.state.last.crowned, at(0, 3));
assert.equal(g.state.board[at(1, 4)], 'b');
g = checkersAt([[6, 1, 'b'], [0, 1, 'a']], 'p2');
g.move('p2', { from: at(6, 1), to: at(7, 2) });
assert.equal(g.state.board[at(7, 2)], 'B', 'the second player crowns on the bottom row');
// Kings step backwards.
g = checkersAt([[3, 2, 'A'], [0, 1, 'b']]);
assert.ok(g.state.legal.some(([, t]) => t === at(4, 1)) && g.state.legal.some(([, t]) => t === at(2, 3)));
g.move('p1', { from: at(3, 2), to: at(4, 1) });
check.ok('checkers: crowning ends the turn, and kings move both ways');

// Winning by taking every piece, and by leaving no move.
g = checkersAt([[5, 2, 'a'], [4, 3, 'b']]);
g.move('p1', { from: at(5, 2), to: at(3, 4) });
assert.deepEqual(g.state.result.winners, ['p1']);
assert.equal(g.state.result.text, 'P1 took every piece');
g = checkersAt([[7, 0, 'b'], [6, 1, 'a'], [5, 2, 'a'], [3, 6, 'a']]);
g.move('p1', { from: at(3, 6), to: at(2, 7) });
assert.deepEqual(g.state.result.winners, ['p1'], 'a blocked side loses');
assert.match(g.state.result.text, /can’t move/);
check.ok('checkers: win by taking every piece or leaving no move');

// A draw after forty moves each with no capture or crowning.
g = checkersAt([[0, 1, 'A'], [7, 6, 'B']]);
for (let k = 0; k < QUIET_LIMIT; k++) {
  const by = g.state.turn;
  const there = by === 'p1' ? (k % 4 < 2 ? [at(0, 1), at(1, 0)] : [at(1, 0), at(0, 1)]) : (k % 4 < 2 ? [at(7, 6), at(6, 7)] : [at(6, 7), at(7, 6)]);
  assert.equal(g.state.result, null);
  g.move(by, { from: there[0], to: there[1] });
}
assert.deepEqual(g.state.result.winners, []);
assert.match(g.state.result.text, /draw/);
g = checkersAt([[0, 1, 'A'], [7, 6, 'B'], [5, 4, 'a']]);
g.state.quiet = QUIET_LIMIT - 2;
g.move('p1', { from: at(5, 4), to: at(4, 5) });
g.move('p2', { from: at(7, 6), to: at(6, 7) });
assert.equal(g.state.result.winners.length, 0);
g = checkersAt([[0, 1, 'A'], [7, 6, 'B'], [1, 2, 'a']]);
g.state.quiet = QUIET_LIMIT - 1;
g.move('p1', { from: at(1, 2), to: at(0, 3) });
assert.equal(g.state.result, null, 'crowning resets the count');
assert.equal(g.state.quiet, 0);
check.ok('checkers: forty quiet moves each is a draw');

// ---------- othello ----------
g = play('reversi');
assert.equal(g.state.board.replace(/\./g, ''), '1001');
assert.deepEqual(g.state.legal, [19, 26, 37, 44]);
g.refused('p2', { cell: 19 });
assert.match(g.refused('p1', { cell: 27 }), /empty/);
assert.match(g.refused('p1', { cell: 0 }), /trap/);
g.refused('p1', { cell: -1 });
g.refused('p1', { cell: '19' });
g.move('p1', { cell: 19 });
assert.equal(g.state.board[27], '0', 'the trapped disc flips');
assert.deepEqual(g.state.flips, [27]);
assert.equal(g.state.last, 19);
assert.equal(g.state.turn, 'p2');
assert.deepEqual(g.state.legal, reversiMoves(g.state.board, '1'));
g.move('p2', { cell: 18 });
assert.equal(g.state.board[27], '1');
check.ok('othello: setup, hints, flips, turns, and moves that trap nothing');

// Flips in several directions at once.
const reversiAt = (cells, turn = 'p1') => {
  const g = play('reversi');
  const b = Array(64).fill('.');
  for (const [i, v] of Object.entries(cells)) b[i] = v;
  g.state.board = b.join('');
  g.state.turn = turn;
  g.state.legal = reversiMoves(g.state.board, turn === 'p1' ? '0' : '1');
  return g;
};
g = reversiAt({ 1: '1', 2: '0', 8: '1', 16: '0', 9: '1', 18: '0', 3: '1' });
g.move('p1', { cell: 0 });
assert.deepEqual(g.state.flips.sort((a, b) => a - b), [1, 8, 9]);
assert.equal(g.state.board[3], '1', 'a disc not trapped stays');
check.ok('othello: flips in every trapped direction, and only those');

// A pass when the other player has no move, then the end.
g = reversiAt({ 0: '0', 1: '1', 56: '0', 57: '1', 58: '1' });
g.move('p1', { cell: 2 });
assert.equal(g.state.pass, 'p2');
assert.equal(g.state.turn, 'p1', 'p2 passes, so p1 goes again');
assert.ok(g.said.some((t) => /P2 has no move and passes/.test(t)));
assert.deepEqual(g.view('p2').legal, [59]);
g.move('p1', { cell: 59 });
assert.deepEqual(g.state.result.winners, ['p1']);
assert.equal(g.state.result.text, 'P1 wins, 7 to 0');
// Neither can move: the most discs wins, and equal is a draw.
g = reversiAt({ 0: '0', 1: '1', 61: '1', 62: '1', 63: '1' });
g.move('p1', { cell: 2 });
assert.deepEqual(g.state.result.winners, []);
assert.equal(g.state.result.text, 'A draw, 3 each');
check.ok('othello: automatic passes, the end, the count, and a draw');

// ---------- five in a row ----------
const N = SIZE;
g = play('gomoku');
assert.equal(g.state.board.length, N * N);
g.refused('p2', { cell: 0 });
g.refused('p1', { cell: N * N });
g.refused('p1', { cell: 1.5 });
for (const [by, cell] of [['p1', 112], ['p2', 0], ['p1', 113], ['p2', 1], ['p1', 114], ['p2', 2], ['p1', 115], ['p2', 3]]) g.move(by, { cell });
assert.match(g.refused('p1', { cell: 3 }), /empty/);
assert.equal(g.state.result, null, 'four is not enough');
g.move('p1', { cell: 111 });
assert.deepEqual(g.state.result.winners, ['p1']);
assert.deepEqual(g.state.line, [111, 112, 113, 114, 115]);
assert.equal(g.state.last, 111);
check.ok('five in a row: turns, taken points, five across wins');

// Diagonals, and overlines (six or more) win too.
g = play('gomoku');
for (let k = 0; k < 4; k++) { g.move('p1', { cell: (k + 2) * N + (k + 2) }); g.move('p2', { cell: k }); }
g.move('p1', { cell: 6 * N + 6 });
assert.equal(g.state.line.length, 5);
g = play('gomoku');
for (const k of [0, 1, 2, 4, 5]) { g.move('p1', { cell: k * N + 7 }); g.move('p2', { cell: k * N }); }
g.move('p1', { cell: 3 * N + 7 });
assert.deepEqual(g.state.result.winners, ['p1']);
assert.equal(g.state.line.length, 6, 'six in a row counts');
// A full board with no five is a draw: a pattern with no run longer than two in any direction.
g = play('gomoku');
const fill = [];
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) fill.push(String(Math.floor(((c + 2 * r) % 4) / 2)));
const lastCell = N * N - 1;
g.state.board = fill.map((v, i) => (i === lastCell ? '.' : v)).join('');
g.state.turn = g.state.sides[Number(fill[lastCell])];
g.move(g.state.turn, { cell: lastCell });
assert.deepEqual(g.state.result.winners, []);
assert.match(g.state.result.text, /full/);
check.ok('five in a row: diagonals, overlines, and a full board draw');

// ---------- mancala ----------
g = play('mancala');
assert.deepEqual(g.state.pits, [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
g.refused('p2', { pit: 0 });
g.refused('p1', { pit: 6 });
g.refused('p1', { pit: -1 });
g.refused('p1', { pit: '2' });
g.move('p1', { pit: 2 });
assert.deepEqual(g.state.pits, [4, 4, 0, 5, 5, 5, 1, 4, 4, 4, 4, 4, 4, 0]);
assert.equal(g.state.turn, 'p1', 'ending in your store goes again');
assert.equal(g.state.last.again, true);
assert.match(g.refused('p1', { pit: 2 }), /empty/);
g.move('p1', { pit: 5 });
assert.deepEqual(g.state.pits, [4, 4, 0, 5, 5, 0, 2, 5, 5, 5, 5, 4, 4, 0]);
assert.equal(g.state.turn, 'p2');
g.move('p2', { pit: 0 });
assert.deepEqual(g.state.last.sown, [8, 9, 10, 11, 12]);
assert.equal(g.state.pits[7], 0, 'the second player’s pit 0 is index 7');
check.ok('mancala: sowing, the extra turn, empty pits, and both sides’ pits');

// Skipping the other store on a long sow.
g = play('mancala');
g.state.pits = [0, 0, 0, 0, 0, 14, 0, 1, 1, 1, 1, 1, 1, 0];
g.move('p1', { pit: 5 });
assert.ok(!g.state.last.sown.includes(13), 'the other store is skipped');
assert.equal(g.state.pits[13], 0);
assert.equal(g.state.pits.reduce((a, b) => a + b), 20, 'no seeds lost');
assert.equal(g.state.last.sown.at(-1), 6);
assert.equal(g.state.pits[5], 1, 'the emptied pit gets a seed on the way round');
// Captures: the last seed in your own empty pit takes the pit across.
g = play('mancala');
g.state.pits = [1, 0, 3, 3, 3, 3, 0, 3, 3, 3, 3, 5, 3, 0];
g.move('p1', { pit: 0 });
assert.deepEqual(g.state.last.capture, [1, 11]);
assert.equal(g.state.pits[6], 6);
assert.equal(g.state.pits[1] + g.state.pits[11], 0);
assert.equal(g.state.turn, 'p2');
// No capture when the pit across is empty.
g = play('mancala');
g.state.pits = [1, 0, 3, 3, 3, 3, 0, 3, 3, 3, 3, 0, 3, 0];
g.move('p1', { pit: 0 });
assert.equal(g.state.last.capture, null);
assert.equal(g.state.pits[1], 1);
// The second player captures too.
g = play('mancala');
g.state.pits = [3, 3, 3, 3, 3, 3, 0, 2, 3, 0, 3, 3, 3, 0];
g.state.turn = 'p2';
g.move('p2', { pit: 0 });
assert.deepEqual(g.state.last.capture, [9, 3]);
assert.equal(g.state.pits[13], 4);
check.ok('mancala: long sows skip the other store, captures on both sides');

// The end: a side runs out and each side keeps its leftovers.
g = play('mancala');
g.state.pits = [0, 0, 0, 0, 0, 1, 20, 1, 2, 0, 0, 0, 0, 24];
g.move('p1', { pit: 5 });
assert.deepEqual(g.state.pits, [0, 0, 0, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 27]);
assert.deepEqual(g.state.result.winners, ['p2']);
assert.equal(g.state.result.text, 'P2 wins, 27 to 21');
assert.deepEqual(g.state.last.sweep, [7, 8]);
g = play('mancala');
g.state.pits = [0, 0, 0, 0, 0, 1, 23, 1, 0, 0, 0, 0, 0, 23];
g.move('p1', { pit: 5 });
assert.deepEqual(g.state.result.winners, []);
assert.equal(g.state.result.text, 'A draw, 24 each');
check.ok('mancala: the end sweeps leftovers to their owners; the fuller store wins');

// Nothing here is secret: everyone sees the same board, and the state is plain data.
for (const id of ['checkers', 'chess', 'reversi', 'gomoku', 'mancala']) {
  g = play(id);
  assert.deepEqual(g.view('p1'), g.view('p2'));
  assert.deepEqual(g.view('watcher'), g.view('p1'));
  assert.ok(JSON.stringify(g.view('p1')).length < 1200, `${id}: small view`);
}
check.ok('board games: everyone sees the same small view');

console.log(`\n${check.count} board game checks passed\n`);
