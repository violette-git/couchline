// Couchline server: rooms, shared playback state, queue, show tracker,
// buffering holds, and a relay for WebRTC call signaling.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // empty rooms are kept 12 hours
const HOLD_LIMIT_MS = 20000; // stop waiting on a buffering viewer after 20s
const MEMBER_COLORS = ['lamp', 'rose', 'sky', 'mint'];
const SERVICES = ['Netflix', 'Hulu', 'Other'];
const REACTIONS = ['😂', '😮', '😭', '😍', '👀', '🙌'];

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/config', (_req, res) => res.json({ iceServers: iceServers() }));
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

// Turns whatever someone pasted into a media descriptor, or null if unsupported.
export function parseMedia(raw) {
  const input = str(raw, 500);
  if (!input) return null;
  let url = null;
  if (!/\s/.test(input)) {
    try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { url = null; }
  }
  const host = url ? url.hostname.replace(/^(www\.|m\.)/, '') : '';

  if (url && (host === 'youtu.be' || host.endsWith('youtube.com'))) {
    let videoId = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    if (!videoId) {
      const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
      if (m) videoId = m[2];
    }
    videoId = (videoId || '').split('/')[0];
    if (/^[\w-]{6,20}$/.test(videoId)) {
      const t = (url.searchParams.get('t') || '').replace(/s$/, '');
      return { kind: 'youtube', videoId, url: `https://www.youtube.com/watch?v=${videoId}`, start: num(t, 0, 1e6, 0) };
    }
    return null;
  }
  if (url && host.endsWith('instagram.com')) {
    const m = url.pathname.match(/^\/(reels?|p|tv)\/([\w-]{5,})/);
    if (!m) return null;
    const igType = m[1] === 'p' ? 'p' : 'reel';
    return { kind: 'instagram', igType, code: m[2], url: `https://www.instagram.com/${igType}/${m[2]}/` };
  }
  if (url && (host.endsWith('netflix.com') || host.endsWith('hulu.com'))) {
    return { kind: 'stream', service: host.endsWith('netflix.com') ? 'Netflix' : 'Hulu', url: url.href };
  }
  if (url && input.includes('.')) return null; // some other website we can't sync
  return { kind: 'stream', title: input.slice(0, 120) }; // typed a show or movie name
}

function defaultTitle(m) {
  if (m.kind === 'youtube') return 'YouTube video';
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
    if (!base || base.kind === 'stream') return null;
    if (base.kind === 'youtube' && !base.start) base.start = num(raw.start, 0, 1e6, 0);
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

async function youtubeTitle(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    return str((await r.json()).title, 140) || null;
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
      playback: { playing: false, position: 0, at: Date.now() },
      members: new Map(), holds: new Map(), heldPause: false,
      countdownTimer: null, cleanup: null, driftTimer: null,
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
const setPlayback = (room, playing, position, at = Date.now()) => {
  room.playback = { playing, position: Math.max(0, position), at };
};

function publicState(room) {
  return {
    id: room.id,
    current: room.current,
    playback: room.playback,
    queue: room.queue,
    shows: room.shows,
    countdown: room.countdown,
    members: [...room.members.values()].map((m) => ({
      id: m.id, name: m.name, color: m.color, remote: m.remote, inCall: m.inCall, drift: m.drift,
    })),
    holds: [...room.holds.keys()].map((cid) => room.members.get(cid)?.name).filter(Boolean),
    serverNow: Date.now(),
  };
}
const broadcast = (room) => io.to(room.id).emit('state', publicState(room));
const toast = (room, text, by) => io.to(room.id).emit('toast', { text, color: by?.color || null });

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
  setPlayback(room, false, item?.kind === 'youtube' ? item.start || 0 : 0);
}

// Both screens count down together. For YouTube the server schedules playback to begin at
// launchAt, so each client starts on its own synced clock instead of waiting for a message.
function startCountdown(room, seconds, by) {
  if (!room.current) return;
  clearCountdown(room);
  const launchAt = Date.now() + seconds * 1000;
  const itemId = room.current.id;
  if (room.current.kind === 'youtube') setPlayback(room, true, room.playback.playing ? posNow(room) : room.playback.position, launchAt);
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
  // YouTube rolls straight on after a short countdown. Instagram and streaming
  // services wait for someone to tap Start together, since each person has to open them.
  if (next?.kind === 'youtube') startCountdown(room, 5, by);
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
  const isYouTube = () => room.current?.kind === 'youtube';

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
    };
    room.members.set(clientId, me);
    socket.join(roomId);
    if (typeof cb === 'function') cb({ ok: true, clientId, iceServers: iceServers() });
    broadcast(room);
    if (!previous) toast(room, `${me.name} joined`, me);
  });

  // ----- playback (YouTube) -----
  on('cmd:play', (d) => {
    if (!isYouTube()) return;
    clearCountdown(room);
    clearHolds(room);
    setPlayback(room, true, num(d.position, 0, 1e6, posNow(room)));
    broadcast(room);
    toast(room, `${me.name} pressed play`, me);
  });
  on('cmd:pause', (d) => {
    if (!isYouTube()) return;
    clearCountdown(room);
    clearHolds(room);
    setPlayback(room, false, num(d.position, 0, 1e6, posNow(room)));
    broadcast(room);
    toast(room, `${me.name} paused at ${fmt(room.playback.position)}`, me);
  });
  on('cmd:seek', (d) => {
    if (!isYouTube()) return;
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
    if (!isYouTube()) return;
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

  // ----- countdown (Instagram, Netflix, Hulu, and YouTube "play now") -----
  on('countdown:start', (d) => {
    if (!room.current) return;
    startCountdown(room, num(d.seconds, 3, 10, 5), me);
    broadcast(room);
  });
  on('countdown:cancel', () => {
    if (!room.countdown) return;
    clearCountdown(room);
    if (isYouTube()) setPlayback(room, false, room.playback.position);
    broadcast(room);
    toast(room, `${me.name} cancelled the countdown`, me);
  });

  // ----- queue -----
  on('queue:add', (d, cb) => {
    const media = parseMedia(d.input);
    if (!media) return cb({ error: 'That link isn’t supported. Paste a YouTube or Instagram link, or type a show name.' });
    if (room.queue.length >= 100) return cb({ error: 'Up next is full. Remove something first.' });
    const item = cleanItem({
      ...media,
      service: media.service || d.service,
      title: media.kind === 'stream' && !media.url ? media.title : str(d.title, 140),
      addedBy: me.name,
    });
    if (!item) return cb({ error: 'That link isn’t supported.' });
    const putOn = !room.current;
    if (putOn) setCurrent(room, item);
    else room.queue.push(item);
    broadcast(room);
    cb({ ok: true });
    toast(room, putOn ? `${me.name} put on ${item.title}` : `${me.name} added ${item.title}`, me);
    if (item.kind === 'youtube') {
      youtubeTitle(item.videoId).then((t) => { if (t) { item.title = t; broadcast(room); } });
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
    if (item.kind === 'youtube') startCountdown(room, 3, me);
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
    room.members.delete(me.id);
    clearTimeout(room.holds.get(me.id));
    room.holds.delete(me.id);
    if (room.members.size) {
      // A remote-only phone leaving shouldn't stop the show on the TV.
      if (!me.remote && isYouTube() && room.playback.playing && Date.now() >= room.playback.at) {
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
