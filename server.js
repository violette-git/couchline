// Couchline server: rooms, shared playback state, queue, show tracker, buffering holds,
// a relay for WebRTC call signaling, chat and the room's social extras, and a small HTTP
// API so the browser extension and phone share sheets can add things without a link paste.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { parseMedia, mediaWarnings, IN_BOX, EXT_SERVICES } from './public/media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // empty rooms are kept 12 hours
const HOLD_LIMIT_MS = 20000; // stop waiting on a buffering viewer after 20s
const MEMBER_COLORS = ['lamp', 'rose', 'sky', 'mint', 'lilac', 'lime', 'orchid', 'iris'];
// Every person in the call connects to every other, so cameras are capped. The first five
// people with a camera are on video; anyone past that is on audio until a spot opens.
const VIDEO_SLOTS = 5;
const SERVICES = ['Netflix', 'Hulu', 'Other'];
const REACTIONS = ['😂', '😮', '😭', '😍', '👀', '🙌'];
// Twitch only plays inside pages on the domains listed here (comma separated, no scheme or port).
const TWITCH_PARENT = (process.env.TWITCH_PARENT || 'localhost').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
// Optional: a YouTube Data API key turns on YouTube search inside Couchline.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const CHAT_MAX = 200;
const AWAY_PAUSE_MS = Number(process.env.AWAY_PAUSE_MS ?? 8000); // "Pause when someone steps away" waits this long first
const RATING_TIMEOUT_MS = 10 * 60 * 1000;

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/hls', express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist')));
app.use('/vendor/qrcode', express.static(path.join(__dirname, 'node_modules', 'qrcode-generator')));
app.get('/config', (_req, res) => res.json({ iceServers: iceServers(), twitchParent: TWITCH_PARENT, youtubeSearch: !!YOUTUBE_API_KEY }));
app.get('/r/:roomId', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// The phone share sheet (Android, or an iPhone Shortcut) opens /share?url=..., and the page
// adds it to the last room this device was in.
app.get('/share', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- the browser extension, as a download ----------
// Zipped straight from the extension folder of whatever is deployed, so it's never stale.
// The zip also carries this site's address (defaults.json), so the extension starts out
// pointed at the right Couchline and people only add their room code and name.
const EXT_DIR = path.join(__dirname, 'extension');
const EXT_VERSION = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8')).version;
let extFiles = null;
function extensionFiles() {
  if (extFiles) return extFiles;
  extFiles = {};
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else extFiles[`couchline-extension/${path.relative(EXT_DIR, full).split(path.sep).join('/')}`] = new Uint8Array(fs.readFileSync(full));
    }
  };
  walk(EXT_DIR);
  return extFiles;
}
const extZips = new Map(); // site address -> zip
function extensionZip(origin) {
  if (!extZips.has(origin)) {
    if (extZips.size > 20) extZips.clear();
    const defaults = strToU8(`${JSON.stringify({ server: origin }, null, 2)}\n`);
    extZips.set(origin, Buffer.from(zipSync({ ...extensionFiles(), 'couchline-extension/defaults.json': defaults }, { level: 9 })));
  }
  return extZips.get(origin);
}
const siteOrigin = (req) => {
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = str(req.get('host'), 200).replace(/[^\w.:-]/g, '');
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
};
app.get('/couchline-extension.zip', (req, res) => {
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="couchline-extension.zip"', 'Cache-Control': 'no-cache' });
  res.send(extensionZip(siteOrigin(req)));
});
app.get('/extension', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'extension.html')));
app.get('/extension/info', (req, res) => res.json({ version: EXT_VERSION, size: extensionZip(siteOrigin(req)).length }));

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 1e5 });

function iceServers() {
  const list = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URLS) {
    list.push({
      urls: process.env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }
  return list;
}

// ---------- small helpers ----------
const newId = () => crypto.randomBytes(6).toString('hex');
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, min, max, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// Link parsing lives in public/media.js so the add form can preview links with the same rules.

const DEFAULT_TITLES = { youtube: 'YouTube video', vimeo: 'Vimeo video', file: 'Video', jellyfin: 'Jellyfin video', plex: 'Plex video', local: 'Video file' };
const FINGERPRINT = /^[0-9a-f]{64}$/;
const POSTER = /^https:\/\/static\.tvmaze\.com\/[\w./-]+$/; // show posters come from TVmaze
// The Netflix or Hulu title in a watch link, used to tell episodes apart.
const watchId = (url) => (String(url || '').match(/\/watch\/([\w-]+)/) || [])[1] || null;
function defaultTitle(m) {
  if (DEFAULT_TITLES[m.kind]) return DEFAULT_TITLES[m.kind];
  if (m.kind === 'twitch') return m.live ? `${m.channel} on Twitch` : 'Twitch video';
  if (m.kind === 'instagram') return m.igType === 'p' ? 'Instagram post' : 'Instagram reel';
  return m.service ? `${m.service} title` : 'Untitled';
}

// Rebuilds an item from untrusted input so only known fields survive.
function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let base;
  if (raw.kind === 'stream') {
    const linked = raw.url ? parseMedia(raw.url) : null;
    base = {
      kind: 'stream',
      service: SERVICES.includes(raw.service) ? raw.service : linked?.service || null,
      url: linked?.kind === 'stream' && linked.url ? linked.url : null,
      poster: POSTER.test(str(raw.poster, 300)) ? str(raw.poster, 300) : null,
    };
  } else if (raw.kind === 'local') {
    // A file on each person's own device. Only its description is shared, never the file.
    base = {
      kind: 'local',
      name: str(raw.name, 200),
      size: num(raw.size, 0, 1e13, 0),
      fp: FINGERPRINT.test(raw.fp) ? raw.fp : null,
      mime: /^video\/[\w.+-]{1,40}$/.test(raw.mime) ? raw.mime : null,
      start: 0,
    };
    if (!base.name || !base.size || !base.fp) return null;
  } else {
    base = parseMedia(raw.url);
    if (!base?.kind || base.kind === 'stream') return null;
    if ('start' in base && !base.start && !base.live) base.start = num(raw.start, 0, 1e6, 0);
    if (base.kind === 'vimeo' && /^https:\/\/i\.vimeocdn\.com\/[\w./-]+$/.test(str(raw.thumb, 300))) base.thumb = str(raw.thumb, 300);
  }
  return {
    ...base,
    id: str(raw.id, 20) || newId(),
    title: str(raw.title, 140) || defaultTitle(base),
    season: raw.season != null && raw.season !== '' ? num(raw.season, 0, 99, null) : null,
    episode: raw.episode != null && raw.episode !== '' ? num(raw.episode, 0, 999, null) : null,
    showId: str(raw.showId, 20) || null,
    addedBy: str(raw.addedBy, 24) || null,
    duration: num(raw.duration, 0, 1e6, 0) || null,
  };
}

