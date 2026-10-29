// Games in a room: the lobby, seats, starting, moves through the server, what each person can
// see, ending and playing again, and wins. Then every game's own rule checks in test/games/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, client, wait, checker } from './helpers.js';
import { CATALOG } from '../public/games/catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const PORT = 3994;
const srv = await startServer(PORT);
const check = checker();
const ROOM = 'games-room-1';

// Every game in the catalog has its rules, its drawing code, and its styles.
for (const g of CATALOG) {
  for (const f of [`games/${g.id}.js`, `public/games/${g.id}.js`, `public/games/${g.id}.css`]) {
    assert.ok(fs.existsSync(path.join(root, f)), `${g.id} is missing ${f}`);
    assert.ok(!fs.readFileSync(path.join(root, f), 'utf8').includes('PLACEHOLDER'), `${f} is still a placeholder`);
  }
}
assert.ok(CATALOG.length >= 20);
assert.equal(new Set(CATALOG.map((g) => g.id)).size, CATALOG.length);
check.ok(`all ${CATALOG.length} games have rules, a board, and styles`);

const games = (s) => { s.game = null; s.on('game', (g) => { s.game = g; }); return s; };
const a = games(client(PORT, 'Ana', ROOM));
const b = games(client(PORT, 'Ben', ROOM));
await Promise.all([a.joined, b.joined]);

