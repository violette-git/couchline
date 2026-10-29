// Battleship, Dots and Boxes, Memory, Snakes and Ladders, Mastermind, and Sudoku.
import assert from 'node:assert/strict';
import { play } from './harness.js';
import { checker } from '../helpers.js';
import { lineCount, sides } from '../../games/dots.js';
import { LADDERS, SNAKES } from '../../games/snakes.js';
import { score } from '../../games/codebreaker.js';
import { countSolutions } from '../../games/sudoku.js';

const check = checker();
// A repeatable rng, so runs are the same every time.
const seeded = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const json = (v) => JSON.stringify(v);

// ---------- Battleship ----------
let g = play('battleship', 2, {}, { rng: seeded(1) });
for (const id of ['p1', 'p2']) {
  const cells = g.state.fleets[id].flatMap((sh) => sh.cells);
  assert.equal(cells.length, 17, 'five ships: 5, 4, 3, 3, 2');
  assert.equal(new Set(cells).size, 17, 'ships never overlap');
  for (const sh of g.state.fleets[id]) {
    const d = sh.cells[1] - sh.cells[0];
    assert.ok(d === 1 || d === 10, 'ships are straight');
    if (d === 1) assert.equal(Math.floor(sh.cells[0] / 10), Math.floor(sh.cells.at(-1) / 10), 'no wrapping across rows');
  }
}
const fleetOf = (id) => g.state.fleets[id].flatMap((sh) => sh.cells);
const water = (id) => [...Array(100).keys()].filter((i) => !fleetOf(id).includes(i));
// p2's view holds p2's own fleet, but none of p1's unsunk ships.
let v2 = g.view('p2');
assert.equal(v2.boards.find((b) => b.id === 'p2').ships.length, 5);
assert.equal(v2.boards.find((b) => b.id === 'p1').ships.length, 0, 'the other fleet is hidden');
assert.ok(!json(v2).includes(json(g.state.fleets.p1[0].cells)), 'no trace of the hidden fleet');
const watcher = g.view('someone');
assert.ok(watcher.boards.every((b) => b.ships.length === 0), 'watchers see no unsunk ships');
assert.ok(!json(g.view('p1')).includes(json(g.state.fleets.p2[2].cells)));
// Shuffling before the first shot.
const before = json(g.state.fleets.p2);
g.move('p2', { shuffle: true });
assert.notEqual(json(g.state.fleets.p2), before, 'a shuffle moves the fleet');
g.refused('p2', { at: 0 });
g.refused('p1', { at: 100 });
g.refused('p1', { at: 'a' });
g.refused('p1', {});
// A miss passes the turn; a hit fires again.
g.move('p1', { at: water('p2')[0] });
assert.equal(g.state.turn, 'p2');
assert.match(g.refused('p2', { shuffle: true }), /started/, 'no shuffling once the shooting starts');
g.move('p2', { at: water('p1')[0] });
g.refused('p1', { at: water('p2')[0] });
const target = g.state.fleets.p2.find((sh) => sh.size === 2);
g.move('p1', { at: target.cells[0] });
assert.equal(g.state.turn, 'p1', 'a hit fires again');
assert.equal(g.view('p1').boards.find((b) => b.id === 'p2').ships.length, 0, 'a hit ship is still hidden');
g.move('p1', { at: target.cells[1] });
assert.equal(g.state.last.sunk, 'Destroyer');
assert.ok(g.said.some((t) => /sank/.test(t)), 'sinking is announced');
const seen = g.view('p1').boards.find((b) => b.id === 'p2').ships;
assert.deepEqual(seen.map((sh) => sh.name), ['Destroyer'], 'a sunk ship shows');
assert.equal(g.view('someone').boards.find((b) => b.id === 'p2').ships.length, 1, 'watchers see sunk ships');
for (const i of fleetOf('p2')) if (!g.state.shots.p2[i]) g.move('p1', { at: i });
assert.deepEqual(g.state.result.winners, ['p1']);
assert.equal(g.view('p1').boards.find((b) => b.id === 'p2').ships.length, 5);
assert.equal(g.view('someone').boards.find((b) => b.id === 'p1').ships.length, 5, 'every fleet shows at the end');
check.ok('battleship: fleets, shuffles, hits fire again, sinking, winning');
check.ok('battleship: unsunk ships never reach the other player or watchers');

