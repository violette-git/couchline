// Server checks for Netflix and Hulu through the Couchline extension: synced playback when
// every viewer is an extension seat, the shared countdown otherwise.
import assert from 'node:assert/strict';
import { startServer, client, wait, checker } from './helpers.js';

const PORT = 3997;
const srv = await startServer(PORT);
const check = checker();
const ROOM = 'ext-room-1';

// Two people, each on the extension on Netflix.
const a = client(PORT, 'Gaytan', ROOM, { ext: 'Netflix' });
const b = client(PORT, 'Sam', ROOM, { ext: 'Netflix' });
await Promise.all([a.joined, b.joined]);
await wait(50);
assert.deepEqual(a.last.members.map((m) => m.ext), ['Netflix', 'Netflix']);
assert.equal(a.last.extSync, false, 'nothing on yet');

await a.ask('queue:add', { input: 'https://www.netflix.com/watch/81234567' });
await wait(50);
assert.equal(b.last.current.service, 'Netflix');
assert.equal(b.last.extSync, true);
assert.equal(b.last.playback.playing, false);
assert.equal(b.last.playback.fresh, true, 'nobody gets moved until someone presses play');
assert.ok(b.toasts.some((t) => t.includes('Netflix is synced')));
check.ok('a Netflix item is synced when every viewer is on the extension');

b.emit('cmd:play', { position: 600 }); await wait(50);
assert.equal(a.last.playback.playing, true);
assert.equal(a.last.playback.position, 600);
assert.equal(a.last.playback.fresh, false);
a.emit('cmd:seek', { position: 900 }); await wait(50);
assert.equal(b.last.playback.position, 900);
a.emit('buffering', { on: true }); await wait(50);
assert.deepEqual(b.last.holds, ['Gaytan']);
a.emit('buffering', { on: false }); await wait(50);
a.emit('media:meta', { itemId: a.last.current.id, duration: 3000 }); await wait(50);
assert.equal(b.last.current.duration, 3000);
check.ok('play, seek, buffering holds, and duration flow through the extension seats');

// A third person joins from the web app, without the extension.
const c = client(PORT, 'Riley', ROOM);
await c.joined; await wait(50);
assert.equal(a.last.extSync, false);
assert.ok(a.toasts.some((t) => t.includes('back to the shared countdown')));
const frozen = a.last.playback;
a.emit('cmd:pause', { position: 950 }); await wait(50);
assert.deepEqual(c.last.playback, frozen, 'commands are ignored in countdown mode');
check.ok('someone without the extension switches the room back to the countdown');

// That web tab becomes a remote, so it no longer counts as a viewer.
c.emit('member:remote', { on: true }); await wait(50);
assert.equal(a.last.extSync, true);
assert.equal(a.last.playback.playing, false, 'turning sync back on pauses');
assert.equal(a.last.playback.fresh, true, 'and leaves everyone where they are');
c.emit('cmd:play', { position: 1000 }); await wait(50);
assert.equal(a.last.playback.playing, true, 'the remote tab can still press play');
c.emit('cmd:pause', { position: 1001 }); await wait(50);
check.ok('a web tab set as a remote lets sync turn back on and can control it');

// A fresh item started with Start together begins from the starter's own spot.
await a.ask('queue:add', { input: 'https://www.netflix.com/watch/80000001' });
await wait(50);
a.emit('queue:skip'); await wait(50);
assert.equal(a.last.playback.fresh, true);
a.emit('countdown:start', { seconds: 3, position: 125 }); await wait(50);
assert.equal(b.last.playback.position, 125);
assert.ok(b.last.playback.at > b.last.serverNow, 'scheduled to start when the countdown ends');
const go = new Promise((res) => b.once('go', res));
await go; await wait(50);
assert.equal(b.last.playback.playing, true);
check.ok('Start together on a fresh synced item starts from the starter\'s spot');

// An extension seat dropping off pauses the room, like a web viewer would on YouTube.
b.disconnect(); await wait(100);
assert.equal(a.last.playback.playing, false);
assert.ok(a.toasts.some((t) => t.startsWith('Sam dropped off')));
check.ok('an extension seat dropping off pauses everyone');

// Extension on Hulu while the room is on Netflix: no sync.
const d = client(PORT, 'Jo', ROOM, { ext: 'Hulu' });
await d.joined; await wait(50);
assert.equal(a.last.extSync, false);
d.disconnect(); await wait(50);
assert.equal(a.last.extSync, true);
check.ok('an extension seat on a different service doesn\'t count');

// YouTube in the same room: extension seats aren't watching it, so they don't pause it.
const e = client(PORT, 'Lee', ROOM, { ext: 'Netflix' });
await e.joined;
await a.ask('queue:add', { input: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await wait(50);
a.emit('queue:play', { id: a.last.queue.at(-1).id }); await wait(50);
a.emit('countdown:cancel'); await wait(50);
a.emit('cmd:play', { position: 0 }); await wait(50);
e.disconnect(); await wait(100);
assert.equal(a.last.playback.playing, true);
check.ok('extension seats leaving don\'t pause a YouTube video');

// Bad ext values are dropped.
const f = client(PORT, 'Kim', 'ext-room-2', { ext: 'Disney+' });
await f.joined; await wait(50);
assert.equal(f.last.members[0].ext, null);
check.ok('unknown services in the ext field are ignored');

console.log(`\n${check.count} extension checks passed\n`);
[a, c, f].forEach((s) => s.disconnect());
srv.kill();
process.exit(0);