function cleanShow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = str(raw.title, 80);
  if (!title) return null;
  return {
    id: str(raw.id, 20) || newId(),
    title,
    service: SERVICES.includes(raw.service) ? raw.service : 'Other',
    season: num(raw.season, 1, 99, 1),
    episode: num(raw.episode, 1, 999, 1),
    updatedBy: str(raw.updatedBy, 24) || null,
    poster: POSTER.test(str(raw.poster, 300)) ? str(raw.poster, 300) : null,
  };
}

// Title (and for Vimeo, a thumbnail) from the site's public oEmbed endpoint.
const OEMBED = {
  youtube: (it) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(it.url)}`,
  vimeo: (it) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(it.url)}`,
};
async function oembed(item) {
  try {
    const r = await fetch(OEMBED[item.kind](item), { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const j = await r.json();
    const thumb = str(j.thumbnail_url, 300);
    return { title: str(j.title, 140) || null, thumb: /^https:\/\/i\.vimeocdn\.com\//.test(thumb) ? thumb : null };
  } catch {
    return null;
  }
}

// ---------- rooms ----------
const rooms = new Map();

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId, fresh: true, current: null, queue: [], shows: [], countdown: null,
      playback: { playing: false, position: 0, at: Date.now(), fresh: true },
      members: new Map(), holds: new Map(), heldPause: false,
      countdownTimer: null, cleanup: null, driftTimer: null, extSyncFor: null,
      chat: [], moments: [], ready: null, rating: null, ratingTimer: null, history: [], follow: null, played: [],
      settings: { pauseOnAway: false },
    };
    rooms.set(roomId, room);
  }
  clearTimeout(room.cleanup);
  room.cleanup = null;
  return room;
}

// Position right now. "at" can be in the future during a countdown, which means "not started yet".
const posNow = (room) => {
  const p = room.playback;
  return p.playing ? p.position + Math.max(0, Date.now() - p.at) / 1000 : p.position;
};
// "fresh" means nobody has pressed play, pause, or seek on this item yet. The extension
// uses it to leave each person where they are until someone starts playback.
const setPlayback = (room, playing, position, at = Date.now(), fresh = false) => {
  room.playback = { playing, position: Math.max(0, position), at, fresh };
  // Played for real (not just scheduled by a countdown), so it gets a rating when it ends.
  if (playing && room.current && at <= Date.now()) markWatched(room, room.current);
};

const inBox = (room) => IN_BOX.includes(room.current?.kind);
// A Netflix or Hulu item plays in sync when every viewer (everyone who isn't a remote)
// is in the room through the Couchline extension on that service.
function extSynced(room) {
  const cur = room.current;
  if (cur?.kind !== 'stream' || !EXT_SERVICES.includes(cur.service)) return false;
  const viewers = [...room.members.values()].filter((m) => !m.remote);
  return viewers.length > 0 && viewers.every((m) => m.ext === cur.service);
}
// Synced means the server's playback state drives every screen.
const synced = (room) => inBox(room) || extSynced(room);
// Whether this member's screen is playing the current item, so their dropping off should pause the room.
function isWatching(room, m) {
  if (m.remote) return false;
  if (inBox(room)) return !m.ext;
  return extSynced(room);
}

// Camera spots go to people with a camera, in the order they joined the call.
function videoSeats(room) {
  return new Set([...room.members.values()]
    .filter((m) => m.inCall && m.cam)
    .sort((a, b) => a.callSince - b.callSince)
    .slice(0, VIDEO_SLOTS)
    .map((m) => m.id));
}

function publicState(room) {
  const onVideo = videoSeats(room);
  return {
    id: room.id,
    current: room.current,
    playback: room.playback,
    extSync: extSynced(room),
    queue: room.queue,
    played: room.played,
    shows: room.shows,
    countdown: room.countdown,
    members: [...room.members.values()].map((m) => ({
      id: m.id, name: m.name, color: m.color, remote: m.remote, ext: m.ext, inCall: m.inCall, drift: m.drift, files: m.files, away: m.away,
      video: m.inCall ? onVideo.has(m.id) : null,
      camOn: m.inCall ? !!m.live : null,
    })),
    holds: [...room.holds.keys()].map((cid) => room.members.get(cid)?.name).filter(Boolean),
    moments: room.moments,
    ready: room.ready,
    rating: publicRating(room.rating),
    history: room.history,
    follow: room.follow,
    settings: room.settings,
    serverNow: Date.now(),
  };
}
const toast = (room, text, by) => io.to(room.id).emit('toast', { text, color: by?.color || null });