// ---------- Dots and Boxes ----------
g = play('dots', 2, { size: 3 });
assert.equal(g.state.lines.length, lineCount(3));
assert.equal(lineCount(3), 24);
g.refused('p2', { line: 0 });
g.refused('p1', { line: 24 });
g.refused('p1', { line: -1 });
g.refused('p1', { line: '1' });
const box0 = sides(3, 0, 0);
assert.deepEqual(box0, [0, 3, 12, 13]);
g.move('p1', { line: box0[0] });
assert.equal(g.state.turn, 'p2', 'no box, next player');
g.refused('p2', { line: box0[0] });
g.move('p2', { line: box0[1] });
g.move('p1', { line: box0[2] });
g.move('p2', { line: box0[3] });
assert.equal(g.state.boxes[0], 'p2', 'closing a box claims it');
assert.equal(g.state.scores.p2, 1);
assert.equal(g.state.turn, 'p2', 'and the same player goes again');
// One line can close two boxes at once.
g = play('dots', 2, { size: 3 });
for (const l of [0, 3, 12, 1, 4, 14]) g.move(g.state.turn, { line: l });
const who = g.state.turn;
g.move(who, { line: 13 });
assert.equal(g.state.scores[who], 2, 'a shared side closes both boxes');
// Play to the end, always taking the first open line.
for (const n of [3, 4]) {
  g = play('dots', 3, { size: n });
  while (!g.state.result) g.move(g.state.turn, { line: g.state.lines.indexOf(null) });
  const total = Object.values(g.state.scores).reduce((a, b) => a + b, 0);
  assert.equal(total, n * n, 'every box is taken');
  const best = Math.max(...Object.values(g.state.scores));
  assert.deepEqual(g.state.result.winners, Object.keys(g.state.scores).filter((id) => g.state.scores[id] === best));
  assert.equal(g.state.turn, null);
}
// The last box decides it; a tie shares the win.
const endgame = (scores) => {
  g = play('dots', 2, { size: 3 });
  g.state.lines = g.state.lines.map((_, i) => (i ? 'p2' : null));
  g.state.boxes = ['p1', 'p1', 'p1', 'p1', 'p2', 'p2', 'p2', 'p2', 'p2'].map((x, i) => (i ? x : null));
  g.state.scores = scores;
  g.state.turn = 'p1';
  g.move('p1', { line: 0 });
  return g.state.result.winners.sort();
};
assert.deepEqual(endgame({ p1: 3, p2: 5 }), ['p2']);
assert.deepEqual(endgame({ p1: 4, p2: 5 }), ['p1', 'p2'], 'ties share the win');
check.ok('dots and boxes: lines, claiming boxes, going again, double boxes, ties');

// ---------- Memory ----------
g = play('memory', 2, { pairs: 8 }, { rng: seeded(7) });
assert.equal(g.state.deck.length, 16);
const deck = g.state.deck;
const pairOf = (i) => deck.findIndex((f, j) => j !== i && f === deck[i]);
const missOf = (i) => deck.findIndex((f, j) => j !== i && f !== deck[i] && !g.state.taken[j]);
let v = g.view('p2');
assert.ok(v.cards.every((c) => c === null), 'face-down cards have no faces');
assert.ok(!('deck' in v));
for (const f of new Set(deck)) assert.ok(!json(v).includes(f), 'no face leaks while all are down');
g.refused('p2', { card: 0 });
g.refused('p1', { card: 16 });
g.refused('p1', { card: 1.5 });
g.move('p1', { card: 0 });
g.refused('p1', { card: 0 });
v = g.view('p2');
assert.equal(v.cards[0], deck[0], 'an up card shows to everyone');
assert.equal(v.cards.filter(Boolean).length, 1);
// A miss: both stay up, nobody can flip, then they go down and the turn passes.
g.move('p1', { card: missOf(0) });
assert.equal(g.state.busy, true);
assert.equal(g.view('p2').cards.filter(Boolean).length, 2);
g.refused('p1', { card: pairOf(0) });
g.refused('p2', { card: pairOf(0) });
assert.ok(g.timer && g.timer.ms >= 1000 && g.timer.ms <= 1500, 'about 1.2 seconds to look');
g.fire();
assert.equal(g.state.turn, 'p2');
assert.ok(g.view('p1').cards.every((c) => c === null), 'they flip back');
// A match stays up and the matcher goes again.
g.move('p2', { card: 0 });
g.move('p2', { card: pairOf(0) });
assert.equal(g.state.scores.p2, 1);
assert.equal(g.state.turn, 'p2');
assert.equal(g.view('p1').cards[0], deck[0]);
const hidden = deck.filter((_, i) => !g.state.taken[i]);
for (const f of new Set(hidden)) if (f !== deck[0]) assert.ok(!json(g.view('p1')).includes(f), 'matched faces only');
// Play the rest perfectly: p2 takes every pair.
for (let i = 0; i < deck.length; i++) {
  if (g.state.taken[i]) continue;
  g.move('p2', { card: i });
  g.move('p2', { card: pairOf(i) });
}
assert.deepEqual(g.state.result.winners, ['p2']);
assert.equal(g.state.scores.p2, 8);
// Solo: the result says how many moves it took.
g = play('memory', 1, { pairs: 8 }, { rng: seeded(3) });
const d1 = g.state.deck;
g.move('p1', { card: 0 });
g.move('p1', { card: d1.findIndex((f, j) => j && f !== d1[0]) });
g.fire();
assert.equal(g.state.turn, 'p1', 'solo keeps the turn');
for (let i = 0; i < d1.length; i++) {
  if (g.state.taken[i]) continue;
  g.move('p1', { card: i });
  g.move('p1', { card: d1.findIndex((f, j) => j !== i && f === d1[i]) });
}
assert.match(g.state.result.text, /8 pairs in 9 moves/);
// A tie on pairs shares the win.
g = play('memory', 2, { pairs: 8 }, { rng: seeded(9) });
const d2 = g.state.deck;
g.state.scores = { p1: 4, p2: 3 };
d2.forEach((f, i) => { g.state.taken[i] = 'p1'; });
const last = d2.findIndex((f) => f === d2[0]);
const lastPair = d2.findIndex((f, j) => j !== last && f === d2[last]);
g.state.taken[last] = g.state.taken[lastPair] = null;
g.state.turn = 'p2';
g.move('p2', { card: last });
g.move('p2', { card: lastPair });
assert.deepEqual(g.state.result.winners.sort(), ['p1', 'p2']);
check.ok('memory: flips, misses flip back on a timer, matches go again, solo moves, ties');
check.ok('memory: faces of face-down cards never reach anyone');

