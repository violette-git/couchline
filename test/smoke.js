// Two fake viewers exercise the server: join, queue, play, pause, buffering hold,
// countdown, shows, signaling relay, disconnect auto-pause, and cache restore.
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const PORT = 3999;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => srv.stdout.once('data', r));
process.on('uncaughtException', (e) => { console.error(e); srv.kill(); process.exit(1); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name, roomId, extra = {}) {
  const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  s.last = null; s.toasts = []; s.signals = [];
  s.on('state', (st) => { s.last = st; });
  s.on('toast', (t) => s.toasts.push(t.text));
  s.on('signal', (d) => s.signals.push(d));
  s.joined = new Promise((res) => s.on('connect', () => s.emit('join', { roomId, clientId: name.toLowerCase(), name, ...extra }, res)));
  s.ask = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return s;
}

let pass = 0;
const ok = (label) => { pass++; console.log('ok  ', label); };

const a = client('Gaytan', 'cozy-lamp-1234');
const b = client('Sam', 'cozy-lamp-1234');
await Promise.all([a.joined, b.joined]);
await wait(100);
assert.equal(a.last.members.length, 2);
assert.notEqual(a.last.members[0].color, a.last.members[1].color);
ok('two members joined with different colors');

let r = await a.ask('queue:add', { input: 'https://youtu.be/dQw4w9WgXcQ?t=30' });
assert.ok(r.ok); await wait(50);
assert.equal(b.last.current.kind, 'youtube');
assert.equal(b.last.current.videoId, 'dQw4w9WgXcQ');
assert.equal(b.last.playback.position, 30);
ok('YouTube link becomes the current video, start time kept');

r = await a.ask('queue:add', { input: 'instagram.com/reel/C8abcdEFG/?igsh=x' });
assert.ok(r.ok);
r = await a.ask('queue:add', { input: 'Severance S2E3', service: 'Hulu' });
r = await a.ask('queue:add', { input: 'https://www.netflix.com/watch/81234567' });
r = await a.ask('queue:add', { input: 'https://example.com/some/page' });
assert.ok(r.error);
await wait(50);
assert.deepEqual(b.last.queue.map((q) => q.kind), ['instagram', 'stream', 'stream']);
assert.equal(b.last.queue[1].service, 'Hulu');
assert.equal(b.last.queue[2].service, 'Netflix');
ok('Instagram, typed show, and Netflix link queue up; unsupported link refused');

b.emit('cmd:play', { position: 30 }); await wait(300);
assert.equal(a.last.playback.playing, true);
b.emit('cmd:pause', { position: 42 }); await wait(50);
assert.equal(a.last.playback.playing, false);
assert.equal(a.last.playback.position, 42);
ok('play and pause reach the other viewer');

a.emit('cmd:play', { position: 42 }); await wait(50);
b.emit('buffering', { on: true }); await wait(50);
assert.equal(a.last.playback.playing, false);
assert.deepEqual(a.last.holds, ['Sam']);
b.emit('buffering', { on: false }); await wait(50);
assert.equal(a.last.playback.playing, true);
assert.equal(a.last.holds.length, 0);
ok('room waits while one person buffers, then resumes');

a.emit('countdown:start', { seconds: 3 }); await wait(50);
assert.ok(a.last.countdown);
assert.ok(a.last.playback.at > a.last.serverNow, 'YouTube scheduled to start at the countdown end');
const go = new Promise((res) => b.once('go', res));
await go;
ok('countdown schedules a synced start and fires go');

a.emit('media:ended', { itemId: a.last.current.id });
b.emit('media:ended', { itemId: a.last.current.id }); // duplicate should be ignored
await wait(80);
assert.equal(a.last.current.kind, 'instagram');
assert.equal(a.last.queue.length, 2);
assert.equal(a.last.countdown, null, 'Instagram waits for Start together');
ok('video end advances once, even if both screens report it');

a.emit('show:add', { title: 'The Bear', service: 'Hulu', season: 2, episode: 4 }); await wait(50);
const show = b.last.shows[0];
b.emit('show:finish', { id: show.id }); await wait(50);
assert.equal(a.last.shows[0].episode, 5);
a.emit('show:watch', { id: show.id }); await wait(50);
assert.equal(b.last.current.title, 'The Bear');
assert.equal(b.last.current.episode, 5);
ok('shows tracker advances and can be put on');

a.emit('signal', { to: 'sam', msg: { sdp: { type: 'offer', sdp: 'x' } } }); await wait(50);
assert.equal(b.signals[0].from, 'gaytan');
ok('call signaling relays between viewers');

// Put a YouTube video back on and play it, then drop one viewer.
await a.ask('queue:add', { input: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await wait(50);
a.emit('queue:play', { id: a.last.queue.at(-1).id }); await wait(3200);
assert.equal(a.last.playback.playing, true);
b.disconnect(); await wait(150);
assert.equal(a.last.playback.playing, false);
assert.ok(a.toasts.some((t) => t.startsWith('Sam dropped off')));
ok('auto-pause when the other viewer drops');

// Cache restore: a new room seeded from a returning viewer's saved copy.
const saved = { queue: a.last.queue, shows: a.last.shows, current: a.last.current };
const c = client('Gaytan', 'fresh-room-5555', { cache: saved });
await c.joined; await wait(50);
assert.equal(c.last.shows[0].title, 'The Bear');
assert.equal(c.last.queue.length, saved.queue.length);
ok('empty room restores queue and shows from a returning viewer');

const bad = client('X', 'BAD ROOM!!');
const res = await bad.joined;
assert.ok(res.error);
ok('bad room codes are refused');

console.log(`\n${pass} checks passed`);
[a, c, bad].forEach((s) => s.disconnect());
srv.kill();
process.exit(0);