// Scores stay hidden until everyone has answered, then reveal together.
function publicRating(r) {
  if (!r) return null;
  const votes = Object.values(r.votes);
  return {
    itemId: r.itemId, item: r.item, revealed: r.revealed,
    answered: votes.map((v) => v.id),
    votes: r.revealed ? votes.filter((v) => v.score) : null,
  };
}
function broadcast(room) {
  // Extension sync turning on pauses the room without moving anyone, so nobody jumps to a
  // stale position. The next play, from whoever presses it, brings everyone to that spot.
  const extFor = extSynced(room) ? room.current.id : null;
  if (extFor !== room.extSyncFor) {
    if (extFor) {
      clearHolds(room);
      setPlayback(room, false, posNow(room), Date.now(), true);
      toast(room, `Everyone has the extension, so ${room.current.service} is synced. Press play on ${room.current.service} to start everyone from your spot.`);
    } else if (room.extSyncFor && room.extSyncFor === room.current?.id) {
      toast(room, 'Not everyone is on the extension, so this one is back to the shared countdown.');
    }
    room.extSyncFor = extFor;
  }
  io.to(room.id).emit('state', publicState(room));
}

function pickColor(room) {
  const used = new Set([...room.members.values()].map((m) => m.color));
  return MEMBER_COLORS.find((c) => !used.has(c)) || MEMBER_COLORS[room.members.size % MEMBER_COLORS.length];
}

function clearCountdown(room) {
  clearTimeout(room.countdownTimer);
  room.countdownTimer = null;
  room.countdown = null;
}

function clearHolds(room) {
  for (const t of room.holds.values()) clearTimeout(t);
  room.holds.clear();
  room.heldPause = false;
}

// Everything that was on stays in "Played", newest first, so it's easy to go back to.
const PLAYED_MAX = 50;
const sameThing = (a, b) => a.kind === b.kind && (a.fp || a.url || a.title) === (b.fp || b.url || b.title) && a.episode === b.episode && a.season === b.season;
function archive(room, item) {
  if (!item) return;
  const { watched: _watched, ...kept } = item;
  room.played = [kept, ...room.played.filter((p) => p.id !== item.id && !sameThing(p, item))].slice(0, PLAYED_MAX);
}

function setCurrent(room, item) {
  clearCountdown(room);
  clearHolds(room);
  room.ready = null;
  if (room.current && room.current !== item) archive(room, room.current);
  room.current = item;
  for (const m of room.members.values()) m.drift = null; // drift was about the previous item
  setPlayback(room, false, item?.start || 0, Date.now(), true);
}

// Both screens count down together. For synced items the server schedules playback to begin
// at launchAt, so each client starts on its own synced clock instead of waiting for a message.
// "from" lets the extension start a fresh item from the starter's own spot.
function startCountdown(room, seconds, by, from = null) {
  if (!room.current) return;
  clearCountdown(room);
  const launchAt = Date.now() + seconds * 1000;
  const itemId = room.current.id;
  if (synced(room)) {
    const pos = room.playback.fresh && from != null ? from : room.playback.playing ? posNow(room) : room.playback.position;
    setPlayback(room, true, pos, launchAt);
  }
  room.countdown = { launchAt, itemId, color: by?.color || null };
  room.countdownTimer = setTimeout(() => {
    room.countdownTimer = null;
    room.countdown = null;
    // Synced items start playing now; countdown items (Netflix or Hulu without the extension,
    // Instagram) are started by each person at this moment. Either way, it's being watched.
    if (room.current?.id === itemId) markWatched(room, room.current);
    broadcast(room);
    io.to(room.id).emit('go', { itemId });
  }, seconds * 1000);
}

// A Netflix or Hulu episode from the Shows tab finished, so the show moves on one episode.
function finishEpisode(room, item, by) {
  const show = item?.showId && room.shows.find((s) => s.id === item.showId);
  if (!show || item.kind !== 'stream') return;
  show.episode = Math.min(999, (item.episode || show.episode) + 1);
  show.updatedBy = by?.name || null;
}

// Starts the current item from the top, playing or paused as before (used when an episode rolls on).
function keepPlaying(room, playing = true) {
  setPlayback(room, playing, 0);
  room.extSyncFor = extSynced(room) ? room.current.id : null; // skip the "sync just turned on" pause
}

// When something everyone actually watched ends, everyone rates it; scores reveal together.
// What the Watched list and ratings keep about an item.
const snapshot = (item) => ({
  id: item.id, title: item.title, kind: item.kind, videoId: item.videoId || null, thumb: item.thumb || null, poster: item.poster || null,
  service: item.service || null, live: !!item.live, channel: item.channel || null, url: item.kind === 'local' ? null : item.url || null,
  season: item.season || null, episode: item.episode || null, igType: item.igType || null, code: item.code || null,
});
// Anything actually played goes into Watched right away, whatever it is; ratings join it later.
function markWatched(room, item) {
  item.watched = true;
  if (room.history.some((h) => h.id === item.id)) return;
  room.history.unshift({ ...snapshot(item), at: Date.now(), votes: [] });
  room.history = room.history.slice(0, 50);
}

function startRating(room, item) {
  if (!item?.watched) return;
  clearTimeout(room.ratingTimer);
  room.rating = { itemId: item.id, votes: {}, revealed: false, item: snapshot(item) };
  room.ratingTimer = setTimeout(() => revealRating(room), RATING_TIMEOUT_MS);
}
function revealRating(room) {
  const r = room.rating;
  if (!r || r.revealed) return;
  clearTimeout(room.ratingTimer);
  r.revealed = true;
  const scores = Object.values(r.votes).filter((v) => v.score);
  const entry = room.history.find((h) => h.id === r.itemId);
  if (entry) entry.votes = scores;
  else room.history.unshift({ ...r.item, at: Date.now(), votes: scores });
  room.history = room.history.slice(0, 50);
  broadcast(room);
}
function maybeReveal(room) {
  const r = room.rating;
  if (!r || r.revealed) return;
  const viewers = [...room.members.values()].filter((m) => !m.remote);
  if (viewers.length && viewers.every((m) => r.votes[m.id])) revealRating(room);
}

