// Couchline server: rooms, shared playback state, queue, show tracker,
// buffering holds, and a relay for WebRTC call signaling.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { parseMedia, mediaWarnings, IN_BOX, EXT_SERVICES } from './public/media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // empty rooms are kept 12 hours
const HOLD_LIMIT_MS = 20000; // stop waiting on a buffering viewer after 20s
const MEMBER_COLORS = ['lamp', 'rose', 'sky', 'mint'];
const SERVICES = ['Netflix', 'Hulu', 'Other'];
const REACTIONS = ['😂', '😮', '😭', '😍', '👀', '🙌'];
// Twitch only plays inside pages on the domains listed here (comma separated, no scheme or port).
const TWITCH_PARENT = (process.env.TWITCH_PARENT || 'localhost').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/hls', express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist')));
app.get('/config', (_req, res) => res.json({ iceServers: iceServers(), twitchParent: TWITCH_PARENT }));
app.get('/r/:roomId', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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

const DEFAULT_TITLES = { youtube: 'YouTube video', vimeo: 'Vimeo video', file: 'Video', jellyfin: 'Jellyfin video', plex: 'Plex video' };
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
    };
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

function publicState(room) {
  return {
    id: room.id,
    current: room.current,
    playback: room.playback,
    extSync: extSynced(room),
    queue: room.queue,
    shows: room.shows,
    countdown: room.countdown,
    members: [...room.members.values()].map((m) => ({
      id: m.id, name: m.name, color: m.color, remote: m.remote, ext: m.ext, inCall: m.inCall, drift: m.drift,
    })),
    holds: [...room.holds.keys()].map((cid) => room.members.get(cid)?.name).filter(Boolean),
    serverNow: Date.now(),
  };
}
const toast = (room, text, by) => io.to(room.id).emit('toast', { text, color: by?.color || null });
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

function setCurrent(room, item) {
  clearCountdown(room);
  clearHolds(room);
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
    broadcast(room);
    io.to(room.id).emit('go', { itemId });
  }, seconds * 1000);
}

function advance(room, by) {
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
  const cur = cleanItem(cache.current);
  if (cur) setCurrent(room, cur);
}

// ---------- sockets ----------
io.on('connection', (socket) => {
  let room = null;
  let me = null;
  let bucket = { count: 0, since: Date.now() };

  const limited = () => {
    const now = Date.now();
    if (now - bucket.since > 1000) bucket = { count: 0, since: now };
    return ++bucket.count > 40;
  };
  const on = (event, fn) => socket.on(event, (data, cb) => {
    if (!room || !me || limited()) return;
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
    };
    room.members.set(clientId, me);
    socket.join(roomId);
    if (typeof cb === 'function') cb({ ok: true, clientId, iceServers: iceServers(), twitchParent: TWITCH_PARENT });
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
    advance(room, me);
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
  on('queue:add', (d, cb) => {
    const media = parseMedia(d.input);
    if (media?.error) return cb({ error: media.error });
    if (!media) return cb({ error: 'That link isn’t supported. Paste a YouTube, Vimeo, Twitch, Instagram, Netflix, Hulu, Jellyfin, Plex, or video file link, or type a show name.' });
    if (room.queue.length >= 100) return cb({ error: 'Up next is full. Remove something first.' });
    const item = cleanItem({
      ...media,
      service: media.service || d.service,
      title: media.title || str(d.title, 140),
      addedBy: me.name,
    });
    if (!item) return cb({ error: 'That link isn’t supported.' });
    const putOn = !room.current;
    if (putOn) setCurrent(room, item);
    else room.queue.push(item);
    broadcast(room);
    cb({ ok: true, warnings: mediaWarnings(item) });
    toast(room, putOn ? `${me.name} put on ${item.title}` : `${me.name} added ${item.title}`, me);
    if (OEMBED[item.kind]) {
      oembed(item).then((r) => {
        if (!r) return;
        if (r.title) item.title = r.title;
        if (r.thumb) item.thumb = r.thumb;
        broadcast(room);
      });
    }
  });
  on('queue:remove', (d) => {
    room.queue = room.queue.filter((it) => it.id !== d.id);
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
    setCurrent(room, cleanItem({
      kind: 'stream', service: show.service, title: show.title,
      season: show.season, episode: show.episode, showId: show.id, addedBy: me.name,
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
    io.to(room.id).emit('react', { emoji: d.emoji, color: me.color });
  });
  on('call:state', (d) => {
    me.inCall = !!d.inCall;
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
    room.members.delete(me.id);
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
