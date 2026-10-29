// Fastest Finger, Yahtzee, Pig, Blackjack, Crazy Eights, and Minesweeper.
import assert from 'node:assert/strict';
import { play } from './harness.js';
import { checker } from '../helpers.js';
import { points, choices, totals } from '../../games/yacht.js';
import { total } from '../../games/blackjack.js';

const check = checker();
// A repeating list of rolls, as rng values that land on those die faces.
const dice = (...faces) => { let i = 0; return () => (faces[i++ % faces.length] - 1) / 6 + 0.01; };

// ---------- Fastest Finger ----------
let g = play('reflex', 3, { rounds: 3 });
assert.equal(g.state.phase, 'wait');
assert.ok(g.timer.ms >= 1500 && g.timer.ms <= 5000, 'the wait is 1.5 to 5 seconds');
assert.equal(g.state.deadline, null, 'no countdown gives the wait away');
assert.ok(!JSON.stringify(g.view('p2')).includes(String(g.timer.ms)), 'pages never learn the wait');
g.move('p3', { early: true });
assert.equal(g.state.taps.p3, 'early');
assert.match(g.refused('p3', { tap: 200 }), /early/i);
g.fire();
assert.equal(g.state.phase, 'go');
assert.equal(g.timer.ms, 3000);
assert.ok(g.state.deadline);
g.move('p1', { tap: 412.7 });
g.refused('p1', { tap: 300 });
g.refused('p2', { tap: 'fast' });
g.move('p2', { tap: 250 });
assert.equal(g.state.phase, 'results', 'the round ends once everyone still in has tapped');
assert.deepEqual(g.state.last.winners, ['p2']);
assert.equal(g.state.last.taps.p1, 413);
assert.equal(g.state.wins.p2, 1);
g.refused('p1', { tap: 200 });
assert.equal(g.timer.ms, 2500);
g.fire();
assert.equal(g.state.round, 2);
assert.equal(g.state.phase, 'wait');
g.fire();
g.move('p1', { tap: 40 });
assert.equal(g.state.taps.p1, 'early', 'under 80ms counts as too early');
g.move('p2', { tap: 99999 });
assert.equal(g.state.taps.p2, 3000, 'slow taps are clamped');
assert.equal(g.state.phase, 'go');
g.fire();
assert.equal(g.state.phase, 'results', 'three seconds after green the round ends');
assert.deepEqual(g.state.last.winners, ['p2']);
g.fire(); g.fire();
g.move('p1', { tap: 200 }); g.move('p3', { tap: 200 }); g.move('p2', { tap: 300 });
assert.deepEqual(g.state.last.winners.sort(), ['p1', 'p3'], 'tied fastest taps share the round');
assert.deepEqual(g.state.result.winners, ['p2'], 'most rounds won takes it');
g = play('reflex', 2, { rounds: 3 });
g.move('p1', { early: true });
g.move('p2', { tap: 300 });
assert.equal(g.state.phase, 'results', 'everyone jumping the gun ends the round');
assert.deepEqual(g.state.last.winners, []);
check.ok('fastest finger: hidden wait, early taps, clamping, ties, timers, and the winner');

// ---------- Yahtzee ----------
assert.equal(points('fullHouse', [2, 2, 3, 3, 3]), 25);
assert.equal(points('fullHouse', [3, 3, 3, 3, 3]), 0, 'a Yahtzee is only a full house as a joker');
assert.equal(points('smallStraight', [1, 3, 2, 4, 6]), 30);
assert.equal(points('smallStraight', [1, 2, 3, 5, 6]), 0);
assert.equal(points('largeStraight', [2, 3, 4, 5, 6]), 40);
assert.equal(points('fourKind', [4, 4, 4, 4, 1]), 17);
assert.equal(points('threeKind', [4, 4, 2, 2, 1]), 0);
assert.equal(points('sixes', [6, 6, 1, 6, 2]), 18);
assert.equal(totals({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }).upperBonus, 35, '63 up top earns 35');
assert.equal(totals({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 12 }).upperBonus, 0);
// Joker rules: the matching top box first, then any bottom box at full value.
const card = Object.fromEntries(['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht', 'chance'].map((b) => [b, null]));
card.yacht = 50;
assert.deepEqual(choices(card, [5, 5, 5, 5, 5]), { fives: 25 });
card.fives = 15;
assert.equal(choices(card, [5, 5, 5, 5, 5]).largeStraight, 40);
assert.ok(!('ones' in choices(card, [5, 5, 5, 5, 5])));