function advance(room, by) {
  startRating(room, room.current);
  const next = room.queue.shift() || null;
  setCurrent(room, next);
  // Videos in the box roll straight on after a short countdown. Instagram and streaming
  // services wait for someone to tap Start together, since each person has to open them.
  if (IN_BOX.includes(next?.kind)) startCountdown(room, 5, by);
}

function updateHolds(room) {
  if (room.holds.size && room.playback.playing && Date.now() >= room.playback.at) {
    setPlayback(room, false, posNow(room));
    room.heldPause = true;
  } else if (!room.holds.size && room.heldPause) {
    room.heldPause = false;
    setPlayback(room, true, room.playback.position);
  }
}

function adoptCache(room, cache) {
  const items = Array.isArray(cache.queue) ? cache.queue.slice(0, 100).map(cleanItem).filter(Boolean) : [];
  const shows = Array.isArray(cache.shows) ? cache.shows.slice(0, 50).map(cleanShow).filter(Boolean) : [];
  room.queue = items;
  room.shows = shows;
  room.chat = Array.isArray(cache.chat) ? cache.chat.slice(-100).map(cleanChat).filter(Boolean) : [];
  room.history = Array.isArray(cache.history) ? cache.history.slice(0, 50).map(cleanHistory).filter(Boolean) : [];
  room.played = Array.isArray(cache.played) ? cache.played.slice(0, PLAYED_MAX).map(cleanItem).filter(Boolean) : [];
  const cur = cleanItem(cache.current);
  if (cur) setCurrent(room, cur);
}

function cleanChat(m) {
  if (!m || typeof m !== 'object' || !str(m.text, 500)) return null;
  return {
    id: str(m.id, 20) || newId(), from: str(m.from, 40) || null, name: str(m.name, 24) || 'Someone',
    color: MEMBER_COLORS.includes(m.color) ? m.color : null, text: str(m.text, 500),
    at: num(m.at, 0, 1e15, Date.now()), pos: m.pos == null ? null : num(m.pos, 0, 1e6, 0), itemId: str(m.itemId, 20) || null,
  };
}
function cleanHistory(h) {
  if (!h || typeof h !== 'object' || !str(h.title, 140)) return null;
  const votes = Array.isArray(h.votes) ? h.votes.slice(0, 8).map((v) => ({
    id: str(v?.id, 40), name: str(v?.name, 24), color: MEMBER_COLORS.includes(v?.color) ? v.color : null, score: num(v?.score, 1, 5, 3),
  })) : [];
  return {
    id: str(h.id, 20), title: str(h.title, 140), kind: str(h.kind, 20), service: str(h.service, 20) || null,
    videoId: /^[\w-]{6,20}$/.test(h.videoId) ? h.videoId : null, thumb: /^https:\/\/i\.vimeocdn\.com\//.test(h.thumb) ? h.thumb : null,
    live: !!h.live, channel: str(h.channel, 25) || null, at: num(h.at, 0, 1e15, Date.now()), votes,
    poster: POSTER.test(str(h.poster, 300)) ? str(h.poster, 300) : null,
    url: h.url && parseMedia(h.url)?.url ? parseMedia(h.url).url : null,
    season: h.season ? num(h.season, 0, 99, null) : null, episode: h.episode ? num(h.episode, 0, 999, null) : null,
    igType: h.igType === 'p' ? 'p' : h.igType === 'reel' ? 'reel' : null, code: /^[\w-]{5,40}$/.test(h.code || '') ? h.code : null,
  };
}

// Puts a pasted link (or a show name) into a room. Used by the add form, the extension's
// "Add to Couchline", and the phone share sheet.
function addToRoom(room, { input, service, title, asName, playNow, poster, season, episode }, by) {
  const media = asName ? (str(input, 120) ? { kind: 'stream', title: str(input, 120) } : null) : parseMedia(input);
  if (media?.error) return { error: media.error };
  if (!media) return { error: 'That link isn’t supported. Paste a YouTube, Vimeo, Twitch, Instagram, Netflix, Hulu, Jellyfin, Plex, or video file link, or type a show name.' };
  if (room.queue.length >= 100) return { error: 'Up next is full. Remove something first.' };
  const item = cleanItem({ ...media, service: media.service || service, title: media.title || str(title, 140), addedBy: by.name, poster, season, episode });
  if (!item) return { error: 'That link isn’t supported.' };
  const putOn = !room.current || !!playNow;
  if (putOn) {
    if (room.current && playNow) advanceTo(room, item, by);
    else setCurrent(room, item);
  } else {
    room.queue.push(item);
  }
  broadcast(room);
  toast(room, putOn ? `${by.name} put on ${item.title}` : `${by.name} added ${item.title}`, by);
  if (OEMBED[item.kind]) {
    oembed(item).then((r) => {
      if (!r) return;
      if (r.title) item.title = r.title;
      if (r.thumb) item.thumb = r.thumb;
      broadcast(room);
    });
  }
  return { ok: true, item, warnings: mediaWarnings(item) };
}
// "Play now": the current item gets rated if it was watched, and the new one starts on a countdown.
function advanceTo(room, item, by) {
  startRating(room, room.current);
  setCurrent(room, item);
  if (IN_BOX.includes(item.kind)) startCountdown(room, 3, by);
}

