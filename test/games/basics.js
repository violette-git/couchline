// Tic-tac-toe, Connect Four, Rock Paper Scissors, and Hangman.
import assert from 'node:assert/strict';
import { play } from './harness.js';
import { checker } from '../helpers.js';

const check = checker();

let g = play('tictactoe');
for (const [by, cell] of [['p1', 0], ['p2', 3], ['p1', 1], ['p2', 4]]) g.move(by, { cell });
g.refused('p1', { cell: 3 });
g.refused('p2', { cell: 8 });
g.move('p1', { cell: 2 });
assert.deepEqual(g.state.result.winners, ['p1']);
assert.deepEqual(g.state.line, [0, 1, 2]);
g = play('tictactoe');
for (const [i, cell] of [0, 1, 2, 4, 3, 5, 7, 6, 8].entries()) g.move(i % 2 ? 'p2' : 'p1', { cell });
assert.deepEqual(g.state.result.winners, [], 'a full board with no line is a draw');
check.ok('tic-tac-toe: turns, taken squares, a win, and a draw');

g = play('connect4');
for (const col of [0, 1, 0, 1, 0, 1]) g.move(g.state.turn, { col });
g.move('p1', { col: 0 });
assert.deepEqual(g.state.result.winners, ['p1']);
assert.equal(g.state.line.length, 4);
g = play('connect4');
for (let i = 0; i < 6; i++) g.move(g.state.turn, { col: 6 });
assert.match(g.refused(g.state.turn, { col: 6 }), /full/);
g = play('connect4');
// A diagonal: p1 at (5,0) (4,1) (3,2) (2,3).
for (const col of [0, 1, 1, 2, 2, 3, 2, 3, 3, 6]) g.move(g.state.turn, { col });
g.move('p1', { col: 3 });
assert.deepEqual(g.state.result?.winners, ['p1'], 'diagonals count');
check.ok('connect four: discs fall, full columns, across and diagonal wins');

g = play('rps', 2, { bestOf: 3 });
g.move('p1', { pick: 'rock' });
assert.equal(g.view('p2').picks.p1, 'hidden', 'the other pick stays secret');
assert.equal(g.view('p1').picks.p1, 'rock');
g.refused('p1', { pick: 'paper' });
g.move('p2', { pick: 'scissors' });
assert.equal(g.state.wins.p1, 1);
g.move('p1', { pick: 'paper' }); g.move('p2', { pick: 'paper' });
assert.equal(g.state.rounds.at(-1).winner, null);
g.move('p1', { pick: 'paper' }); g.move('p2', { pick: 'rock' });
assert.deepEqual(g.state.result.winners, ['p1']);
check.ok('rock paper scissors: secret picks, ties, best of three');

g = play('hangman', 2, { from: 'random', topic: 'animals' });
assert.equal(g.view('p1').topic, 'Animals', 'a Couchline word comes with its topic');
const word = g.state.word.toLowerCase();
assert.ok(!JSON.stringify(g.view('p1')).toLowerCase().includes(`"${word}"`), 'the word never reaches guessers');
assert.equal(g.view('p1').word, null);
const letters = [...new Set(word.replace(/[^a-z]/g, ''))];
for (const l of letters) g.move('p1', { letter: l });
assert.deepEqual(g.state.result.winners, ['p1', 'p2']);
g = play('hangman', 2, { from: 'random' });
assert.ok(['Movies and TV', 'Animals', 'Food', 'Everyday things'].includes(g.view('p2').topic), 'a mixed pick says which list it came from');
for (const l of 'qxz') { if (!g.state.word.toLowerCase().includes(l)) g.move('p2', { letter: l }); }
g.state.wrong = 6;
g.move('p1', { word: 'definitely not it' });
assert.equal(g.state.result, null, 'seven misses is still going');
g.move('p1', { word: 'still not it' });
assert.deepEqual(g.state.result.winners, [], 'eight misses and the word wins');
assert.equal(g.view('p1').max, 8);
g = play('hangman', 2, { from: 'player' });
g.refused('p2', { letter: 'a' });
g.refused('p1', { word: 'x1' });
g.move('p1', { word: 'Popcorn Time' });
assert.equal(g.view('p2').word, null);
assert.equal(g.view('p1').word, 'Popcorn Time', 'the chooser sees their word');
assert.equal(g.view('p2').mask.filter((c) => c === ' ').length, 1, 'spaces show');
g.refused('p1', { letter: 'p' });
g.move('p2', { word: 'popcorn time' });
assert.ok(g.state.result.winners.length);
g = play('hangman', 2, { from: 'player' });
assert.equal(g.view('p2').topic, null);
const long = 'A bear from darkest Peru who loves marmalade sandwiches and lives with a family in London';
g.move('p1', { word: 'Paddington', topic: `  ${long.replace(/ /g, '   ')}  ` });
assert.equal(g.view('p2').topic, long, 'a long topic is kept whole, with its spacing tidied');
assert.ok(!g.view('p2').topic.toLowerCase().includes('paddington'));
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: 'Paddington', topic: '   ' });
assert.equal(g.view('p2').topic, null, 'the topic is optional');
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: 'Paddington', topic: { not: 'text' } });
assert.equal(g.view('p2').topic, null, 'a topic that isn’t text is ignored');
check.ok('hangman: hidden word, letters, whole-word guesses, chosen words and their topics');