g = play('yacht', 2, {}, { rng: dice(6, 6, 6, 2, 3, 6, 6) });
g.refused('p1', { score: 'chance' });
g.refused('p2', { roll: true });
g.refused('p1', { toggle: 0 });
g.move('p1', { roll: true });
assert.deepEqual(g.state.dice, [6, 6, 6, 2, 3]);
g.move('p1', { roll: true, hold: [true, true, true, false, false] });
assert.deepEqual(g.state.dice, [6, 6, 6, 6, 6], 'held dice stay put');
assert.equal(g.view('p2').can.yacht, 50, 'possible scores are shown');
g.move('p1', { roll: true, hold: [true, true, true, true, false] });
g.refused('p1', { roll: true });
g.refused('p1', { score: 'nonsense' });
g.move('p1', { score: 'yacht' });
assert.equal(g.state.cards.p1.yacht, 50);
assert.equal(g.state.turn, 'p2');
g.move('p2', { roll: true });
g.move('p2', { score: 'chance' });
g.refused('p1', { score: 'yacht' });
// A second Yahtzee earns the 100 bonus and plays as a joker.
g.state.rolls = 1; g.state.dice = [3, 3, 3, 3, 3];
g.refused('p1', { score: 'chance' });
g.move('p1', { score: 'threes' });
assert.equal(g.state.bonus.p1, 100);
assert.equal(g.view('p1').totals.p1.total, 50 + 15 + 100);
g.refused('p2', { score: 'chance' });
// Fill the rest of both cards to finish.
for (let t = 0; t < 2 * 11 + 1; t++) {
  const by = g.state.turn;
  g.move(by, { roll: true });
  const open = Object.keys(g.view(by).can);
  g.move(by, { score: open[0] });
}
assert.ok(g.state.result, 'thirteen turns each ends the game');
const final = g.view('p1').totals;
assert.deepEqual(g.state.result.winners, final.p1.total >= final.p2.total ? (final.p1.total === final.p2.total ? ['p1', 'p2'] : ['p1']) : ['p2']);
g = play('yacht', 1);
for (let t = 0; t < 13; t++) { g.move('p1', { roll: true }); g.move('p1', { score: Object.keys(g.view('p1').can)[0] }); }
assert.deepEqual(g.state.result.winners, ['p1'], 'solo games end with a score');
check.ok('yahtzee: scoring boxes, holds, three rolls, joker and bonus, thirteen turns');

// ---------- Pig ----------
g = play('pig', 2, { target: 50 }, { rng: dice(4, 5, 1, 6, 6) });
g.refused('p1', { hold: true });
g.refused('p2', { roll: true });
g.move('p1', { roll: true }); g.move('p1', { roll: true });
assert.equal(g.state.total, 9);
assert.deepEqual(g.state.rolls, [4, 5]);
g.move('p1', { hold: true });
assert.equal(g.state.scores.p1, 9);
assert.equal(g.state.turn, 'p2');
g.move('p2', { roll: true });
assert.equal(g.state.total, 0, 'a 1 loses the turn total');
assert.equal(g.state.scores.p2, 0);
assert.equal(g.state.turn, 'p1', 'and passes the die');
assert.equal(g.state.last.lost, 0);
g.state.scores.p1 = 40;
g.move('p1', { roll: true }); g.move('p1', { roll: true });
assert.equal(g.state.result, null, 'you only win when you hold');
g.move('p1', { hold: true });
assert.deepEqual(g.state.result.winners, ['p1']);
check.ok('pig: rolling, busting on 1, holding, and winning at the target');

