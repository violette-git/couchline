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
for (const l of 'qxzjvkwy') { if (g.state.result) break; if (!g.state.word.toLowerCase().includes(l)) g.move('p2', { letter: l }); }
g.state.wrong = 5;
g.move('p1', { word: 'definitely not it' });
assert.deepEqual(g.state.result.winners, [], 'six misses and the word wins');
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
g.move('p1', { word: 'Paddington', topic: '  A   bear   who loves marmalade, from Peru  ' });
assert.equal(g.view('p2').topic, 'A bear who loves marmalade, fr', 'the chooser’s topic is tidied and kept short');
assert.ok(!g.view('p2').topic.toLowerCase().includes('paddington'));
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: 'Paddington', topic: '   ' });
assert.equal(g.view('p2').topic, null, 'the topic is optional');
g = play('hangman', 2, { from: 'player' });
g.move('p1', { word: 'Paddington', topic: { not: 'text' } });
assert.equal(g.view('p2').topic, null, 'a topic that isn’t text is ignored');
check.ok('hangman: hidden word, letters, whole-word guesses, chosen words and their topics');

console.log(`\n${check.count} basic game checks passed\n`);