// Someone shared their Instagram scrolling (from the extension): show that post to the room.
function followTo(room, url, by) {
  const media = parseMedia(url);
  if (media?.kind !== 'instagram') return { error: 'Only Instagram posts and reels can be followed.' };
  const starting = !room.follow;
  if (starting && synced(room) && room.playback.playing) setPlayback(room, false, posNow(room));
  room.follow = { name: by.name, color: by.color || null, url: media.url, igType: media.igType, code: media.code, at: Date.now() };
  // If the sharer closes Instagram without stopping, sharing ends after a while on its own.
  clearTimeout(room.followTimer);
  room.followTimer = setTimeout(() => { room.follow = null; broadcast(room); }, 30 * 60 * 1000);
  broadcast(room);
  if (starting) toast(room, `${by.name} is sharing their Instagram scrolling`, by);
  return { ok: true };
}

// ---------- HTTP API (extension and share sheet) ----------
// The room code is the only key, the same as joining by link, so these accept any origin.
const httpBuckets = new Map();
function httpLimited(req) {
  const key = req.ip || 'x';
  const now = Date.now();
  const b = httpBuckets.get(key) || { count: 0, since: now };
  if (now - b.since > 10000) { b.count = 0; b.since = now; }
  b.count++;
  httpBuckets.set(key, b);
  if (httpBuckets.size > 5000) httpBuckets.clear();
  return b.count > 40;
}
app.use('/api', (req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (httpLimited(req)) return res.status(429).json({ error: 'Too many requests. Wait a moment.' });
  next();
});
app.use('/api', express.json({ limit: '10kb' }));
const apiRoom = (req, res) => {
  const roomId = str(req.body?.room, 40).toLowerCase();
  const room = rooms.get(roomId);
  if (!room || !room.members.size) {
    res.status(404).json({ error: 'Nobody is in that room right now. Open Couchline and join it first.' });
    return null;
  }
  return room;
};
const apiBy = (room, req) => {
  const name = str(req.body?.name, 24) || 'Someone';
  const member = [...room.members.values()].find((m) => m.name.toLowerCase() === name.toLowerCase());
  return { name, color: member?.color || null };
};
app.post('/api/drop', (req, res) => {
  const room = apiRoom(req, res);
  if (!room) return;
  const r = addToRoom(room, { input: req.body.input, playNow: !!req.body.play }, apiBy(room, req));
  res.status(r.error ? 400 : 200).json(r.error ? { error: r.error } : { ok: true, title: r.item.title, warnings: r.warnings });
});
app.post('/api/follow', (req, res) => {
  const room = apiRoom(req, res);
  if (!room) return;
  const r = followTo(room, req.body.url, apiBy(room, req));
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/follow/stop', (req, res) => {
  const room = apiRoom(req, res);
  if (!room) return;
  if (room.follow) {
    room.follow = null;
    broadcast(room);
  }
  res.json({ ok: true });
});
// YouTube search, when a key is set. Results are cached briefly to save quota.
const searchCache = new Map();
app.get('/api/search/youtube', async (req, res) => {
  if (!YOUTUBE_API_KEY) return res.status(501).json({ error: 'YouTube search isn’t set up on this server.' });
  const q = str(req.query.q, 100);
  if (!q) return res.json({ results: [] });
  const hit = searchCache.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return res.json({ results: hit.results });
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&safeSearch=moderate&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: 'YouTube search didn’t answer. Try again in a moment.' });
    const j = await r.json();
    const results = (j.items || []).filter((it) => it.id?.videoId).map((it) => ({
      videoId: it.id.videoId, title: str(it.snippet?.title, 140), channel: str(it.snippet?.channelTitle, 80), live: it.snippet?.liveBroadcastContent === 'live',
    }));
    searchCache.set(q.toLowerCase(), { at: Date.now(), results });
    if (searchCache.size > 300) searchCache.clear();
    res.json({ results });
  } catch {
    res.status(502).json({ error: 'YouTube search didn’t answer. Try again in a moment.' });
  }
});

