// Wordle, Word Scramble, Pictionary, Trivia, Emoji Movies, and Would You Rather.
import assert from 'node:assert/strict';
import { play } from './harness.js';
import { checker } from '../helpers.js';
import { colors, LAST_CALL } from '../../games/wordrace.js';
import { ANSWERS, ALLOWED } from '../../games/wordrace-words.js';
import { WORDS as SCRAMBLE_WORDS, scramble } from '../../games/scramble.js';
import { MAX_POINTS } from '../../games/draw.js';
import { WORDS as DRAW_WORDS } from '../../games/draw-words.js';
import { QUESTIONS } from '../../games/trivia-questions.js';
import { MOVIES } from '../../games/emoji-movies.js';
import { matches, hint } from '../../games/emoji.js';
import { PROMPTS } from '../../games/wyr-prompts.js';

const check = checker();
const has = (v, s) => JSON.stringify(v).toLowerCase().includes(s.toLowerCase());

// ---------- Wordle ----------
assert.ok(ANSWERS.length >= 300 && ALLOWED.size >= 1500, 'enough words');
assert.ok(ANSWERS.every((w) => ALLOWED.has(w) && /^[a-z]{5}$/.test(w)));
assert.deepEqual(colors('paper', 'apple'), ['close', 'close', 'right', 'close', 'wrong']);
assert.deepEqual(colors('geese', 'those'), ['wrong', 'wrong', 'wrong', 'right', 'right'], 'extra copies of a letter go gray');
assert.deepEqual(colors('llama', 'hello'), ['close', 'close', 'wrong', 'wrong', 'wrong'], 'two Ls, two yellows');
assert.deepEqual(colors('label', 'hello'), ['close', 'wrong', 'wrong', 'close', 'close']);
assert.deepEqual(colors('lolly', 'hello'), ['wrong', 'close', 'right', 'right', 'wrong'], 'greens use up the Ls first');
check.ok('wordle: word lists and colors with repeated letters');

let g = play('wordrace', 2);
g.state.answer = 'apple';
assert.equal(g.state.turn, null);
assert.equal(g.refused('p1', { guess: 'aeiou' }), 'Not in the word list.');
g.refused('p1', { guess: 'app' });
g.refused('p1', { guess: 12345 });
g.move('p1', { guess: 'paper' });
g.refused('p1', { guess: 'paper' });
assert.deepEqual(g.view('p1').boards.p1.rows[0], { word: 'paper', colors: ['close', 'close', 'right', 'close', 'wrong'] });
assert.deepEqual(g.view('p2').boards.p1.rows[0], { colors: ['close', 'close', 'right', 'close', 'wrong'] });
for (const who of ['p2', 'watcher']) {
  assert.ok(!has(g.view(who), 'paper'), 'other players’ letters stay hidden');
  assert.ok(!has(g.view(who), 'apple'), 'the answer stays hidden');
}
assert.equal(g.view('p1').answer, null);
g.move('p2', { guess: 'crane' });
g.move('p2', { guess: 'apple' });
assert.equal(g.state.firstSolver, 'p2');
assert.equal(g.timer.ms, LAST_CALL, 'a two minute last call');
assert.ok(g.state.deadline > Date.now());
assert.match(g.refused('p2', { guess: 'lemon' }), /solved/);
g.move('p1', { guess: 'apple' });
assert.deepEqual(g.state.result.winners, ['p2'], 'two guesses beats two guesses when you were first');
assert.match(g.state.result.text, /APPLE/);
assert.equal(g.view('p1').answer, 'apple');
assert.equal(g.view('p1').boards.p2.rows[0].word, 'crane', 'everything shows at the end');
check.ok('wordle: guesses, refusals, hidden letters, ties go to the faster solver');

