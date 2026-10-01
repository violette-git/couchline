// Link parsing checks for public/media.js, which the server and the add form share.
import assert from 'node:assert/strict';
import { parseMedia, parseTime, mediaWarnings } from '../public/media.js';

let pass = 0;
const ok = (label) => { pass++; console.log('ok  ', label); };

assert.equal(parseTime('90'), 90);
assert.equal(parseTime('90s'), 90);
assert.equal(parseTime('1m30s'), 90);
assert.equal(parseTime('1h2m3s'), 3723);
assert.equal(parseTime('nonsense'), 0);
assert.equal(parseTime(''), 0);
ok('times like 1h2m3s become seconds');

let m = parseMedia('https://youtu.be/dQw4w9WgXcQ?t=1m5s');
assert.equal(m.kind, 'youtube');
assert.equal(m.start, 65);
ok('YouTube start times in 1m5s form are kept');

m = parseMedia('https://vimeo.com/76979871');
assert.deepEqual([m.kind, m.videoId, m.hash, m.url], ['vimeo', '76979871', null, 'https://vimeo.com/76979871']);
m = parseMedia('vimeo.com/76979871/8272103f6e#t=1m2s');
assert.deepEqual([m.videoId, m.hash, m.start, m.url], ['76979871', '8272103f6e', 62, 'https://vimeo.com/76979871/8272103f6e']);
m = parseMedia('https://player.vimeo.com/video/76979871?h=8272103f6e');
assert.equal(m.hash, '8272103f6e');
m = parseMedia('https://vimeo.com/channels/staffpicks/76979871');
assert.equal(m.videoId, '76979871');
m = parseMedia('https://vimeo.com/showcase/11111111/video/76979871');
assert.equal(m.videoId, '76979871');
assert.ok(parseMedia('https://vimeo.com/about').error);
ok('Vimeo public, unlisted, player, channel, and showcase links');

m = parseMedia('https://www.twitch.tv/videos/2250000000?t=1h0m5s');
assert.deepEqual([m.kind, m.live, m.videoId, m.start], ['twitch', false, '2250000000', 3605]);
m = parseMedia('twitch.tv/SomeStreamer');
assert.deepEqual([m.kind, m.live, m.channel, m.start], ['twitch', true, 'somestreamer', 0]);
m = parseMedia('https://player.twitch.tv/?video=v2250000000&parent=example.com');
assert.equal(m.videoId, '2250000000');
assert.ok(parseMedia('https://clips.twitch.tv/FunnyClipName').error);
assert.ok(parseMedia('https://www.twitch.tv/someone/clip/FunnyClipName').error);
assert.ok(parseMedia('https://www.twitch.tv/directory').error);
ok('Twitch videos and live channels; clips and site pages refused with a reason');

m = parseMedia('https://example.com/media/Big_Buck.Bunny.mp4?sig=abc');
assert.deepEqual([m.kind, m.format, m.title, m.http], ['file', 'mp4', 'Big Buck Bunny', false]);
assert.equal(parseMedia('https://cdn.example.com/a/clip.webm').format, 'webm');
m = parseMedia('http://192.168.1.20/live/index.m3u8');
assert.deepEqual([m.kind, m.format, m.http], ['file', 'hls', true]);
assert.equal(parseMedia('https://example.com/page.html'), null);
ok('direct .mp4, .webm, and .m3u8 links');

const JF_ID = '0123456789abcdef0123456789abcdef';
m = parseMedia(`https://media.example.com/Items/${JF_ID}/Download?api_key=SECRET1`);
assert.equal(m.kind, 'jellyfin');
assert.equal(m.tokenInLink, true);
assert.ok(m.src.startsWith(`https://media.example.com/Videos/${JF_ID}/master.m3u8?`));
assert.ok(m.src.includes('api_key=SECRET1'));
assert.ok(m.src.includes(`MediaSourceId=${JF_ID}`));
m = parseMedia(`http://192.168.1.5:8096/jellyfin/Videos/${JF_ID}/stream?static=true&ApiKey=SECRET2`);
assert.ok(m.src.startsWith(`http://192.168.1.5:8096/jellyfin/Videos/${JF_ID}/master.m3u8?`), 'keeps a base path');
assert.equal(m.http, true);
assert.ok(parseMedia(`https://media.example.com/web/index.html#!/details?id=${JF_ID}&serverId=x`).error.includes('Copy Stream URL'));
assert.ok(parseMedia(`https://media.example.com/Items/${JF_ID}/Download`).error, 'no token, nothing to play');
ok('Jellyfin stream links become HLS; page links and tokenless links explain what to paste');

m = parseMedia('https://10-0-0-5.abc123.plex.direct:32400/library/metadata/4242?checkFiles=1&X-Plex-Token=SECRET3');
assert.equal(m.kind, 'plex');
assert.equal(m.format, 'hls');
assert.ok(m.src.startsWith('https://10-0-0-5.abc123.plex.direct:32400/video/:/transcode/universal/start.m3u8?'));
assert.ok(m.src.includes('path=%2Flibrary%2Fmetadata%2F4242'));
assert.ok(m.src.includes('X-Plex-Token=SECRET3'));
m = parseMedia('http://192.168.1.5:32400/library/parts/77/1690000000/file.mp4?X-Plex-Token=SECRET4');
assert.deepEqual([m.kind, m.format, m.src], ['plex', 'file', 'http://192.168.1.5:32400/library/parts/77/1690000000/file.mp4?X-Plex-Token=SECRET4']);
assert.ok(parseMedia('https://app.plex.tv/desktop/#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F4242').error.includes('View XML'));
ok('Plex metadata links become HLS, part links play directly, web app links explain what to paste');

assert.equal(parseMedia('https://www.netflix.com/watch/81234567').service, 'Netflix');
assert.equal(parseMedia('Severance S2E3').title, 'Severance S2E3');
assert.equal(parseMedia('javascript:alert(1)')?.kind, 'stream', 'not treated as a link');
ok('Netflix links and typed names still work');

m = parseMedia(`https://media.example.com/Items/${JF_ID}/Download?api_key=SECRET1`);
assert.equal(mediaWarnings(m).length, 1);
assert.match(mediaWarnings(m)[0], /Jellyfin sign-in token/);
assert.match(mediaWarnings(parseMedia('http://192.168.1.5:32400/library/parts/77/1/file.mp4?X-Plex-Token=x'), { secure: true }).join(' '), /Plex token.*http/s);
assert.equal(mediaWarnings(parseMedia('https://vimeo.com/76979871'), { secure: true }).length, 0);
for (const w of [...mediaWarnings(m), ...mediaWarnings(parseMedia('http://h:32400/library/parts/1/2/f.mp4?X-Plex-Token=x'), { secure: true })]) {
  assert.ok(!w.includes(String.fromCharCode(0x2014)), 'no em dashes in UI text');
}
ok('token links and http links on https come with warnings');

console.log(`\n${pass} link checks passed\n`);
