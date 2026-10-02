// Server checks for the sources that play inside the video box: Vimeo, Twitch,
// direct video links, Jellyfin, and Plex.
import assert from 'node:assert/strict';
import { startServer, client, wait, checker } from './helpers.js';

const PORT = 3998;
const srv = await startServer(PORT, { TWITCH_PARENT: 'couch.example.com, localhost' });
const check = checker();
const { ok } = check;

const config = await (await fetch(`http://localhost:${PORT}/config`)).json();
assert.deepEqual(config.twitchParent, ['couch.example.com', 'localhost']);
const hls = await fetch(`http://localhost:${PORT}/vendor/hls/hls.min.js`);
assert.equal(hls.status, 200);
ok('Twitch parent domains come from TWITCH_PARENT; hls.js is served');

const a = client(PORT, 'Gaytan', 'sources-room-1');
const b = client(PORT, 'Sam', 'sources-room-1');
const [joinA] = await Promise.all([a.joined, b.joined]);
assert.deepEqual(joinA.twitchParent, ['couch.example.com', 'localhost']);

let r = await a.ask('queue:add', { input: 'https://vimeo.com/76979871#t=30s' });
assert.ok(r.ok);
await wait(50);
assert.equal(b.last.current.kind, 'vimeo');
assert.equal(b.last.playback.position, 30);
b.emit('cmd:play', { position: 30 }); await wait(50);
assert.equal(a.last.playback.playing, true);
b.emit('cmd:seek', { position: 75 }); await wait(50);
assert.equal(a.last.playback.position, 75);
a.emit('cmd:pause', { position: 80 }); await wait(50);
assert.equal(b.last.playback.playing, false);
ok('Vimeo plays in the box and shares play, seek, and pause');

r = await a.ask('queue:add', { input: 'https://www.twitch.tv/somestreamer' });
assert.ok(r.ok);
r = await a.ask('queue:add', { input: 'https://example.com/films/night.mp4' });
await wait(50);
const [live, file] = a.last.queue;
assert.equal(live.title, 'somestreamer on Twitch');
assert.equal(file.title, 'night');
a.emit('queue:play', { id: live.id }); await wait(50);
assert.ok(a.last.countdown, 'videos in the box start on a short countdown');
a.emit('countdown:cancel'); await wait(50);
a.emit('cmd:play', { position: 0 }); await wait(50);
assert.equal(b.last.playback.playing, true);
const before = b.last.playback.position;
a.emit('cmd:seek', { position: 500 }); await wait(50);
assert.equal(b.last.playback.position, before, 'seeking a live stream is ignored');
a.emit('buffering', { on: true }); await wait(50);
assert.deepEqual(b.last.holds, ['Gaytan']);
a.emit('buffering', { on: false }); await wait(50);
ok('Twitch live shares play and buffering, ignores seeks');

a.emit('queue:skip'); await wait(80);
assert.equal(b.last.current.kind, 'file');
assert.ok(b.last.countdown, 'the next video in the box rolls on');
b.disconnect(); await wait(4500);
assert.equal(a.last.playback.playing, true, 'still playing after the countdown with one viewer left');
ok('direct video links queue, roll on after the one before, and play');

const c = client(PORT, 'Sam', 'sources-room-1');
await c.joined;
r = await c.ask('queue:add', { input: 'https://media.example.com/Items/0123456789abcdef0123456789abcdef/Download?api_key=SECRET' });
assert.ok(r.ok);
assert.equal(r.warnings.length, 1);
assert.match(r.warnings[0], /sign-in token/);
await wait(50);
assert.equal(a.last.queue.at(-1).kind, 'jellyfin');
assert.ok(a.last.queue.at(-1).src.includes('master.m3u8'));
r = await c.ask('queue:add', { input: 'https://app.plex.tv/desktop/#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F1' });
assert.match(r.error, /View XML/);
r = await c.ask('queue:add', { input: 'https://clips.twitch.tv/SomeClip' });
assert.match(r.error, /clips/);
ok('Jellyfin link comes back with a token warning; Plex web and Twitch clip links explain why not');

// TikTok plays in the box, synced.
r = await c.ask('queue:add', { input: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', playNow: true });
assert.ok(r.ok);
await wait(80);
assert.deepEqual([a.last.current.kind, a.last.current.videoId], ['tiktok', '6718335390845095173']);
await wait(3200); // its countdown
a.emit('cmd:seek', { position: 5 }); await wait(50);
assert.equal(c.last.playback.position, 5, 'TikTok shares seeks like any synced video');
ok('TikTok links play in the box, synced');

// A returning viewer's saved copy restores the new kinds too.
const saved = { queue: a.last.queue, shows: [], current: a.last.current };
const d = client(PORT, 'Gaytan', 'sources-room-2', { cache: saved });
await d.joined; await wait(50);
assert.deepEqual(d.last.queue.map((q) => q.kind), saved.queue.map((q) => q.kind));
assert.equal(d.last.current.kind, saved.current.kind);
ok('saved queues with the new kinds restore');

// Files from people's own devices: only a description is shared.
const FP = 'a'.repeat(64);
const e = client(PORT, 'Ana', 'sources-room-3');
const f = client(PORT, 'Ben', 'sources-room-3');
await Promise.all([e.joined, f.joined]);
r = await e.ask('queue:addLocal', { name: 'Home Movie.mp4', size: 123456789, mime: 'video/mp4', fp: FP, duration: 5400 });
assert.ok(r.ok);
await wait(50);
const local = f.last.current;
assert.deepEqual([local.kind, local.title, local.name, local.size, local.fp, local.duration], ['local', 'Home Movie', 'Home Movie.mp4', 123456789, FP, 5400]);
assert.equal(local.url, undefined, 'no link to the file is ever shared');
assert.deepEqual(f.last.members.find((m) => m.name === 'Ana').files, [FP], 'the adder can share it');
assert.deepEqual(f.last.members.find((m) => m.name === 'Ben').files, []);
f.emit('local:have', { fps: [FP, 'not-a-fingerprint'] }); await wait(50);
assert.deepEqual(e.last.members.find((m) => m.name === 'Ben').files, [FP]);
f.emit('cmd:play', { position: 10 }); await wait(50);
assert.equal(e.last.playback.playing, true, 'local files are synced like any video');
r = await e.ask('queue:addLocal', { name: 'x.mp4', size: 10, fp: 'short' });
assert.ok(r.error, 'a bad fingerprint is refused');
r = await e.ask('queue:addLocal', { name: '', size: 10, fp: FP });
assert.ok(r.error, 'a nameless file is refused');
ok('local files: description shared, who has a copy tracked, bad input refused');

// The Type a show box adds names as names, even ones that look like web addresses.
r = await e.ask('queue:add', { input: 'S.W.A.T.', service: 'Hulu', asName: true });
assert.ok(r.ok);
await wait(50);
assert.deepEqual([e.last.queue.at(-1).kind, e.last.queue.at(-1).title, e.last.queue.at(-1).service], ['stream', 'S.W.A.T.', 'Hulu']);
r = await e.ask('queue:add', { input: 'S.W.A.T.' });
assert.ok(r.error, 'the link box still treats it as an address');
ok('show names with dots work from the Type a show box');

console.log(`\n${check.count} source checks passed\n`);
[a, c, d, e, f].forEach((s) => s.disconnect());
srv.kill();
process.exit(0);