g = play('wordrace', 3);
g.state.answer = 'apple';
g.move('p3', { guess: 'crane' });
g.move('p3', { guess: 'apple' });
g.move('p1', { guess: 'apple' });
g.join({ id: 'p4', name: 'P4', color: 'mint' });
assert.ok(g.state.boards.p4, 'late joiners get a board');
g.fire();
assert.deepEqual(g.state.result.winners, ['p1'], 'fewest guesses wins when time runs out');
assert.equal(g.state.deadline, null);
g = play('wordrace', 2);
g.state.answer = 'apple';
for (const w of ['crane', 'stone', 'light', 'brush', 'money', 'dozen']) g.move('p1', { guess: w });
assert.ok(g.state.boards.p1.done);
assert.ok(g.timer, 'someone out of guesses starts the clock too');
g.refused('p1', { guess: 'apple' });
for (const w of ['crane', 'stone', 'light', 'brush', 'money', 'dozen']) g.move('p2', { guess: w });
assert.deepEqual(g.state.result.winners, [], 'nobody solves, nobody wins');
assert.match(g.state.result.text, /Nobody/);
check.ok('wordle: last call, late joiners, and nobody solving');

// ---------- Word Scramble ----------
assert.ok(SCRAMBLE_WORDS.length >= 150 && SCRAMBLE_WORDS.every((w) => w.length >= 6 && w.length <= 9));
for (let i = 0; i < 200; i++) {
  const w = SCRAMBLE_WORDS[i % SCRAMBLE_WORDS.length];
  const s = scramble(w, Math.random);
  assert.notEqual(s, w);
  assert.equal([...s].sort().join(''), [...w].sort().join(''));
}
g = play('scramble', 2, { rounds: 5 });
let word = g.state.words[0];
assert.equal(g.state.words.length, 5);
assert.notEqual(g.state.scrambled, word);
for (const who of ['p1', 'p2', 'watcher']) assert.ok(!has(g.view(who), `"${word}"`) && !g.view(who).words, 'the word stays hidden');
g.move('p1', { answer: 'nope' });
assert.deepEqual(g.view('p1').wrong, ['nope']);
assert.deepEqual(g.view('p2').wrong, [], 'wrong guesses are private');
g.move('p2', { answer: word.toUpperCase() });
assert.equal(g.state.scores.p2, 1);
assert.equal(g.view('p1').reveal, word, 'the word shows between rounds');
assert.equal(g.timer.ms, 3000);
g.refused('p1', { answer: word });
g.fire();
assert.equal(g.state.round, 1);
assert.equal(g.timer.ms, 30000);
g.fire();
assert.equal(g.state.phase, 'reveal');
assert.equal(g.state.winner, null, 'time ran out');
g.fire();
g.join({ id: 'p3', name: 'P3', color: 'sky' });
for (let r = 2; r < 5; r++) { g.move('p3', { answer: g.state.words[r] }); g.fire(); }
assert.deepEqual(g.state.result.winners, ['p3']);
check.ok('word scramble: scrambles, private wrong guesses, rounds, timers, late joiners');