// ---------- Snakes and Ladders ----------
// A die that rolls what we tell it to.
let rolls = [];
const loaded = () => ((rolls.shift() ?? 1) - 1) / 6 + 0.01;
g = play('snakes', 3, {}, { rng: loaded });
assert.deepEqual(g.state.pos, { p1: 0, p2: 0, p3: 0 });
g.refused('p2', { roll: true });
g.refused('p1', {});
rolls = [3];
g.move('p1', { roll: true });
assert.equal(g.state.pos.p1, LADDERS[3], 'a ladder climbs');
assert.equal(g.state.last.via, 'ladder');
assert.equal(g.state.turn, 'p2');
rolls = [6, 2];
g.move('p2', { roll: true });
assert.equal(g.state.turn, 'p2', 'a 6 rolls again');
assert.equal(g.state.last.again, true);
g.move('p2', { roll: true });
assert.equal(g.state.pos.p2, LADDERS[8], '6 then 2 lands on 8 and climbs');
assert.equal(g.state.turn, 'p3');
g.state.pos.p3 = 12;
rolls = [4];
g.move('p3', { roll: true });
assert.equal(g.state.pos.p3, SNAKES[16], 'a snake slides');
assert.equal(g.state.last.via, 'snake');
// Overshooting 100 stays put; landing on it exactly wins.
g.state.pos.p1 = 97;
rolls = [5];
g.move('p1', { roll: true });
assert.equal(g.state.pos.p1, 97);
assert.equal(g.state.last.over, true);
g.state.turn = 'p1';
rolls = [3];
g.move('p1', { roll: true });
assert.equal(g.state.pos.p1, 100);
assert.deepEqual(g.state.result.winners, ['p1']);
for (const [a, b] of Object.entries(LADDERS)) assert.ok(+b > +a && !SNAKES[a] && !SNAKES[b]);
for (const [a, b] of Object.entries(SNAKES)) assert.ok(+b < +a && !LADDERS[b]);
assert.equal(Object.keys(LADDERS).length, 8);
assert.equal(Object.keys(SNAKES).length, 8);
// Random games always end with someone on 100.
for (let k = 0; k < 20; k++) {
  g = play('snakes', 2, {}, { rng: seeded(k + 11) });
  for (let n = 0; n < 5000 && !g.state.result; n++) g.move(g.state.turn, { roll: true });
  assert.ok(g.state.result && g.state.pos[g.state.result.winners[0]] === 100);
}
check.ok('snakes and ladders: rolls, ladders, snakes, sixes, exact finish');

