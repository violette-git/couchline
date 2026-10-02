// Server checks for the social extras (chat, pings, jinx, moments, ready check, rating together,
// stepping away, Instagram follow) and the HTTP API the extension and phone share sheets use.
import assert from 'node:assert/strict';
import { startServer, client, wait, checker } from './helpers.js';

const PORT = 3996;
const srv = await startServer(PORT, { AWAY_PAUSE_MS: '0' });
const check = checker();
const ROOM = 'social-room-1';
const api = (path, body) => fetch(`http://localhost:${PORT}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, ...(await r.json()) }));

const a = client(PORT, 'Ana', ROOM);
const b = client(PORT, 'Ben', ROOM);
await Promise.all([a.joined, b.joined]);
await wait(50);

// ---- chat ----
const got = [];
b.on('chat', (m) => got.push(m));
const typing = new Promise((res) => b.once('typing', res));
a.emit('chat:typing', { on: true });
assert.equal((await typing).name, 'Ana');
let r = await a.ask('chat:send', { text: '  this part!  ' });
assert.ok(r.ok);
await wait(50);
assert.equal(got[0].text, 'this part!');
assert.equal(got[0].name, 'Ana');
assert.ok(got[0].color);
r = await a.ask('chat:send', { text: '   ' });
assert.ok(r.error, 'empty messages are dropped');
const c = client(PORT, 'Cy', ROOM);
const joinC = await c.joined;
assert.equal(joinC.chat.at(-1).text, 'this part!', 'someone joining later gets the recent chat');
c.disconnect();
check.ok('chat: messages, typing indicator, history for latecomers');

// ---- a video in the box, for moments, pings, ready ----
await a.ask('queue:add', { input: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await wait(50);
const ping = new Promise((res) => b.once('ping', res));
a.emit('ping', { x: 0.25, y: 2 });
const p = await ping;
assert.deepEqual([p.x, p.y, p.name], [0.25, 1, 'Ana'], 'pings are clamped to the video');
check.ok('pings reach the other viewer');

const reacts = [];
b.on('react', (x) => reacts.push(x));
a.emit('react', { emoji: '😂' });
await wait(100);
b.emit('react', { emoji: '😂' });
await wait(100);
assert.deepEqual(reacts.map((x) => x.jinx), [false, true]);
check.ok('the same reaction from both within two seconds is a jinx');

// Ready check: both tap Ready, the countdown starts by itself.
a.emit('ready:toggle'); await wait(50);
assert.deepEqual(b.last.ready.ids, ['ana']);
assert.equal(b.last.countdown, null);
b.emit('ready:toggle'); await wait(50);
assert.ok(b.last.countdown, 'everyone ready starts the countdown');
assert.equal(b.last.ready, null);
await wait(3200);
assert.equal(b.last.playback.playing, true);
check.ok('ready check: the countdown starts when everyone is ready');

a.emit('moment:add', { pos: 42, note: 'the jump' }); await wait(50);
assert.equal(b.last.moments.length, 1);
assert.deepEqual([b.last.moments[0].pos, b.last.moments[0].note, b.last.moments[0].name], [42, 'the jump', 'Ana']);
assert.ok(b.toasts.some((t) => t.includes('starred 0:42')));
r = await a.ask('chat:send', { text: 'look' });
await wait(50);
assert.ok(got.at(-1).pos > 0, 'messages sent while playing remember the spot in the video');
b.emit('moment:remove', { id: b.last.moments[0].id }); await wait(50);
assert.equal(a.last.moments.length, 0);
check.ok('moments: starred spots shared and removable; chat remembers the spot');

// ---- rate it together ----
const watched = a.last.current;
assert.equal(b.last.history[0].id, watched.id, 'what is playing is in Watched right away');
assert.deepEqual(b.last.history[0].votes, []);
await a.ask('queue:add', { input: 'https://vimeo.com/1084537' });
await wait(50);
a.emit('media:ended', { itemId: watched.id }); await wait(80);
assert.equal(b.last.rating.itemId, watched.id);
assert.equal(b.last.rating.revealed, false);
a.emit('rate', { itemId: watched.id, score: 5 }); await wait(50);
assert.deepEqual(b.last.rating.answered, ['ana']);
assert.equal(b.last.rating.votes, null, 'scores stay hidden until everyone answers');
b.emit('rate', { itemId: watched.id, score: 3 }); await wait(50);
assert.equal(b.last.rating.revealed, true);
assert.deepEqual(b.last.rating.votes.map((v) => [v.name, v.score]), [['Ana', 5], ['Ben', 3]]);
assert.equal(b.last.history[0].title, watched.title);
assert.equal(b.last.history[0].videoId, watched.videoId);
assert.equal(b.last.history.filter((h) => h.id === watched.id).length, 1, 'the rating joins the same entry');
assert.equal(b.last.history[0].votes.length, 2);
a.emit('rate:dismiss'); await wait(50);
assert.equal(b.last.rating, null);
check.ok('rate it together: hidden until both answer, then revealed and saved to history');

// Everything actually played is in Watched as soon as it starts, rated or not.
assert.ok(b.last.history.some((h) => h.kind === 'vimeo') === false, 'nothing unplayed is listed');
// Skipping something nobody played doesn't ask for a rating.
a.emit('queue:skip'); await wait(50);
assert.equal(b.last.rating, null);
check.ok('things nobody played aren’t rated');

// ---- stepping away ----
await a.ask('queue:add', { input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
await wait(50);
a.emit('cmd:play', { position: 1 }); await wait(50);
b.emit('presence', { away: true }); await wait(100);
assert.equal(a.last.members.find((m) => m.name === 'Ben').away, true);
assert.equal(a.last.playback.playing, true, 'off by default');
b.emit('presence', { away: false });
a.emit('settings:set', { pauseOnAway: true }); await wait(50);
assert.equal(b.last.settings.pauseOnAway, true);
b.emit('presence', { away: true }); await wait(150);
assert.equal(a.last.playback.playing, false);
assert.ok(a.toasts.some((t) => t.startsWith('Ben stepped away')));
b.emit('presence', { away: false }); await wait(50);
check.ok('stepping away shows, and pauses everyone when that setting is on');

// ---- Instagram follow ----
r = await a.ask('follow:goto', { url: 'https://www.instagram.com/reel/C8abcdEFG/?igsh=x' });
assert.ok(r.ok);
await wait(50);
assert.deepEqual([b.last.follow.code, b.last.follow.name, b.last.follow.url], ['C8abcdEFG', 'Ana', 'https://www.instagram.com/reel/C8abcdEFG/']);
r = await a.ask('follow:goto', { url: 'https://youtu.be/dQw4w9WgXcQ' });
assert.ok(r.error);
const f = await api('/api/follow', { room: ROOM, name: 'ben', url: 'instagram.com/reels/C9xyzABCD/' });
assert.ok(f.ok);
await wait(50);
assert.deepEqual([a.last.follow.code, a.last.follow.name, a.last.follow.color], ['C9xyzABCD', 'ben', b.last.members.find((m) => m.name === 'Ben').color]);
await api('/api/follow/stop', { room: ROOM, name: 'Ben' });
await wait(50);
assert.equal(a.last.follow, null);
check.ok('Instagram follow: from a seat or the extension’s HTTP call, in the sharer’s color');

// ---- add from anywhere (extension, share sheet) ----
let d = await api('/api/drop', { room: ROOM, name: 'Ben', input: 'https://vimeo.com/76979871' });
assert.equal(d.status, 200);
await wait(50);
assert.equal(a.last.queue.at(-1).kind, 'vimeo');
assert.ok(a.toasts.some((t) => t.startsWith('Ben added')));
d = await api('/api/drop', { room: ROOM, name: 'Ben', input: 'https://www.twitch.tv/somestreamer', play: true });
await wait(50);
assert.equal(a.last.current.kind, 'twitch', 'Play now puts it on');
assert.ok(a.last.countdown, 'and starts the countdown');
d = await api('/api/drop', { room: 'nobody-here-1234', name: 'Ben', input: 'https://vimeo.com/76979871' });
assert.equal(d.status, 404);
d = await api('/api/drop', { room: ROOM, name: 'Ben', input: 'https://example.com/page' });
assert.equal(d.status, 400);
const pre = await fetch(`http://localhost:${PORT}/api/drop`, { method: 'OPTIONS' });
assert.equal(pre.headers.get('access-control-allow-origin'), '*');
const share = await fetch(`http://localhost:${PORT}/share?url=https%3A%2F%2Fyoutu.be%2Fabc`);
assert.equal(share.status, 200);
const search = await fetch(`http://localhost:${PORT}/api/search/youtube?q=cats`);
assert.equal(search.status, 501, 'search is off without a YouTube key');
const config = await (await fetch(`http://localhost:${PORT}/config`)).json();
assert.equal(config.youtubeSearch, false);
check.ok('add from anywhere: drop, play now, unknown rooms and links refused, share page served');

// ---- Watched includes every kind of media ----
for (const input of ['https://www.instagram.com/reel/C8abcdEFG/', 'https://www.netflix.com/watch/81234567']) {
  await a.ask('queue:add', { input, playNow: true });
  await wait(50);
  a.emit('countdown:start', { seconds: 3 });
  await new Promise((res) => b.once('go', res));
  await wait(50);
}
const kinds = b.last.history.map((h) => h.kind);
assert.ok(kinds.includes('instagram') && kinds.includes('stream') && kinds.includes('youtube'), `Watched has every kind: ${kinds}`);
check.ok('Watched lists everything played, whatever it is, rated or not');

// ---- everything that was on stays in Played ----
const playedBefore = a.last.played.map((p) => p.kind);
assert.ok(playedBefore.includes('youtube') && playedBefore.includes('vimeo'), `finished and skipped items are kept: ${playedBefore}`);
const again = a.last.played.find((p) => p.kind === 'vimeo');
a.emit('played:again', { id: again.id, now: false }); await wait(50);
assert.equal(b.last.queue.at(-1).kind, 'vimeo', 'Add back puts it at the end of Up next');
assert.notEqual(b.last.queue.at(-1).id, again.id, 'as a fresh copy');
a.emit('played:again', { id: again.id, now: true }); await wait(50);
assert.equal(b.last.current.kind, 'vimeo', 'Play again puts it on now');
assert.ok(b.last.countdown);
const count = a.last.played.length;
a.emit('queue:skip'); await wait(50);
a.emit('played:again', { id: a.last.played[0].id, now: true }); await wait(50);
a.emit('queue:skip'); await wait(50);
assert.ok(a.last.played.length <= count + 2, 'replaying doesn’t pile up duplicates');
a.emit('played:remove', { id: a.last.played[0].id }); await wait(50);
assert.ok(a.last.played.length < count + 2);
const localRoom = client(PORT, 'Lo', 'social-room-3');
await localRoom.joined;
await localRoom.ask('queue:addLocal', { name: 'Trip.mp4', size: 1000, fp: 'b'.repeat(64), duration: 60 });
await localRoom.ask('queue:add', { input: 'https://vimeo.com/76979871' });
localRoom.emit('queue:skip'); await wait(50);
assert.equal(localRoom.last.played[0].kind, 'local', 'files from your device stay too');
assert.equal(localRoom.last.played[0].fp, 'b'.repeat(64));
localRoom.disconnect();
a.emit('played:clear'); await wait(50);
assert.equal(b.last.played.length, 0);
check.ok('everything that was on stays in Played: play again, add back, remove, clear');

// ---- chat and history come back after a restart ----
const e = client(PORT, 'Ana', 'social-room-2', { cache: { queue: [], shows: [], played: [{ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Old one' }, { kind: 'bogus' }], chat: a.last ? [{ text: 'hi again', name: 'Ana', color: 'lamp', at: 1 }, { text: '' }] : [], history: [{ title: 'Big Buck Bunny', kind: 'vimeo', votes: [{ name: 'Ana', score: 9, color: 'lamp' }] }] } });
const je = await e.joined;
await wait(50);
assert.deepEqual(je.chat.map((m) => m.text), ['hi again']);
assert.equal(e.last.history[0].votes[0].score, 5, 'scores are clamped');
assert.deepEqual(e.last.played.map((p) => p.title), ['Old one'], 'Played restores too');
check.ok('chat and watch history restore from a returning viewer’s saved copy');

console.log(`\n${check.count} social checks passed\n`);
[a, b, e].forEach((s) => s.disconnect());
srv.kill();
process.exit(0);