// ---------- Pictionary ----------
assert.ok(DRAW_WORDS.length >= 200 && new Set(DRAW_WORDS).size === DRAW_WORDS.length);
g = play('draw', 3, { turns: 1, seconds: 80 });
assert.equal(g.state.artist, 'p1');
assert.equal(g.state.phase, 'choose');
assert.equal(g.view('p1').choices.length, 3);
for (const w of g.state.choices) assert.ok(!has(g.view('p2'), `"${w}"`), 'only the artist sees the choices');
g.refused('p2', { choose: 0 });
g.refused('p1', { choose: 5 });
g.move('p1', { choose: 1 });
word = g.state.word;
assert.equal(g.state.phase, 'draw');
assert.equal(g.view('p1').word, word);
for (const who of ['p2', 'p3', 'watcher']) {
  assert.equal(g.view(who).word, null);
  assert.ok(!has(g.view(who), `"${word}"`), 'the word stays hidden');
}
assert.equal(g.view('p2').mask.filter((c) => c === null).length, word.replace(/[^a-z]/g, '').length, 'blanks, one per letter');
let r = g.move('p1', { stroke: { id: 7, color: 'red', width: 8, points: [[0.12345, 0.5], [2, -1]] } });
assert.equal(r.quiet, true);
assert.deepEqual(r.relay.stroke.points, [[0.123, 0.5], [1, 0]], 'points are clamped and rounded');
g.move('p1', { stroke: { id: 7, color: 'red', width: 8, points: [[0.2, 0.2]] } });
assert.equal(g.state.strokes.length, 1, 'more points on the same stroke');
assert.equal(g.state.strokes[0].points.length, 3);
g.move('p1', { stroke: { id: 8, color: 'erase', width: 40, points: [[0.3, 0.3]] } });
assert.equal(g.view('p2').strokes.length, 2, 'everyone gets the drawing');
g.refused('p1', { stroke: { id: 9, color: 'chartreuse', width: 8, points: [[0, 0]] } });
g.refused('p1', { stroke: { id: 9, color: 'red', width: 7, points: [[0, 0]] } });
g.refused('p1', { stroke: { id: 9, color: 'red', width: 8, points: [['a', 0]] } });
g.refused('p1', { stroke: { id: 9, color: 'red', width: 8, points: [] } });
g.refused('p2', { stroke: { id: 9, color: 'red', width: 8, points: [[0, 0]] } });
g.move('p1', { undo: true });
assert.equal(g.state.strokes.length, 1);
g.move('p1', { clear: true });
assert.equal(g.state.strokes.length, 0);
g.refused('p1', { undo: true });
g.state.points = MAX_POINTS - 1;
g.refused('p1', { stroke: { id: 10, color: 'ink', width: 3, points: [[0, 0], [0.5, 0.5]] } });
g.state.points = 0;
g.move('p2', { guess: 'definitely wrong' });
const close = word.slice(0, -1) + (word.endsWith('z') ? 'y' : 'z');
g.move('p3', { guess: close });
assert.ok(g.view('p2').feed.some((f) => f.text === 'definitely wrong'), 'wrong guesses show to everyone');
assert.ok(g.view('p3').feed.some((f) => f.kind === 'close'), 'close guesses show to the guesser');
assert.ok(!g.view('p2').feed.some((f) => f.kind === 'close'), 'and to nobody else');
g.state.startedAt = Date.now() - 40000;
g.move('p2', { guess: word.toUpperCase() });
assert.ok(g.state.guessed.p2 >= 74 && g.state.guessed.p2 <= 76, 'half the time gone, about 75 points');
assert.equal(g.state.scores.p1, 25, 'the artist scores per correct guesser');
assert.equal(g.view('p2').word, word, 'people who got it see the word');
assert.equal(g.view('p3').word, null);
assert.ok(!has(g.view('p3').feed, word), 'a right guess shows only as “got it”');
g.refused('p2', { guess: 'again' });
g.refused('p1', { guess: word });
g.move('p3', { guess: word });
assert.equal(g.state.phase, 'reveal', 'everyone got it, so the turn ends');
assert.equal(g.view('watcher').word, word);
g.fire();
assert.equal(g.state.artist, 'p2', 'next artist in player order');
check.ok('pictionary: choosing, strokes, undo and clear, guesses, close calls, scoring');

g.fire(); // the choice runs out and a word is picked
assert.equal(g.state.phase, 'draw');
assert.ok(g.state.word);
g.join({ id: 'p4', name: 'P4', color: 'mint' });
assert.deepEqual(g.state.order, ['p1', 'p2', 'p3', 'p4'], 'late joiners take a turn later');
g.fire(); // half time: a letter
assert.equal(g.view('p3').mask.filter((c) => c && /[a-z]/.test(c)).length, 1, 'one letter shows at half time');
g.fire();
g.fire();
assert.equal(g.state.phase, 'reveal');
g.fire();
assert.equal(g.state.artist, 'p3');
for (let t = 0; t < 2; t++) { g.fire(); g.fire(); g.fire(); g.fire(); g.fire(); }
assert.ok(g.state.result, 'everyone has drawn');
assert.equal(g.state.scores.p1, 50);
assert.deepEqual(g.state.result.winners, ['p2', 'p3'], 'p2 and p3 tie on 75');
check.ok('pictionary: auto pick, hints, late joiners, and the end');

