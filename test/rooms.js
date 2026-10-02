// Room titles, private and public rooms, the public directory, the host, and the limit on
// trying many room codes.
import assert from 'node:assert/strict';
import { startServer, client, wait, checker } from './helpers.js';

const PORT = 3995;
const srv = await startServer(PORT);
const check = checker();
const rooms = async (q = '') => (await (await fetch(`http://localhost:${PORT}/api/rooms${q ? `?q=${encodeURIComponent(q)}` : ''}`)).json()).rooms;

// ---- the creator is the host ----
const a = client(PORT, 'Ana', 'movie-night-1111');
await a.joined;
const b = client(PORT, 'Ben', 'movie-night-1111');
await b.joined;
await wait(50);
assert.equal(b.last.host, 'ana');
assert.equal(b.last.hostName, 'Ana');
assert.deepEqual([b.last.title, b.last.visibility], [null, 'private'], 'new rooms start untitled and private');
let r = await b.ask('room:settings', { title: 'Ben’s room', visibility: 'public' });
assert.match(r.error, /Only Ana/);
assert.equal(a.last.visibility, 'private', 'only the host can change them');
r = await a.ask('room:settings', { title: '  Friday   Movie Night  ', visibility: 'public' });
assert.ok(r.ok);
await wait(50);
assert.deepEqual([b.last.title, b.last.visibility], ['Friday Movie Night', 'public']);
assert.ok(b.toasts.some((t) => t === 'Ana named the room Friday Movie Night and made the room public'));
check.ok('the creator is the host and sets the title and private or public');

// ---- the directory ----
await a.ask('queue:add', { input: 'https://example.com/films/sunset_drive.mp4' });
const p = client(PORT, 'Pia', 'secret-plans-2222');
await p.joined;
await p.ask('room:settings', { title: 'Secret plans' });
await wait(80);
let list = await rooms();
assert.deepEqual(list.map((x) => x.id), ['movie-night-1111'], 'private rooms are never listed');
assert.deepEqual([list[0].title, list[0].people.map((x) => x.name), list[0].now.kind], ['Friday Movie Night', ['Ana', 'Ben'], 'file']);
assert.equal((await rooms('friday')).length, 1, 'search finds the title');
assert.equal((await rooms('sunset drive')).length, 1, 'and what’s on');
assert.equal((await rooms('movie-night-1111')).length, 1, 'and the code');
assert.equal((await rooms('secret')).length, 0, 'but never a private room');
assert.equal((await rooms('nothing like this')).length, 0);
// Busiest first.
const c = client(PORT, 'Cy', 'quiet-room-3333');
await c.joined;
await c.ask('room:settings', { visibility: 'public' });
await wait(50);
assert.deepEqual((await rooms()).map((x) => x.id), ['movie-night-1111', 'quiet-room-3333']);
c.disconnect(); await wait(80);
assert.deepEqual((await rooms()).map((x) => x.id), ['movie-night-1111'], 'a public room with nobody in it drops out');
check.ok('the directory lists live public rooms, busiest first, and searches titles, what’s on, and codes');

// ---- the host steps away, and comes back ----
a.disconnect(); await wait(80);
assert.equal(b.last.host, 'ben', 'with the host away, whoever has been there longest stands in');
r = await b.ask('room:settings', { title: 'Ben’s turn' });
assert.ok(r.ok);
const a2 = client(PORT, 'Ana', 'movie-night-1111');
await a2.joined; await wait(80);
assert.equal(b.last.host, 'ana', 'the host gets it back on return');
r = await b.ask('room:settings', { title: 'Mine now' });
assert.ok(r.error);
check.ok('the host role passes to whoever has been there longest, and back');

// ---- restart: the title and privacy come back with the saved copy ----
const d = client(PORT, 'Ana', 'restored-room-4444', { cache: { title: 'Back again', visibility: 'public', queue: [], shows: [] } });
await d.joined; await wait(50);
assert.deepEqual([d.last.title, d.last.visibility, d.last.host], ['Back again', 'public', 'ana']);
check.ok('a room restored after a restart keeps its title and privacy');

// ---- trying lots of room codes ----
const scouts = [];
let refused = null;
for (let i = 0; i < 32 && !refused; i++) {
  const s = client(PORT, `S${i}`, `guess-${1000 + i}`);
  scouts.push(s);
  const res = await s.joined;
  if (res?.error) refused = { i, error: res.error };
}
// This address has already used a few rooms above, so the cut-off comes a little before 30.
assert.ok(refused && refused.i < 31 && /Too many/.test(refused.error), JSON.stringify(refused));
check.ok('trying lots of different room codes is cut off');

console.log(`\n${check.count} room checks passed\n`);
[b, p, a2, d, ...scouts].forEach((s) => s.disconnect());
srv.kill();
process.exit(0);