// A playing video pauses when a game opens.
await a.ask('queue:add', { input: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
a.emit('cmd:play', { position: 5 });
await wait(80);
assert.equal(a.last.playback.playing, true);
let r = await a.ask('game:open', { type: 'nope' });
assert.ok(r.error);
r = await a.ask('game:open', { type: 'tictactoe' });
assert.ok(r.ok);
await wait(60);
assert.equal(a.last.playback.playing, false, 'opening a game pauses the video');
assert.equal(b.game.phase, 'lobby');
assert.deepEqual(b.game.seats.map((p) => p.name), ['Ana']);
assert.equal(b.last.games.open.type, 'tictactoe');
await a.ask('room:settings', { visibility: 'public' });
const listed = await (await fetch(`http://localhost:${PORT}/api/rooms?q=tic-tac`)).json();
assert.equal(listed.rooms[0]?.game, 'Tic-tac-toe', 'public rooms show (and find) the game being played');
check.ok('opening a game pauses the video, shows everyone the lobby, and lists it in public rooms');

r = await a.ask('game:start');
assert.match(r.error, /needs 2/);
const c = games(client(PORT, 'Cy', ROOM));
await c.joined;
await wait(50);
assert.equal(c.game?.type, 'tictactoe', 'someone joining the room sees the open game');
assert.ok((await b.ask('game:seat', { on: true })).ok);
assert.match((await c.ask('game:seat', { on: true })).error, /taken/);
assert.ok((await b.ask('game:start')).ok);
await wait(50);
assert.equal(a.game.phase, 'play');
assert.equal(a.game.turn, 'ana');
assert.equal(c.last.games.open.phase, 'play', 'the Games tab hears that it started');
check.ok('seats fill up to the limit, and a seated player starts it');

assert.match((await b.ask('game:move', { move: { cell: 0 } })).error, /turn/);
assert.match((await c.ask('game:move', { move: { cell: 0 } })).error, /watching/);
for (const [s, cell] of [[a, 0], [b, 3], [a, 1], [b, 4]]) assert.ok((await s.ask('game:move', { move: { cell } })).ok);
assert.match((await c.ask('game:close')).error, /players/, 'someone watching can’t end it');
await a.ask('game:move', { move: { cell: 2 } });
await wait(60);
assert.deepEqual(c.game.result.winners, ['ana']);
assert.equal(c.game.result.text, 'Ana wins');
assert.deepEqual(c.last.games.scores.map((s) => [s.name, s.wins]), [['Ana', 1]]);
assert.ok(a.toasts.some((t) => t.includes('Ana wins')));
check.ok('moves go through the referee, the watcher can’t move, and a win is counted');

assert.ok((await b.ask('game:again')).ok);
await wait(50);
assert.equal(a.game.turn, 'ben', 'whoever went first goes second next time');
assert.equal(a.game.result, null);
assert.ok((await b.ask('game:lobby')).ok);
await wait(50);
assert.equal(a.game.phase, 'lobby');
assert.deepEqual(a.game.seats.map((p) => p.id), ['ben', 'ana'], 'back in the lobby, the players keep their seats');
check.ok('play again swaps who goes first; back to the lobby keeps the seats');

// Hidden information never leaves the server.
assert.ok((await c.ask('game:open', { type: 'hangman' })).ok);
await wait(50);
assert.deepEqual(a.game.seats.map((p) => p.id).sort(), ['ana', 'ben', 'cy'], 'switching games keeps everyone seated');
assert.ok((await a.ask('game:option', { key: 'from', value: 'player' })).ok);
assert.ok((await a.ask('game:option', { key: 'from', value: 'nonsense' })).error);
assert.ok((await c.ask('game:start')).ok);
await wait(50);
assert.equal(a.game.view.phase, 'choose');
assert.ok((await c.ask('game:move', { move: { word: 'Secret Popcorn' } })).ok);
await wait(50);
assert.equal(c.game.view.word, 'Secret Popcorn');
for (const s of [a, b]) assert.ok(!JSON.stringify(s.game).toLowerCase().includes('popcorn'), 'guessers never get the word');
assert.ok((await a.ask('game:move', { move: { letter: 'p' } })).ok);
await wait(50);
assert.deepEqual(b.game.view.mask.slice(7), ['P', null, 'p', null, null, null, null]);
check.ok('a hidden word stays on the server; guessers see only their letters');

// Late joining, and leaving.
const d = games(client(PORT, 'Dee', ROOM));
await d.joined;
assert.ok((await d.ask('game:seat', { on: true })).ok, 'hangman takes late players');
await wait(50);
assert.ok(a.game.players.some((p) => p.id === 'dee'));
assert.ok((await d.ask('game:move', { move: { letter: 'e' } })).ok);
d.disconnect();
await wait(80);
assert.equal(a.game.players.find((p) => p.id === 'dee').here, false, 'someone who left shows as away');
assert.ok((await a.ask('game:close')).ok);
await wait(50);
assert.equal(b.game, null);
assert.equal(b.last.games.open, null);
check.ok('late joiners, people who leave, and ending a game');

// Rooms made for games.
assert.equal(a.last.mode, 'watch', 'rooms are for watching unless the host says otherwise');
assert.match((await b.ask('room:settings', { mode: 'games' })).error, /Only/);
assert.ok((await a.ask('room:settings', { mode: 'games' })).ok);
await wait(50);
assert.equal(b.last.mode, 'games');
assert.ok(b.toasts.some((t) => t.includes('made this a games room')));
const dir = await (await fetch(`http://localhost:${PORT}/api/rooms?q=games-room`)).json();
assert.equal(dir.rooms[0].mode, 'games');
const e = games(client(PORT, 'Eve', 'games-room-2', { cache: { mode: 'games', title: 'Game night' } }));
await e.joined;
await wait(50);
assert.equal(e.last.mode, 'games', 'a room restored after a restart stays a games room');
e.disconnect();
check.ok('the host makes a room a games room; it shows in public rooms and survives a restart');

// A video over the game: it keeps playing when a game opens, and hiding it pauses it.
{
  const f = games(client(PORT, 'Fay', 'games-room-3'));
  const g = games(client(PORT, 'Gus', 'games-room-3'));
  await Promise.all([f.joined, g.joined]);
  await f.ask('queue:add', { input: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
  assert.ok((await f.ask('game:video', { on: true })).ok);
  f.emit('cmd:play', { position: 5 });
  await wait(80);
  assert.equal(g.last.gameVideo, true);
  assert.ok((await g.ask('game:open', { type: 'tictactoe' })).ok);
  await wait(60);
  assert.equal(f.last.playback.playing, true, 'a video over the game keeps playing when a game opens');
  assert.ok((await g.ask('game:video', { on: false })).ok);
  await wait(60);
  assert.equal(f.last.gameVideo, false);
  assert.equal(f.last.playback.playing, false, 'hiding it pauses it for everyone');
  assert.ok(f.toasts.some((t) => t.includes('Gus hid the video')));
  f.disconnect(); g.disconnect();
}
check.ok('a video over the game keeps playing through it, for everyone, until it’s hidden');

for (const s of [a, b, c]) s.disconnect();
srv.kill();
console.log(`\n${check.count} game room checks passed\n`);

// Each game's own rule checks.
for (const f of fs.readdirSync(path.join(here, 'games')).filter((f) => f.endsWith('.js') && f !== 'harness.js').sort()) {
  await import(`./games/${f}`);
}