// ---------- Blackjack ----------
assert.deepEqual(total(['AS', 'KH']), { t: 21, soft: true });
assert.deepEqual(total(['AS', 'AH', '9D']), { t: 21, soft: true });
assert.deepEqual(total(['AS', '6H', '9D']), { t: 16, soft: false });
g = play('blackjack', 3, { hands: 2 });
assert.equal(g.state.phase, 'bet');
assert.equal(g.timer.ms, 20000);
assert.ok(!('shoe' in g.view('p1')), 'the shoe stays on the server');
g.refused('p1', { bet: 7 });
g.refused('p1', { bet: 500 });
g.move('p1', { bet: 25 });
g.refused('p1', { bet: 10 });
g.move('p2', { bet: 10 });
g.fire();
assert.equal(g.state.phase === 'play' || g.state.phase === 'done' || g.state.phase === 'over', true);
assert.equal(g.state.seats.p3.bet, 5, 'no bet in time means the minimum');
// Stack the deal: p1 16, p2 20, p3 blackjack, dealer 10 and a hidden 7.
function rig(gg, seats, dealer, rest = []) {
  const s = gg.state;
  for (const [id, cards] of Object.entries(seats)) { s.chips[id] += s.seats[id].bet; }
  s.phase = 'bet';
  s.bets = Object.fromEntries(Object.keys(seats).map((id) => [id, s.seats[id].bet]));
  // The shoe deals from the end: two rounds of each seat then the dealer, then hits.
  const order = [];
  for (let r = 0; r < 2; r++) { for (const id of Object.keys(seats)) order.push(seats[id][r]); order.push(dealer[r]); }
  s.shoe = [...Array(30).fill('2C'), ...[...rest].reverse(), ...order.reverse()];
  const last = Object.keys(seats).at(-1);
  const b = s.bets[last];
  s.bets[last] = null;
  gg.move(last, { bet: b });
}
rig(g, { p1: ['10S', '6H'], p2: ['KD', 'QC'], p3: ['AS', 'JH'] }, ['10C', '7D'], ['9S']);
assert.equal(g.state.phase, 'play');
const v = g.view('p2');
assert.equal(v.dealer[1], null, 'the hole card is hidden');
assert.ok(!JSON.stringify(v).includes('7D'), 'the hole card never reaches pages');
assert.equal(v.dealerTotal.t, 10);
assert.equal(g.state.turn, 'p1', 'players act in seat order; a blackjack doesn’t act');
g.refused('p2', { stand: true });
g.move('p1', { hit: true });
assert.equal(g.state.seats.p1.outcome, null);
assert.equal(g.state.turn, 'p2', 'busting ends your turn');
g.refused('p2', { split: true });
assert.equal(g.timer.ms, 30000);
g.fire();
assert.equal(g.state.phase, 'done', 'thirty seconds then an automatic stand');
assert.equal(g.view('p1').dealer[1], '7D', 'the dealer reveals');
assert.equal(g.state.seats.p1.outcome, 'bust');
assert.equal(g.state.seats.p2.outcome, 'win');
assert.equal(g.state.seats.p3.outcome, 'blackjack');
assert.equal(g.state.chips.p1, 75);
assert.equal(g.state.chips.p2, 110);
assert.equal(g.state.chips.p3, 107, 'blackjack pays 3 to 2, rounded down');
g.move('p1', { next: true }); g.move('p2', { next: true }); g.move('p3', { next: true });
assert.equal(g.state.phase, 'bet', 'everyone tapping Next deals sooner');
assert.equal(g.state.hand, 2);
g.move('p1', { bet: 10 }); g.move('p2', { bet: 10 }); g.move('p3', { bet: 10 });
rig(g, { p1: ['5S', '6H'], p2: ['9D', '7C'], p3: ['10S', '9H'] }, ['6C', '10D'], ['10H', '5C']);
g.move('p1', { double: true });
assert.equal(g.state.seats.p1.bet, 20);
assert.equal(g.state.seats.p1.cards.length, 3);
assert.equal(g.state.turn, 'p2', 'double down takes one card and stands');
g.refused('p2', { double: false });
g.move('p2', { stand: true });
g.refused('p3', { dbl: true });
g.move('p3', { stand: true });
// Dealer 16 draws the 5C to 21.
assert.deepEqual(g.state.dealer, ['6C', '10D', '5C'], 'the dealer hits to 17');
assert.equal(g.state.seats.p1.outcome, 'push');
assert.equal(g.state.chips.p1, 75);
assert.ok(g.state.result, 'the last hand ends the game');
assert.deepEqual(g.state.result.winners, ['p2']);
// The dealer stands on soft 17.
g = play('blackjack', 1, { hands: 5 });
g.move('p1', { bet: 5 });
rig(g, { p1: ['10S', '8H'] }, ['AC', '6D']);
g.move('p1', { stand: true });
assert.equal(g.state.dealer.length, 2, 'soft 17 stands');
assert.equal(g.state.seats.p1.outcome, 'win');
// Out of chips: sit out, and with nobody left the game ends.
g = play('blackjack', 2, { hands: 12 });
g.move('p1', { bet: 5 }); g.move('p2', { bet: 5 });
while (g.state.phase === 'play') g.move(g.state.turn, { stand: true });
assert.equal(g.state.phase, 'done');
g.state.chips.p2 = 3;
g.fire();
assert.equal(g.state.phase, 'bet');
assert.match(g.refused('p2', { bet: 5 }), /sitting/, 'a player without chips sits out');
g.move('p1', { bet: 5 });
assert.ok(!g.state.seats.p2);
g.state.chips.p1 = 0;
while (g.state.phase === 'play') g.move(g.state.turn, { stand: true });
if (g.state.phase === 'done') { g.state.chips.p1 = 0; g.fire(); }
assert.ok(g.state.result, 'with nobody able to bet, the game ends');
check.ok('blackjack: bets, hidden hole card, order, timers, dealer rules, payouts');