// ---------- Mastermind ----------
assert.deepEqual(score([0, 1, 2, 3], [0, 1, 2, 3]), { black: 4, white: 0 });
assert.deepEqual(score([0, 1, 2, 3], [3, 2, 1, 0]), { black: 0, white: 4 });
assert.deepEqual(score([0, 0, 1, 1], [0, 1, 0, 2]), { black: 1, white: 2 });
assert.deepEqual(score([0, 0, 0, 1], [0, 0, 0, 0]), { black: 3, white: 0 }, 'repeats are not double counted');
assert.deepEqual(score([5, 4, 3, 2, 1], [1, 1, 1, 1, 1]), { black: 1, white: 0 });
g = play('codebreaker', 2, { length: 4 }, { rng: seeded(5) });
const code = g.state.code;
assert.equal(code.length, 4);
assert.ok(code.every((c) => c >= 0 && c < 6));
for (const viewer of ['p1', 'p2', 'someone']) {
  const cv = g.view(viewer);
  assert.equal(cv.code, null, 'the code stays on the server');
  assert.ok(!json(cv).includes(json(code)));
}
g.refused('p1', { guess: [0, 1, 2] });
g.refused('p1', { guess: [0, 1, 2, 6] });
g.refused('p1', { guess: [0, 1, 2, '3'] });
g.refused('p1', { guess: 'red' });
const wrong = code.map((c) => (c + 1) % 6);
g.move('p2', { guess: wrong });
assert.equal(g.state.guesses[0].by, 'p2', 'guesses show who made them');
assert.equal(g.state.guesses[0].black, 0);
g.refused('p1', { guess: wrong });
assert.equal(g.view('p1').code, null);
g.move('p1', { guess: code });
assert.deepEqual(g.state.result.winners, ['p1', 'p2'], 'everyone wins together');
assert.deepEqual(g.view('someone').code, code, 'the code shows at the end');
g = play('codebreaker', 1, { length: 5 }, { rng: seeded(6) });
assert.equal(g.state.code.length, 5);
g.join({ id: 'p9', name: 'Late', color: 'iris' });
for (let k = 0; k < 10; k++) {
  const guess = [k % 6, Math.floor(k / 6), 0, 0, 0];
  if (json(guess) === json(g.state.code)) guess[4] = 1;
  g.move(k % 2 ? 'p9' : 'p1', { guess });
}
assert.equal(g.state.guesses.length, 10);
assert.deepEqual(g.state.result.winners, [], 'ten misses lose');
check.ok('mastermind: feedback, shared guesses, late joiners, winning and losing');
check.ok('mastermind: the code never leaves the server before the end');

// ---------- Sudoku ----------
for (const [level, givens] of [['easy', 40], ['medium', 32], ['hard', 26]]) {
  const t = performance.now();
  g = play('sudoku', 2, { level });
  assert.ok(performance.now() - t < 200, 'a puzzle is quick to make');
  const n = g.state.givens.filter(Boolean).length;
  assert.ok(n >= givens && n <= givens + 3, `${level} has about ${givens} givens (got ${n})`);
  assert.equal(countSolutions(g.state.givens), 1, 'exactly one solution');
  g.state.givens.forEach((d, i) => { if (d) assert.equal(d, g.state.solution[i]); });
}
const sol = g.state.solution;
const open = g.state.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
for (const viewer of ['p1', 'someone']) {
  const sv = g.view(viewer);
  assert.ok(!('solution' in sv));
  assert.ok(!json(sv).includes(sol.join(',')), 'the solution never leaves the server');
}
const given = g.state.givens.findIndex(Boolean);
g.refused('p1', { cell: given, digit: 1 });
g.refused('p1', { cell: 81, digit: 1 });
g.refused('p1', { cell: open[0], digit: 10 });
g.refused('p1', { cell: open[0], digit: '5' });
const bad = (sol[open[0]] % 9) + 1;
g.move('p1', { cell: open[0], digit: bad });
let e = g.view('p2').entries[open[0]];
assert.deepEqual(e, { d: bad, by: 'p1', wrong: true }, 'a wrong number is marked');
g.move('p2', { cell: open[0], digit: sol[open[0]] });
e = g.view('p1').entries[open[0]];
assert.deepEqual(e, { d: sol[open[0]], by: 'p2' }, 'a right one is not, and shows who placed it');
g.move('p2', { cell: open[0], digit: 0 });
assert.equal(g.state.entries[open[0]], null, '0 clears');
g.join({ id: 'p3', name: 'Late', color: 'mint' });
for (const [k, i] of open.entries()) g.move(['p1', 'p2', 'p3'][k % 3], { cell: i, digit: sol[i] });
assert.deepEqual(g.state.result.winners, ['p1', 'p2', 'p3'], 'solved together, late joiner included');
check.ok('sudoku: unique puzzles by level, givens locked, wrong marks, clearing, solving');
check.ok('sudoku: the solution never leaves the server');

console.log(`\n${check.count} tabletop game checks passed\n`);