// ---------- Trivia ----------
assert.ok(QUESTIONS.length >= 150);
assert.ok(QUESTIONS.every((q) => q.length === 6 && new Set(q.slice(2)).size === 4));
g = play('trivia', 3, { count: 5 });
assert.equal(g.state.qs.length, 5);
let q = g.state.qs[0];
for (const who of ['p1', 'p2', 'watcher']) {
  const v = g.view(who);
  assert.equal(v.answer, null, 'no answer before the reveal');
  assert.ok(!('qs' in v) && !has(v, g.state.qs[1].q), 'later questions stay hidden');
  assert.equal(v.question.choices.length, 4);
}
g.refused('p1', { choice: 4 });
g.refused('p1', { choice: '1' });
g.state.askedAt = Date.now() - 10000;
g.move('p1', { choice: q.answer });
g.refused('p1', { choice: 0 });
assert.equal(g.view('p2').answers.p1, -1, 'other picks stay hidden');
assert.equal(g.view('p1').answers.p1, q.answer);
assert.ok(!has(g.view('p2').gained, 'p1'));
g.move('p2', { choice: (q.answer + 1) % 4 });
g.state.askedAt = Date.now() - 2000;
g.move('p3', { choice: q.answer });
assert.equal(g.state.phase, 'reveal', 'everyone in, so it reveals');
assert.equal(g.view('p2').answer, q.answer);
assert.ok(g.state.scores.p1 >= 740 && g.state.scores.p1 <= 760, 'half the time, about 750');
assert.ok(g.state.scores.p3 > g.state.scores.p1, 'faster scores more');
assert.equal(g.state.scores.p2, 0);
assert.equal(g.timer.ms, 4000);
g.refused('p1', { choice: 0 });
g.fire();
assert.equal(g.state.i, 1);
g.fire();
assert.equal(g.state.phase, 'reveal', 'time ran out');
g.join({ id: 'p4', name: 'P4', color: 'mint' });
g.fire();
for (let i = 2; i < 5; i++) {
  q = g.state.qs[i];
  for (const id of ['p1', 'p2', 'p3', 'p4']) g.move(id, { choice: id === 'p4' ? q.answer : (q.answer + 1) % 4 });
  g.fire();
}
assert.ok(g.state.result);
assert.deepEqual(g.state.result.winners, ['p4'], 'the late joiner aced the rest');
check.ok('trivia: hidden answers and picks, timed scoring, reveals, the end');

// ---------- Emoji Movies ----------
assert.ok(MOVIES.length >= 80);
assert.ok(MOVIES.every(([, e]) => e.split(' ').length >= 3 && e.split(' ').length <= 6), 'three to six emoji each');
assert.ok(matches('finding nemo', ['Finding Nemo']));
assert.ok(matches('Findng Nemoo', ['Finding Nemo']), 'two slips on a long title');
assert.ok(!matches('Fndng Nemoo', ['Finding Nemo']));
assert.ok(matches('lion king', ['The Lion King']), 'the leading “the” is optional');
assert.ok(matches('the jaws', ['Jaws']));
assert.ok(matches('Frozn', ['Frozen']), 'one slip on a short title');
assert.ok(!matches('Jaw', ['Jaws']), 'very short titles must be exact');
assert.ok(matches('Monsters Inc', ['Monsters, Inc.']));
assert.deepEqual(hint('Finding Nemo'), [{ first: 'F', len: 7 }, { first: 'N', len: 4 }]);
g = play('emoji', 4, { count: 6 });
let mv = g.state.movies[0];
for (const who of ['p1', 'watcher']) assert.ok(!has(g.view(who), mv.title) && g.view(who).title === null, 'the title stays hidden');
g.move('p1', { answer: 'not a movie at all' });
assert.deepEqual(g.view('p1').wrong, ['not a movie at all']);
assert.deepEqual(g.view('p2').wrong, []);
g.move('p2', { answer: mv.title });
g.move('p3', { answer: mv.title.toLowerCase() });
g.move('p1', { answer: mv.titles.at(-1) });
assert.deepEqual([g.state.scores.p2, g.state.scores.p3, g.state.scores.p1], [3, 2, 1]);
assert.equal(g.view('p2').title, mv.title, 'you see it once you have it');
assert.equal(g.view('p4').title, null);
g.refused('p2', { answer: mv.title });
assert.equal(g.timer.ms, 15000);
g.fire();
assert.ok(g.view('p4').hint, 'a hint after 15 seconds');
assert.equal(g.view('p4').hint.length, mv.title.split(' ').length);
g.fire();
assert.equal(g.state.phase, 'reveal');
assert.equal(g.view('p4').title, mv.title);
g.refused('p4', { answer: mv.title });
g.fire();
mv = g.state.movies[1];
for (const id of ['p1', 'p2', 'p3', 'p4']) g.move(id, { answer: mv.title });
assert.equal(g.state.phase, 'reveal', 'everyone has it, so the round ends');
for (let i = 2; i < 6; i++) { g.fire(); g.move('p4', { answer: g.state.movies[i].title }); g.fire(); g.fire(); }
g.fire();
assert.deepEqual(g.state.result.winners, ['p4']);
check.ok('emoji movies: matching, hidden titles, 3 2 1 points, hints, the end');