// Hints: the chooser's stays hidden until opened; Couchline's is a letter. Once a game.
g = play('hangman', 3, { from: 'player' });
g.move('p1', { word: 'Paddington', topic: 'Movies', hint: 'He has a hat and a suitcase' });
assert.equal(g.view('p2').hint, null, 'the hint is hidden until someone opens it');
assert.equal(g.view('p2').hintReady, true);
assert.equal(g.view('p1').hint, 'He has a hat and a suitcase', 'the chooser sees their own hint');
g.refused('p1', { hint: true });
g.move('p2', { hint: true });
assert.equal(g.view('p3').hint, 'He has a hat and a suitcase', 'once opened, everyone sees it');
assert.equal(g.view('p3').hintReady, false);
assert.equal(g.state.wrong, 0, 'opening the hint doesn’t cost a miss');
assert.match(g.refused('p3', { hint: true }), /already/);
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: 'Paddington' });
assert.equal(g.view('p2').hintReady, false);
assert.match(g.refused('p2', { hint: true }), /no hint/);
g = play('hangman', 1, { from: 'random' });
const before = g.state.guessed.length;
g.move('p1', { hint: true });
assert.equal(g.state.guessed.length, before + 1, 'Couchline’s hint is one letter');
const got = g.state.guessed.at(-1);
assert.ok(g.state.word.toLowerCase().includes(got));
assert.equal(g.view('p1').hint, `There’s ${/[aeiou]/.test(got) ? 'an' : 'a'} ${got.toUpperCase()}`);
check.ok('hangman: hints, hidden until opened, once a game, and a free letter for Couchline’s words');

// Phones type curly apostrophes and long dashes.
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: 'Schitt\u2019s Creek' });
assert.equal(g.view('p1').word, "Schitt's Creek");
assert.deepEqual(g.view('p2').mask.filter((c) => c && !/[a-z]/i.test(c)), ["'", ' '], 'the apostrophe shows from the start');
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: 'Spider\u2013Man' });
assert.equal(g.view('p1').word, 'Spider-Man');
g.move('p2', { word: 'spiderman' });
assert.ok(g.state.result.winners.length, 'a whole-word guess doesn’t need the hyphen');
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: "Rock 'n' Roll" });
assert.equal(g.view('p1').word, "Rock 'n' Roll");
check.ok('hangman: apostrophes and hyphens, straight or curly, in chosen words');

// Who found each letter, for the chooser's screen.
g = play('hangman', 3, { from: 'player' });
g.move('p1', { word: 'Popcorn Night', hint: 'Snack' });
g.move('p2', { letter: 'o' });
g.move('p3', { letter: 'z' });
g.move('p3', { letter: 'n' });
assert.deepEqual(g.view('p1').found, { o: 'p2', n: 'p3' }, 'right letters remember who found them; misses don’t');
g.move('p2', { hint: true });
assert.deepEqual(Object.keys(g.view('p1').found), ['o', 'n'], 'a written hint finds no letters');
g.move('p3', { word: 'popcorn night' });
assert.equal(g.view('p1').found.p, 'p3', 'a whole-word guess finds the rest');
assert.equal(g.view('p1').found.o, 'p2', 'and keeps who found the earlier ones');
check.ok('hangman: who found each letter, for the chooser’s screen');

console.log(`\n${check.count} basic game checks passed\n`);