// ---------- Crazy Eights ----------
g = play('crazy8', 3);
assert.equal(g.state.hands.p1.length, 7);
assert.notEqual(g.state.discard[0].slice(0, -1), '8', 'an eight never starts the pile');
assert.equal(play('crazy8', 5).state.hands.p5.length, 5, 'five each with five or more players');
const v2 = g.view('p2');
for (const c of g.state.hands.p1) assert.ok(!JSON.stringify(v2).includes(`"${c}"`), 'other hands stay secret');
assert.equal(v2.hands, null);
assert.deepEqual(v2.hand, g.state.hands.p2);
assert.equal(v2.counts.p1, 7);
assert.ok(!('draw' in v2) && v2.drawLeft === 52 - 21 - 1);
g.state.hands.p1 = ['8S', '3H', 'KD'];
g.state.discard = ['5D']; g.state.suit = 'D';
g.refused('p2', { draw: true });
g.refused('p1', { play: 1 });
g.refused('p1', { play: '9C' });
g.refused('p1', { play: 0 });
g.move('p1', { play: '8S', suit: 'H' });
assert.equal(g.state.suit, 'H', 'an eight names the suit');
assert.equal(g.state.turn, 'p2');
g.state.hands.p2 = ['2C', '4C'];
g.refused('p2', { pass: true });
g.state.draw.push('7S');
g.move('p2', { draw: true });
assert.equal(g.view('p2').drew, '7S');
assert.equal(g.view('p1').drew, null, 'what you drew stays secret');
g.refused('p2', { draw: true });
g.refused('p2', { play: '7S' });
g.move('p2', { pass: true });
assert.equal(g.state.turn, 'p3');
g.state.hands.p3 = ['3H', 'JD'];
g.state.draw.push('9H');
g.move('p3', { draw: true });
g.refused('p3', { play: '3H' });
g.move('p3', { play: '9H' });
assert.deepEqual(g.view('p1').playable, [true, false]);
g.move('p1', { play: 0 });
g.state.hands.p2 = ['3C'];
g.move('p2', { play: 0 });
assert.deepEqual(g.state.result.winners, ['p2']);
// The discards become the new draw pile.
g = play('crazy8', 2);
g.state.discard = ['2C', '3C', '4C'];
g.state.draw = [];
g.move('p1', { draw: true });
assert.deepEqual(g.state.discard, ['4C'], 'the top card stays');
assert.equal(g.state.draw.length, 1);
assert.ok(['2C', '3C'].includes(g.state.drew));
// Nobody can draw or play: everyone passes and fewest cards wins.
g = play('crazy8', 2);
g.state.draw = []; g.state.discard = ['5D'];
g.state.hands.p1 = ['2C']; g.state.hands.p2 = ['3C', '4C'];
g.move('p1', { pass: true }); g.move('p2', { pass: true });
assert.deepEqual(g.state.result.winners, ['p1']);
check.ok('crazy eights: dealing, matching, eights, drawing, passing, reshuffles, secrets');