// ---------- Would You Rather ----------
assert.ok(PROMPTS.length >= 100 && PROMPTS.every((p) => p.length === 2));
g = play('wyr', 4, { count: 6 });
g.move('p1', { pick: 'a' });
g.refused('p1', { pick: 'b' });
g.refused('p2', { pick: 'c' });
assert.equal(g.view('p2').picks.p1, 'hidden', 'picks stay secret');
assert.equal(g.view('p1').picks.p1, 'a');
assert.ok(!has(g.view('watcher').picks, '"a"'));
g.move('p2', { pick: 'a' });
g.move('p3', { pick: 'b' });
g.move('p4', { pick: 'a' });
assert.equal(g.state.phase, 'reveal');
assert.equal(g.view('p2').picks.p3, 'b');
assert.deepEqual(g.state.scores, { p1: 1, p2: 1, p3: 0, p4: 1 }, 'the majority scores');
assert.equal(g.timer.ms, 5000);
g.fire();
for (const [id, p] of [['p1', 'a'], ['p2', 'b'], ['p3', 'a'], ['p4', 'b']]) g.move(id, { pick: p });
assert.deepEqual(g.state.scores, { p1: 2, p2: 2, p3: 1, p4: 2 }, 'a perfect split: everyone scores');
g.fire();
g.move('p3', { pick: 'b' });
g.fire();
assert.equal(g.state.phase, 'reveal', 'time ran out');
assert.equal(g.state.scores.p3, 2, 'the only picker is the majority');
assert.equal(g.state.scores.p1, 2, 'no pick, no point');
for (let i = 3; i < 6; i++) { g.fire(); g.move('p3', { pick: 'a' }); g.fire(); }
g.fire();
assert.deepEqual(g.state.result.winners, ['p3']);
check.ok('would you rather: secret picks, majority and split scoring, the end');

// No em dashes in anything this batch shows or says.
const fs = await import('node:fs');
for (const f of ['wordrace', 'wordrace-words', 'scramble', 'draw', 'draw-words', 'trivia', 'trivia-questions', 'emoji', 'emoji-movies', 'wyr', 'wyr-prompts']) {
  assert.ok(!fs.readFileSync(new URL(`../../games/${f}.js`, import.meta.url), 'utf8').includes('\u2014'), `${f} has an em dash`);
}
for (const f of ['wordrace', 'scramble', 'draw', 'trivia', 'emoji', 'wyr']) {
  for (const ext of ['js', 'css']) assert.ok(!fs.readFileSync(new URL(`../../public/games/${f}.${ext}`, import.meta.url), 'utf8').includes('\u2014'));
}
check.ok('no em dashes');

console.log(`\n${check.count} word and party game checks passed\n`);
