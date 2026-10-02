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

// Netflix rolling on to the next episode moves the room on.
const g = client(PORT, 'Ana', 'ext-room-3', { ext: 'Netflix' });
const h = client(PORT, 'Ben', 'ext-room-3', { ext: 'Netflix' });
await Promise.all([g.joined, h.joined]);
g.emit('show:add', { title: 'Dark', service: 'Netflix', season: 1, episode: 3 }); await wait(50);
g.emit('show:watch', { id: g.last.shows[0].id }); await wait(50);
const ep3 = g.last.current;
await g.ask('queue:add', { input: 'https://www.netflix.com/watch/70000004' });
await wait(50);
g.emit('cmd:play', { position: 10 }); await wait(50);
// The Shows tab item has no link, so any new title counts; the queued link is next.
g.emit('ext:next', { itemId: ep3.id, url: 'https://www.netflix.com/watch/70000004' });
h.emit('ext:next', { itemId: ep3.id, url: 'https://www.netflix.com/watch/70000004' }); // the second report is ignored
await wait(80);
assert.equal(h.last.current.url, 'https://www.netflix.com/watch/70000004');
assert.equal(h.last.queue.length, 0);
assert.equal(h.last.shows[0].episode, 4, 'the show moved on one episode');
assert.equal(h.last.playback.playing, true, 'the queued episode was the one playing, so it keeps playing');
assert.ok(h.last.playback.position < 1);
assert.equal(h.last.extSync, true);
check.ok('an episode rolling on moves to the queued episode and keeps playing');

// Opening another title while paused keeps everyone paused.
h.emit('cmd:pause', { position: 30 }); await wait(50);
const paused = h.last.current;
g.emit('ext:next', { itemId: paused.id, url: 'https://www.netflix.com/watch/70000009' }); await wait(80);
assert.equal(h.last.current.url, 'https://www.netflix.com/watch/70000009');
assert.equal(h.last.playback.playing, false);
h.emit('cmd:play', { position: 0 }); await wait(50);
check.ok('another title opened while paused stays paused');

// Nothing queued: follow the new episode, still in sync.
const ep4 = h.last.current;
g.emit('ext:next', { itemId: ep4.id, url: 'https://www.netflix.com/watch/70000005?trackId=1' }); await wait(80);
assert.equal(h.last.current.url, 'https://www.netflix.com/watch/70000005?trackId=1');
assert.equal(h.last.current.title, ep4.title);
assert.equal(h.last.playback.playing, true);
assert.equal(h.last.extSync, true);
assert.ok(h.toasts.some((t) => t.includes('next episode')));
const ep5 = h.last.current;
g.emit('ext:next', { itemId: ep5.id, url: 'https://www.netflix.com/watch/70000005' }); await wait(50);
assert.equal(h.last.current.id, ep5.id, 'the same title again is not a new episode');
g.emit('ext:next', { itemId: ep5.id, url: 'https://www.hulu.com/watch/abc' }); await wait(50);
assert.equal(h.last.current.id, ep5.id, 'another service is ignored');
check.ok('with nothing queued, the room follows the new episode');

// Countdown mode: rolling on is ignored, since the room isn't synced.
const w = client(PORT, 'Web', 'ext-room-3');
await w.joined; await wait(50);
g.emit('ext:next', { itemId: ep5.id, url: 'https://www.netflix.com/watch/70000006' }); await wait(50);
assert.equal(h.last.current.id, ep5.id);
check.ok('rolling on is ignored when the room isn\'t synced');
[g, h, w].forEach((s) => s.disconnect());

// Bad ext values are dropped.
const f = client(PORT, 'Kim', 'ext-room-2', { ext: 'Disney+' });
await f.joined; await wait(50);
assert.equal(f.last.members[0].ext, null);
check.ok('unknown services in the ext field are ignored');

console.log(`\n${check.count} extension checks passed\n`);
[a, c, f].forEach((s) => s.disconnect());
srv.kill();
process.exit(0);