// ---------- Minesweeper ----------
g = play('minesweeper', 2, { size: 'small' });
assert.equal(g.state.cells.length, 81);
g.move('p2', { flag: 0 });
assert.equal(g.state.flags[0], 'p2');
g.refused('p1', { open: 0 });
g.move('p1', { flag: 0 });
assert.equal(g.state.flags[0], undefined, 'flags toggle');
g.move('p1', { open: 40 });
assert.equal(g.state.mines.length, 10);
for (const i of [40, 30, 31, 32, 39, 41, 48, 49, 50]) assert.ok(!g.state.mines.includes(i), 'the first open and its neighbors are clear');
assert.equal(g.state.cells[40], 0, 'so the first open is a zero');
assert.ok(g.state.opened > 9, 'zeros flood open');
let mv = g.view('p1');
assert.equal(mv.mines, null);
for (const m of g.state.mines) assert.equal(mv.cells[m], null, 'mines never show as open');
g.refused('p1', { open: 81 });
g.refused('p1', { open: 'x' });
// Chord: flag the right mines around a number, then open the rest.
const ms = new Set(g.state.mines);
const W = 9;
const nb = (i) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [i % W + dx, Math.floor(i / W) + dy])).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < W).map(([x, y]) => y * W + x).filter((j) => j !== i);
const num = g.state.cells.findIndex((c, i) => c > 0 && nb(i).some((j) => g.state.cells[j] == null && !ms.has(j)));
if (num >= 0) {
  assert.match(g.refused('p1', { open: num }), /Flag/);
  for (const j of nb(num)) if (ms.has(j) && !g.state.flags[j]) g.move('p2', { flag: j });
  g.move('p1', { open: num });
  for (const j of nb(num)) if (!ms.has(j)) assert.notEqual(g.state.cells[j], null, 'chording opens the neighbors');
}
// Open every safe square to win.
for (let i = 0; i < 81; i++) if (!ms.has(i) && g.state.cells[i] == null && !g.state.result) { delete g.state.flags[i]; g.move('p1', { open: i }); }
assert.deepEqual(g.state.result.winners, ['p1', 'p2']);
assert.deepEqual(g.view('p1').mines, g.state.mines, 'mines show at the end');
g = play('minesweeper', 1, { size: 'large' });
g.move('p1', { open: 0 });
assert.equal(g.state.mines.length, 40);
const mine = g.state.mines[0];
assert.ok(!JSON.stringify(g.view('p1')).includes('"mines":['), 'mine positions stay secret');
g.join({ id: 'p9', name: 'P9', color: 'iris' });
g.move('p9', { open: mine });
assert.deepEqual(g.state.result.winners, [], 'a mine ends it for everyone');
assert.equal(g.state.hit, mine);
assert.equal(g.view('p1').mines.length, 40);
g = play('minesweeper', 1);
assert.equal(g.state.w, 12);
assert.equal(g.state.count, 24);
check.ok('minesweeper: safe first open, flood, flags, chording, win, loss, secrets');

console.log(`\n${check.count} chance game checks passed\n`);