// ---------- sockets ----------
io.on('connection', (socket) => {
  let room = null;
  let me = null;
  let bucket = { count: 0, since: Date.now() };

  // Call and file-sharing setup messages come in bursts (several per person in the call),
  // so they get their own, larger allowance; everything else shares the smaller one.
  let signalBucket = { count: 0, since: Date.now() };
  const limited = (event) => {
    const now = Date.now();
    if (event === 'signal') {
      if (now - signalBucket.since > 1000) signalBucket = { count: 0, since: now };
      return ++signalBucket.count > 400;
    }
    if (now - bucket.since > 1000) bucket = { count: 0, since: now };
    return ++bucket.count > 40;
  };
  const on = (event, fn) => socket.on(event, (data, cb) => {
    if (!room || !me || limited(event)) return;
    try {
      fn(data || {}, typeof cb === 'function' ? cb : () => {});
    } catch (err) {
      console.error(event, err);
    }
  });
  const isSynced = () => synced(room);
  const canSeek = () => isSynced() && !room.current.live; // live streams have no timeline to share

  socket.on('time:ping', (cb) => typeof cb === 'function' && cb(Date.now()));

  socket.on('join', (data = {}, cb = () => {}) => {
    if (room || typeof data !== 'object') return;
    const roomId = str(data.roomId, 40).toLowerCase();
    if (!/^[a-z0-9-]{3,40}$/.test(roomId)) return typeof cb === 'function' && cb({ error: 'That room code is not valid.' });
    room = getRoom(roomId);
    if (room.fresh && data.cache && typeof data.cache === 'object') adoptCache(room, data.cache);
    room.fresh = false;
    const clientId = str(data.clientId, 40) || newId();
    const previous = room.members.get(clientId);
    me = {
      id: clientId, socketId: socket.id, name: str(data.name, 24) || 'Guest',
      color: previous?.color || pickColor(room), remote: !!data.remote, inCall: false, drift: null,
      // Set when this seat is the Couchline extension running on a Netflix or Hulu page.
      ext: EXT_SERVICES.includes(data.ext) ? data.ext : null,
      files: [], // fingerprints of local video files this seat can play (and share)
    };
    room.members.set(clientId, me);
    socket.join(roomId);
    if (typeof cb === 'function') cb({ ok: true, clientId, iceServers: iceServers(), twitchParent: TWITCH_PARENT, youtubeSearch: !!YOUTUBE_API_KEY, chat: room.chat.slice(-100) });
    broadcast(room);
    if (!previous) toast(room, `${me.name} joined`, me);
  });

  // A web seat can turn itself into a remote, so it stops counting as a viewer.
  on('member:remote', (d) => {
    me.remote = !!d.on;
    broadcast(room);
  });

  // ----- playback (everything in the video box, plus Netflix and Hulu through the extension) -----
  on('cmd:play', (d) => {
    if (!isSynced()) return;
    clearCountdown(room);
    clearHolds(room);
    setPlayback(room, true, num(d.position, 0, 1e6, posNow(room)));
    broadcast(room);
    toast(room, `${me.name} pressed play`, me);
  });
  on('cmd:pause', (d) => {
    if (!isSynced()) return;
    clearCountdown(room);
    clearHolds(room);
    setPlayback(room, false, num(d.position, 0, 1e6, posNow(room)));
    broadcast(room);
    toast(room, `${me.name} paused at ${fmt(room.playback.position)}`, me);
  });
  on('cmd:seek', (d) => {
    if (!canSeek()) return;
    const p = num(d.position, 0, 1e6, posNow(room));
    const playing = room.playback.playing || room.heldPause;
    clearCountdown(room);
    clearHolds(room);
    setPlayback(room, playing, p);
    broadcast(room);
    toast(room, `${me.name} jumped to ${fmt(p)}`, me);
  });
  on('media:meta', (d) => {
    if (room.current && room.current.id === d.itemId && !room.current.duration) {
      room.current.duration = num(d.duration, 0, 1e6, 0) || null;
      broadcast(room);
    }
  });
  on('media:ended', (d) => {
    if (!room.current || room.current.id !== d.itemId) return; // someone else already advanced
    finishEpisode(room, room.current, me);
    advance(room, me);
    broadcast(room);
  });
  // Netflix or Hulu moved on to another title by itself (the next episode, usually).
  // Every extension tab reports it; the first report wins, like media:ended.
  on('ext:next', (d) => {
    const cur = room.current;
    if (!cur || cur.id !== d.itemId || !extSynced(room)) return;
    const next = parseMedia(d.url);
    if (next?.kind !== 'stream' || next.service !== cur.service || watchId(next.url) === watchId(cur.url)) return;
    finishEpisode(room, cur, me);
    // Autoplay rolls on mid-playback. Picking another title while paused leaves everyone paused.
    const wasPlaying = room.playback.playing || room.heldPause;
    const queued = room.queue[0];
    if (queued) {
      advance(room, me);
      // The queue held this very episode, so carry on playing instead of pausing everyone.
      if (queued.kind === 'stream' && queued.service === cur.service && watchId(queued.url) === watchId(next.url)) keepPlaying(room, wasPlaying);
      toast(room, `${cur.service} moved on, so the room moved to ${queued.title}`);
    } else {
      // Nothing queued: follow the new episode so the binge stays in sync.
      startRating(room, cur);
      setCurrent(room, cleanItem({
        kind: 'stream', service: cur.service, url: next.url, title: cur.title, season: cur.season,
        episode: cur.episode ? cur.episode + 1 : null, showId: cur.showId, addedBy: cur.addedBy,
      }));
      keepPlaying(room, wasPlaying);
      toast(room, `${cur.service} moved on to the next episode. Still in sync.`);
    }
    broadcast(room);
  });
  on('buffering', (d) => {
    if (!isSynced()) return;
    clearTimeout(room.holds.get(me.id));
    if (d.on) {
      room.holds.set(me.id, setTimeout(() => {
        room.holds.delete(me.id);
        updateHolds(room);
        broadcast(room);
      }, HOLD_LIMIT_MS));
    } else {
      room.holds.delete(me.id);
    }
    updateHolds(room);
    broadcast(room);
  });
  on('drift', (d) => {
    me.drift = num(d.value, -1e4, 1e4, null);
    room.driftTimer ||= setTimeout(() => { room.driftTimer = null; broadcast(room); }, 2000);
  });

  // ----- countdown (Instagram, Netflix, Hulu, and "play now" for the video box) -----
  on('countdown:start', (d) => {
    if (!room.current) return;
    startCountdown(room, num(d.seconds, 3, 10, 5), me, d.position != null ? num(d.position, 0, 1e6, 0) : null);
    broadcast(room);
  });
  on('countdown:cancel', () => {
    if (!room.countdown) return;
    clearCountdown(room);
    if (isSynced()) setPlayback(room, false, room.playback.position);
    broadcast(room);
    toast(room, `${me.name} cancelled the countdown`, me);
  });

  // ----- queue -----
  // "asName" comes from the Type a show box, so "S.W.A.T." isn't mistaken for a web address.
  on('queue:add', (d, cb) => {
    const r = addToRoom(room, { input: d.input, service: d.service, title: d.title, asName: d.asName, playNow: d.playNow, poster: d.poster, season: d.season, episode: d.episode }, me);
    cb(r.error ? { error: r.error } : { ok: true, warnings: r.warnings });
  });
  // A video file on the adder's device. Others pick their own copy or get it from someone who has it.
  on('queue:addLocal', (d, cb) => {
    if (room.queue.length >= 100) return cb({ error: 'Up next is full. Remove something first.' });
    const item = cleanItem({ kind: 'local', name: d.name, size: d.size, fp: d.fp, mime: d.mime, duration: d.duration, title: str(d.name, 140).replace(/\.[\w]{2,5}$/, ''), addedBy: me.name });
    if (!item) return cb({ error: 'That file couldn’t be added.' });
    if (!me.files.includes(item.fp)) me.files = [...me.files, item.fp].slice(-20);
    const putOn = !room.current;
    if (putOn) setCurrent(room, item);
    else room.queue.push(item);
    broadcast(room);
    cb({ ok: true });
    toast(room, putOn ? `${me.name} put on ${item.title}` : `${me.name} added ${item.title}`, me);
  });
  on('local:have', (d) => {
    me.files = (Array.isArray(d.fps) ? d.fps : []).filter((f) => FINGERPRINT.test(f)).slice(-20);
    broadcast(room);
  });
  on('queue:remove', (d) => {
    room.queue = room.queue.filter((it) => it.id !== d.id);
    broadcast(room);
  });
  // Played items: put one back on now, add it back to Up next, or tidy the list.
  on('played:again', (d) => {
    const old = room.played.find((p) => p.id === d.id);
    if (!old) return;
    const item = cleanItem({ ...old, id: null, addedBy: me.name });
    if (!item) return;
    if (d.now) {
      advanceTo(room, item, me);
      toast(room, `${me.name} put ${item.title} back on`, me);
    } else {
      if (room.queue.length >= 100) return;
      if (room.current) room.queue.push(item);
      else setCurrent(room, item);
      toast(room, `${me.name} added ${item.title} back`, me);
    }
    broadcast(room);
  });
  on('played:remove', (d) => {
    room.played = room.played.filter((p) => p.id !== d.id);
    broadcast(room);
  });
  on('played:clear', () => {
    room.played = [];
    broadcast(room);
  });
  on('queue:move', (d) => {
    const i = room.queue.findIndex((it) => it.id === d.id);
    const j = i + (d.dir === 'down' ? 1 : -1);
    if (i < 0 || j < 0 || j >= room.queue.length) return;
    [room.queue[i], room.queue[j]] = [room.queue[j], room.queue[i]];
    broadcast(room);
  });
  on('queue:play', (d) => {
    const i = room.queue.findIndex((it) => it.id === d.id);
    if (i < 0) return;
    const [item] = room.queue.splice(i, 1);
    startRating(room, room.current);
    setCurrent(room, item);
    if (IN_BOX.includes(item.kind)) startCountdown(room, 3, me);
    broadcast(room);
    toast(room, `${me.name} put on ${item.title}`, me);
  });
  on('queue:skip', () => {
    if (!room.current) return;
    advance(room, me);
    broadcast(room);
    toast(room, `${me.name} skipped ahead`, me);
  });

  // ----- shows tracker -----
  on('show:add', (d) => {
    if (room.shows.length >= 50) return;
    const show = cleanShow({ ...d, id: null, updatedBy: me.name });
    if (!show) return;
    room.shows.push(show);
    broadcast(room);
  });
  on('show:set', (d) => {
    const show = room.shows.find((s) => s.id === d.id);
    if (!show) return;
    show.season = num(d.season, 1, 99, show.season);
    show.episode = num(d.episode, 1, 999, show.episode);
    show.updatedBy = me.name;
    broadcast(room);
  });
  on('show:finish', (d) => {
    const show = room.shows.find((s) => s.id === d.id);
    if (!show) return;
    const done = `S${show.season} E${show.episode}`;
    show.episode += 1;
    show.updatedBy = me.name;
    broadcast(room);
    toast(room, `${me.name} marked ${show.title} ${done} finished`, me);
  });
  on('show:remove', (d) => {
    room.shows = room.shows.filter((s) => s.id !== d.id);
    broadcast(room);
  });
  on('show:watch', (d) => {
    const show = room.shows.find((s) => s.id === d.id);
    if (!show) return;
    startRating(room, room.current);
    setCurrent(room, cleanItem({
      kind: 'stream', service: show.service, title: show.title,
      season: show.season, episode: show.episode, showId: show.id, addedBy: me.name, poster: show.poster,
    }));
    broadcast(room);
    toast(room, `${me.name} put on ${show.title} S${show.season} E${show.episode}`, me);
  });

  // ----- social -----
  on('react', (d) => {
    if (!REACTIONS.includes(d.emoji)) return;
    const now = Date.now();
    if (now - (me.lastReact || 0) < 300) return;
    me.lastReact = now;
    // Jinx: two people sending the same reaction within two seconds get a big burst.
    const jinx = !!room.lastReact && room.lastReact.emoji === d.emoji && room.lastReact.by !== me.id && now - room.lastReact.at < 2000;
    room.lastReact = { emoji: d.emoji, by: me.id, at: now };
    io.to(room.id).emit('react', { emoji: d.emoji, color: me.color, jinx });
  });

  on('chat:send', (d, cb) => {
    const text = str(d.text, 500);
    if (!text) return cb({ error: 'empty' });
    const now = Date.now();
    if (now - (me.lastChat || 0) < 250) return cb({ error: 'Slow down a little.' });
    me.lastChat = now;
    const msg = {
      id: newId(), from: me.id, name: me.name, color: me.color, text, at: now,
      // Messages remember where in the video they were sent, so they can jump back there.
      pos: room.current && synced(room) && !room.current.live ? Math.round(posNow(room) * 10) / 10 : null,
      itemId: room.current?.id || null,
    };
    room.chat.push(msg);
    if (room.chat.length > CHAT_MAX) room.chat.splice(0, room.chat.length - CHAT_MAX);
    io.to(room.id).emit('chat', msg);
    socket.to(room.id).emit('typing', { id: me.id, name: me.name, on: false });
    cb({ ok: true });
  });
  on('chat:typing', (d) => {
    socket.to(room.id).emit('typing', { id: me.id, name: me.name, color: me.color, on: !!d.on });
  });

  // Press and hold on the video: a ping at that spot on everyone's screen.
  on('ping', (d) => {
    const now = Date.now();
    if (now - (me.lastPing || 0) < 250) return;
    me.lastPing = now;
    io.to(room.id).emit('ping', { x: num(d.x, 0, 1, 0.5), y: num(d.y, 0, 1, 0.5), color: me.color, name: me.name });
  });

  // Moments: a starred spot in the current video, shown on everyone's timeline.
  on('moment:add', (d) => {
    if (!room.current || !synced(room) || room.current.live) return;
    const pos = num(d.pos, 0, 1e6, posNow(room));
    room.moments.push({ id: newId(), itemId: room.current.id, pos, note: str(d.note, 80) || null, name: me.name, color: me.color });
    if (room.moments.length > 100) room.moments.shift();
    broadcast(room);
    toast(room, `${me.name} starred ${fmt(pos)}`, me);
  });
  on('moment:remove', (d) => {
    room.moments = room.moments.filter((m) => m.id !== d.id);
    broadcast(room);
  });

  // Ready check: when everyone watching has tapped Ready, the countdown starts by itself.
  on('ready:toggle', () => {
    if (!room.current || (room.playback.playing && Date.now() >= room.playback.at) || room.countdown) return;
    if (room.ready?.itemId !== room.current.id) room.ready = { itemId: room.current.id, ids: [] };
    const ids = room.ready.ids;
    room.ready.ids = ids.includes(me.id) ? ids.filter((x) => x !== me.id) : [...ids, me.id];
    const viewers = [...room.members.values()].filter((m) => !m.remote);
    if (viewers.length > 1 && viewers.every((m) => room.ready.ids.includes(m.id))) {
      room.ready = null;
      startCountdown(room, 3, me);
      toast(room, 'Everyone’s ready');
    }
    broadcast(room);
  });

  // Rate it together.
  on('rate', (d) => {
    const r = room.rating;
    if (!r || r.revealed || r.itemId !== d.itemId) return;
    r.votes[me.id] = { id: me.id, name: me.name, color: me.color, score: d.score == null ? 0 : num(d.score, 1, 5, 3) };
    maybeReveal(room);
    broadcast(room);
  });
  on('rate:dismiss', () => {
    if (room.rating?.revealed) { room.rating = null; broadcast(room); }
  });

  // Stepped away: the tab is hidden. Optionally pauses everyone after a few seconds.
  on('presence', (d) => {
    me.away = !!d.away;
    clearTimeout(me.awayTimer);
    if (me.away && room.settings.pauseOnAway) {
      me.awayTimer = setTimeout(() => {
        if (!room || !me.away || !isWatching(room, me) || !room.playback.playing || Date.now() < room.playback.at) return;
        setPlayback(room, false, posNow(room));
        toast(room, `${me.name} stepped away. Paused at ${fmt(room.playback.position)}.`, me);
        broadcast(room);
      }, AWAY_PAUSE_MS);
    }
    broadcast(room);
  });
  on('settings:set', (d) => {
    if ('pauseOnAway' in d) room.settings.pauseOnAway = !!d.pauseOnAway;
    broadcast(room);
    toast(room, `${me.name} turned ${room.settings.pauseOnAway ? 'on' : 'off'} pausing when someone steps away`, me);
  });

  // Instagram follow, from a member's own connection (the HTTP API covers the extension).
  on('follow:goto', (d, cb) => cb(followTo(room, d.url, me)));
  on('follow:stop', () => {
    if (!room.follow) return;
    room.follow = null;
    broadcast(room);
  });
  on('call:state', (d) => {
    const joining = !!d.inCall && !me.inCall;
    me.inCall = !!d.inCall;
    me.cam = me.inCall && d.cam !== false; // has (or wants) a camera
    me.live = me.inCall && !!d.live; // the camera is actually on
    if (joining) {
      // A quick reconnect (a network blip) keeps its place in line for a camera spot.
      const kept = room.callPlaces?.get(me.id);
      me.callSince = kept && Date.now() - kept.left < 2 * 60 * 1000 ? kept.since : Date.now();
      room.callPlaces?.delete(me.id);
    }
    if (!me.inCall) me.callSince = null;
    broadcast(room);
  });
  // WebRTC signaling relay, keyed by client id (pattern from WatchParty's sendSignal).
  on('signal', (d) => {
    const target = room.members.get(str(d.to, 40));
    if (!target || JSON.stringify(d.msg ?? null).length > 20000) return;
    io.to(target.socketId).emit('signal', { from: me.id, msg: d.msg });
  });

  socket.on('disconnect', () => {
    if (!room || !me || room.members.get(me.id)?.socketId !== socket.id) return;
    const wasWatching = isWatching(room, me);
    clearTimeout(me.awayTimer);
    if (me.inCall && me.callSince) (room.callPlaces ||= new Map()).set(me.id, { since: me.callSince, left: Date.now() });
    room.members.delete(me.id);
    maybeReveal(room);
    clearTimeout(room.holds.get(me.id));
    room.holds.delete(me.id);
    if (room.members.size) {
      // A remote-only phone leaving shouldn't stop the show on the TV.
      if (wasWatching && room.playback.playing && Date.now() >= room.playback.at) {
        setPlayback(room, false, posNow(room));
        room.heldPause = false;
        toast(room, `${me.name} dropped off. Paused at ${fmt(room.playback.position)}.`, me);
      } else {
        toast(room, `${me.name} left`, me);
      }
      updateHolds(room);
      broadcast(room);
    } else {
      room.cleanup = setTimeout(() => { clearCountdown(room); clearHolds(room); rooms.delete(room.id); }, ROOM_TTL_MS);
    }
  });
});

server.listen(PORT, () => console.log(`Couchline listening on http://localhost:${PORT}`));
