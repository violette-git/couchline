import { Clock, expectedPosition, correction, fmt } from './sync.js';
import { PState } from './players/player.js';
import { YouTubePlayer } from './players/youtube.js';
import { VimeoPlayer } from './players/vimeo.js';
import { TwitchPlayer, setTwitchParents } from './players/twitch.js';
import { FilePlayer } from './players/file.js';
import { TikTokPlayer } from './players/tiktok.js';
import { initSwipe } from './swipe.js';
import { initPopout } from './popout.js';
import { parseMedia, mediaWarnings, IN_BOX } from './media.js';
import { FileShare, fingerprint, probeVideo, formatSize } from './share.js';
import { Call } from './call.js';
import { $, el, store, colorOf, toast, listNames } from './ui.js';
import { initSocial } from './social.js';
import { initAdding, handleShareLanding } from './adding.js';
import { initCreate, initBrowse, pendingRoom } from './rooms.js';

const REACTIONS = ['😂', '😮', '😭', '😍', '👀', '🙌'];
const WORDS_A = ['maple', 'velvet', 'quiet', 'amber', 'cozy', 'late', 'lucky', 'sunny', 'hazel', 'cobalt'];
const WORDS_B = ['couch', 'otter', 'lamp', 'porch', 'comet', 'pillow', 'fox', 'lantern', 'sofa', 'moth'];

function newRoomCode() {
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `${WORDS_A[r[0] % 10]}-${WORDS_B[r[1] % 10]}-${1000 + (r[2] % 9000)}`;
}
function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
}

const clientId = store.get('clientId') || randomId();
store.set('clientId', clientId);

// ---------- views ----------
function show(id) {
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== id;
}

let roomId = null;
const routeMatch = location.pathname.match(/^\/r\/([a-z0-9-]{3,40})\/?$/i);
// Lets Android show Couchline in the share sheet once it's on the home screen.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (handleShareLanding()) {
  // On its way to the last room, carrying what was shared.
} else if (/^\/rooms\/?$/.test(location.pathname)) {
  show('browse');
  document.title = 'Public rooms on Couchline';
  initBrowse();
} else if (routeMatch) {
  roomId = routeMatch[1].toLowerCase();
  $('#entryRoom').textContent = roomId;
  for (const id of ['#roomCodeTop', '#roomMenuCode', '#emptyCode']) $(id).textContent = roomId;
  // The extension page shows this room's code, and links back here.
  for (const a of document.querySelectorAll('.ext-room-link')) a.href = `/extension?room=${roomId}`;
  $('#name').value = store.get('name', '');
  $('#optRemote').checked = store.get('remote', false);
  show('entry');
  // Joining from Browse rooms (or a new room): show its name on the way in.
  const named = pendingRoom.get(roomId)?.title;
  if (named) { $('#entryTitle').textContent = named; $('#entryTitle').hidden = false; }
  else {
    fetch(`/api/rooms?q=${encodeURIComponent(roomId)}`).then((r) => r.json()).then(({ rooms }) => {
      const found = rooms?.find((x) => x.id === roomId);
      if (found?.title) { $('#entryTitle').textContent = found.title; $('#entryTitle').hidden = false; }
    }).catch(() => {});
  }
  $('#name').focus();
  // Arriving from the share sheet with a name already saved: go straight in.
  if (store.get('pendingAdd')?.link && store.get('name')) {
    queueMicrotask(() => enterRoom({ name: store.get('name'), call: false, remote: store.get('remote', false) }));
  }
} else {
  show('landing');
}

initCreate({ newRoomCode });
// Accepts a code ("cozy lamp 1234" works too) or a whole room link.
function goToRoom(value) {
  const v = value.trim();
  const fromLink = v.match(/\/r\/([a-z0-9-]{3,40})/i);
  const code = (fromLink ? fromLink[1] : v).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (code.length >= 3) location.href = `/r/${code}`;
}
$('#joinCode').addEventListener('submit', (e) => {
  e.preventDefault();
  goToRoom($('#code').value);
});
$('#entryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#name').value.trim().slice(0, 24);
  if (!name) return;
  enterRoom({ name, call: $('#optCall').checked, remote: $('#optRemote').checked });
});

// ---------- players ----------
// One player per source, created the first time it's needed and kept (hidden) after that,
// so an iPhone that was tapped once for YouTube doesn't need another tap for the next video.
const PLAYERS = { youtube: YouTubePlayer, vimeo: VimeoPlayer, twitch: TwitchPlayer, tiktok: TikTokPlayer, file: FilePlayer, jellyfin: FilePlayer, plex: FilePlayer, local: FilePlayer };
const playerPool = new Map();
let player = null; // the one showing the current item, if any

function playerFor(kind) {
  const Cls = PLAYERS[kind];
  if (!playerPool.has(Cls)) {
    const p = new Cls($('#playerSlot'));
    p.onUser = onPlayerUser;
    p.resolveLocal = (it) => share?.get(it.fp);
    playerPool.set(Cls, p);
  }
  return playerPool.get(Cls);
}

// Someone used the embed's own buttons (only players with ownControls report these).
let userActedAt = 0;
function onPlayerUser(kind, position) {
  const cur = room?.current;
  if (!cur || player?.key !== cur.id) return;
  userActedAt = performance.now();
  // A room held for someone's buffering is still meant to be playing.
  const meantToPlay = room.playback.playing || room.holds.length > 0;
  if (kind === 'play' && !meantToPlay) socket.emit('cmd:play', { position: expectedNow() });
  else if (kind === 'pause' && meantToPlay) socket.emit('cmd:pause', { position: player.time() });
  else if (kind === 'seek' && !isLive(cur)) socket.emit('cmd:seek', { position });
}
const inBox = (it) => IN_BOX.includes(it?.kind);
const isLive = (it) => !!it?.live || (!!it && player?.key === it.id && player.live);

// ---------- room ----------
let socket, clock, call, share, social, adding, swipe, popout;
let room = null;
let me = { remote: false };
let lastItemId = null;
let endedSent = null;
let bufferingSince = 0;
let reportedBuffering = false;
let playPendingSince = 0;
let lastSeekAt = 0;
let lastDriftSent = 0;
let scrubbing = false;
let wakeLock = null;
let wakeBusy = false;
let cdRaf = null;

function enterRoom(opts) {
  store.set('name', opts.name);
  store.set('remote', opts.remote);
  store.set('lastRoom', roomId); // where the phone share sheet sends things
  me.remote = opts.remote;
  document.body.classList.toggle('is-remote', me.remote);
  show('room');

  socket = window.io({ transports: ['websocket', 'polling'] });
  clock = new Clock(socket);
  call = new Call({ socket, selfId: clientId, tilesEl: $('#tiles') });
  call.onVideoChange = () => {
    renderCallButtons();
    if (call.active && call.videoAllowed && !call.camOn) toast({ text: 'A camera spot opened. Tap Turn camera on to use it.' });
  };
  // The tile count lets the layout fit everyone's faces on screen.
  new MutationObserver(() => {
    const n = $('#tiles').querySelectorAll('.tile:not(.audio-only)').length;
    const size = n >= 4 ? 'large' : n === 3 ? 'mid' : 'small';
    if ($('#tiles').dataset.size !== size) $('#tiles').dataset.size = size;
  })
    .observe($('#tiles'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  share = new FileShare({ socket, onChange: renderLocal, onNotice: shareNotice });
  const restored = share.restore(); // copies downloaded before a reload
  swipe = initSwipe({ socket, getRoom: () => room });
  popout = initPopout({ call, getRoom: () => room, onChange: () => renderCallButtons() });
  social = initSocial({ socket, clientId, getRoom: () => room, expectedNow, durationNow, isLive, thumbUrl });
  if (opts.call) startCall(); // inside the tap, so iOS allows camera and audio

  socket.on('connect', () => {
    socket.emit('join', {
      roomId, clientId, name: opts.name, remote: me.remote, cache: store.get(`room:${roomId}`),
    }, async (res) => {
      if (res?.error) return toast({ text: res.error });
      if (res?.iceServers) call.iceServers = res.iceServers;
      setTwitchParents(res?.twitchParent);
      if (res?.iceServers) share.iceServers = res.iceServers;
      restored.then(() => share.announce());
      social.onJoin(res.chat);
      adding ||= initAdding({ socket, roomId, config: { youtubeSearch: !!res.youtubeSearch } });
      adding.flushShared();
      await clock.calibrate();
      if (call.active) socket.emit('call:state', call.callState());
    });
  });
  socket.on('disconnect', () => toast({ text: 'Connection lost. Reconnecting.' }));
  socket.on('state', onState);
  socket.on('toast', toast);
  socket.on('react', floatReaction);
  socket.on('chat', (m) => { social.onChat(m); saveCache(); });
  socket.on('typing', (t) => social.onTyping(t));
  socket.on('ping', (p) => social.onPing(p));
  socket.on('go', onGo);
  // The call and file sharing use the same relay; file messages are marked "share".
  socket.on('signal', (d) => (d.msg?.share ? share.handleSignal(d) : call.handleSignal(d)));

  setInterval(tick, 500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeLock = null; tick(); } });
}

// A saved copy of the room, so it comes back if the server restarts.
function saveCache() {
  if (!room) return;
  store.set(`room:${roomId}`, { title: room.title, visibility: room.visibility, current: room.current, queue: room.queue, played: room.played, shows: room.shows, history: room.history, chat: social.messages().slice(-100) });
}

function onState(s) {
  room = s;
  saveCache();
  renderRoster();
  renderStage();
  renderQueue();
  renderShows();
  renderLocal();
  renderRoomSettings();
  social.onState(s);
  swipe.render(s);
  renderCallButtons();
  call.sync(s.members);
  tick();
}

const self = () => room?.members.find((m) => m.id === clientId);

function renderRoster() {
  const ul = $('#roster');
  ul.replaceChildren(...room.members.map((m) => el('li', { 'data-color': m.color, class: m.id === clientId ? 'is-me' : null, title: m.id === clientId ? 'You' : null },
    el('span', { class: 'dot' }),
    el('span', { class: 'who' }, m.name),
    m.remote ? el('span', { class: 'tag' }, 'remote') : null,
    m.ext ? el('span', { class: 'tag' }, 'extension') : null,
    m.away ? el('span', { class: 'tag' }, 'away') : null,
    m.id === room.host ? el('span', { class: 'tag' }, 'host') : null,
  )));
}

// ---------- the room's name and who can join ----------
let settingsKey = '';
function renderRoomSettings() {
  const isHost = room.host === clientId;
  const name = room.title || roomId;
  $('#roomCodeTop').textContent = name;
  $('#roomChip').classList.toggle('has-title', !!room.title);
  document.title = room.title ? `${room.title} on Couchline` : 'Couchline';
  // Only rewrite the name box when the name itself changes, so typing isn't interrupted.
  const key = `${room.title}|${room.visibility}|${isHost}`;
  if (key !== settingsKey) {
    settingsKey = key;
    if (document.activeElement !== $('#roomTitleInput')) $('#roomTitleInput').value = room.title || '';
  }
  $('#roomTitleInput').disabled = !isHost;
  $('#roomTitleSave').hidden = !isHost;
  for (const b of document.querySelectorAll('[data-room-visibility]')) {
    b.setAttribute('aria-pressed', String(b.dataset.roomVisibility === room.visibility));
    b.disabled = !isHost;
  }
  const what = room.visibility === 'public'
    ? 'Public: listed in Browse rooms while someone is here. Anyone can join.'
    : 'Private: only people with the code or link can join.';
  $('#roomPrivacyNote').textContent = isHost ? what : `${what} ${room.hostName || 'The host'} can change this.`;
  // A room this person just created: put its name and privacy in place.
  const pending = pendingRoom.get(roomId);
  if (pending && isHost) {
    pendingRoom.clear();
    if (pending.title || pending.visibility === 'public') socket.emit('room:settings', { title: pending.title, visibility: pending.visibility }, () => {});
  }
}
$('#roomSettings').addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('room:settings', { title: $('#roomTitleInput').value }, (r) => { if (r?.error) toast({ text: r.error }); });
});
for (const b of document.querySelectorAll('[data-room-visibility]')) {
  b.addEventListener('click', () => socket.emit('room:settings', { visibility: b.dataset.roomVisibility }, (r) => { if (r?.error) toast({ text: r.error }); }));
}

// ---------- stage ----------
function epLabel(it) {
  if (it.season && it.episode) return `S${it.season} E${it.episode}`;
  if (it.episode) return `Episode ${it.episode}`;
  return '';
}

// A picture for the item, where the source gives one without an account.
function thumbUrl(it, size = 'mq') {
  if (it.poster) return it.poster;
  if (it.kind === 'youtube') return `https://i.ytimg.com/vi/${it.videoId}/${size}default.jpg`;
  if (it.kind === 'vimeo') return it.thumb || null;
  if (it.kind === 'twitch' && it.live) return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${it.channel}-640x360.jpg`;
  return null;
}

// Netflix and Hulu play in sync when everyone is on the Couchline extension.
const extSynced = () => !!room?.extSync;
const syncedNow = () => inBox(room?.current) || extSynced();

function renderStage() {
  const cur = room.current;
  const kind = cur?.kind ?? null;
  const box = inBox(cur);
  const stage = $('#stage');
  stage.dataset.kind = kind || 'empty';
  stage.classList.toggle('has-player', box);
  $('#emptyStage').hidden = !!cur;
  $('#playerWrap').hidden = !(box && !me.remote);
  $('#remotePoster').hidden = !(box && me.remote);
  $('#igWrap').hidden = kind !== 'instagram';
  $('#streamCard').hidden = kind !== 'stream';
  $('#controls').hidden = !syncedNow();
  $('#controls').classList.toggle('is-live', isLive(cur));
  $('#startBar').hidden = !(kind === 'instagram' || kind === 'stream') || !!room.countdown;
  // Following someone's Instagram takes over the stage until it stops.
  const following = !!room.follow;
  stage.classList.toggle('is-following', following);
  // Swiping together also takes over the stage (following someone's scrolling comes first).
  const swiping = !following && !!room.reels?.on;
  if (following || swiping) {
    for (const id of ['#emptyStage', '#playerWrap', '#remotePoster', '#igWrap', '#streamCard', '#controls', '#startBar']) $(id).hidden = true;
  }
  // On a phone, the call can float over the Netflix or Hulu app.
  $('#popHint').hidden = !(kind === 'stream' && call?.active && popout?.supported && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

  if ((cur?.id ?? null) !== lastItemId) {
    lastItemId = cur?.id ?? null;
    endedSent = null;
    playPendingSince = 0;
    const next = box && !me.remote ? playerFor(kind) : null;
    for (const p of playerPool.values()) {
      if (p !== next && p.key) p.stop();
      p.show(p === next);
    }
    player = next;
    setTapNeeded(false);
    player?.load(cur, room.playback.position);
    const thumb = box ? thumbUrl(cur, 'hq') : null;
    $('#remoteThumb').hidden = !thumb;
    if (thumb) $('#remoteThumb').src = thumb;
    const frame = $('#igFrame');
    if (kind === 'instagram') frame.src = `https://www.instagram.com/${cur.igType}/${cur.code}/embed/`;
    else frame.removeAttribute('src'); // stops a reel that's still playing
  }

  const open = $('#openExternal');
  if (kind === 'stream') {
    $('#streamService').textContent = cur.service && cur.service !== 'Other' ? cur.service : 'On your own screen';
    $('#streamTitle').textContent = cur.title;
    $('#streamEp').textContent = epLabel(cur);
    $('#streamPoster').hidden = !cur.poster;
    if (cur.poster) $('#streamPoster').src = cur.poster;
    renderExtNote(cur);
    open.hidden = !cur.url;
    if (cur.url) { open.href = inviteLink(cur.url); open.textContent = `Open ${cur.service || 'link'}`; }
  } else if (kind === 'instagram') {
    open.hidden = false;
    open.href = cur.url;
    open.textContent = 'Open in Instagram';
  } else {
    open.hidden = true;
  }
  renderCountdown();
}

// Tells the extension which room to offer when this link opens on Netflix or Hulu.
// It only fills in the join form there; the person still has to press Join.
function inviteLink(url) {
  if (!/^https:\/\/(www\.)?(netflix|hulu)\.com\//.test(url)) return url;
  return `${url.split('#')[0]}#couchline=${encodeURIComponent(roomId)}&server=${encodeURIComponent(location.origin)}`;
}

function renderExtNote(cur) {
  const note = $('#extNote');
  const hint = $('#streamHint');
  const becomeRemote = $('#becomeRemote');
  const supported = cur.service === 'Netflix' || cur.service === 'Hulu';
  const viewers = room.members.filter((m) => !m.remote);
  const missing = viewers.filter((m) => m.ext !== cur.service);
  hint.hidden = extSynced();
  becomeRemote.hidden = true;
  // Offer the extension wherever it would help: Netflix or Hulu, not yet synced, on a computer.
  $('#extGet').hidden = !supported || extSynced() || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (!supported) { note.hidden = true; return; }
  note.hidden = false;
  if (extSynced()) {
    note.textContent = `Synced through the Couchline extension. Play, pause, or seek on ${cur.service} and everyone follows. This tab works as a remote.`;
  } else if (viewers.some((m) => m.ext)) {
    const names = missing.map((m) => (m.id === clientId ? 'you (this tab)' : m.name));
    note.textContent = `Automatic sync turns on when everyone watching is on the Couchline extension. Still needed: ${listNames(names)}.`;
    becomeRemote.hidden = !missing.some((m) => m.id === clientId);
  } else {
    note.textContent = `On a computer? With the Couchline extension, ${cur.service} plays in sync on its own.`;
  }
}

function renderCountdown() {
  const box = $('#countdown');
  cancelAnimationFrame(cdRaf);
  if (!room.countdown) { box.hidden = true; return; }
  box.hidden = false;
  box.style.setProperty('--cd', colorOf(room.countdown.color));
  const num = $('#countNum');
  num.textContent = '';
  const step = () => {
    if (!room.countdown) return;
    const left = Math.max(1, Math.ceil((room.countdown.launchAt - clock.now()) / 1000));
    if (num.textContent !== String(left)) {
      num.textContent = left;
      box.classList.remove('beat');
      void box.offsetWidth; // restart the animation
      box.classList.add('beat');
    }
    cdRaf = requestAnimationFrame(step);
  };
  step();
}

function onGo({ itemId }) {
  const cur = room?.current;
  if (!cur || cur.id !== itemId) return;
  navigator.vibrate?.(60);
  if (syncedNow()) return;
  flash(cur.kind === 'instagram' ? 'Tap play now' : `Press play on ${cur.service && cur.service !== 'Other' ? cur.service : 'your screen'} now`);
}

function flash(text) {
  const f = $('#goFlash');
  f.textContent = text;
  f.hidden = false;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { f.hidden = true; }, 2600);
}

let tapNeeded = false;
function setTapNeeded(on) {
  tapNeeded = on;
  $('#tapToStart').hidden = !on;
  // Embeds (YouTube, Vimeo) need the tap to land on their own player once.
  // A plain video has no button of its own, so the shield stays and starts it directly.
  // Twitch keeps its own buttons, so it never gets the shield.
  $('#tapShield').hidden = (on && !!player?.tapThrough) || !!player?.ownControls;
}

// ---------- the sync loop ----------
function expectedNow() {
  return room ? expectedPosition(room.playback, clock.now()) : 0;
}
const waitingForLaunch = () => room.playback.playing && clock.now() < room.playback.at;
const roomIsPlaying = () => room.playback.playing && !waitingForLaunch();

function tick() {
  if (!room) return;
  updateControls();
  social?.tick();
  const cur = room.current;
  renderPlayerNote();
  if (!cur || !inBox(cur) || me.remote || !player?.ready || player.key !== cur.id) {
    // Until an embed is ready, let taps reach it, in case it shows a check or a button of its own.
    if (player && player.key === cur?.id && player.tapThrough) $('#tapShield').hidden = true;
    setWake(false);
    return;
  }
  const now = performance.now();
  // Give the room a moment to echo back what the person just did on the embed's own buttons.
  if (now - userActedAt < 1500) return;
  const st = player.state();
  const t = player.time();
  const exp = expectedNow();
  const live = isLive(cur);

  const dur = player.duration();
  if (dur && !cur.duration && !live) socket.emit('media:meta', { itemId: cur.id, duration: dur });

  if (st === PState.ENDED) {
    if (endedSent !== cur.id && room.playback.playing) {
      endedSent = cur.id;
      socket.emit('media:ended', { itemId: cur.id });
    }
    return;
  }

  if (roomIsPlaying()) {
    if (st === PState.BUFFERING) {
      bufferingSince ||= now;
      if (!reportedBuffering && now - bufferingSince > 1500) {
        reportedBuffering = true;
        socket.emit('buffering', { on: true });
      }
      return;
    }
    bufferingSince = 0;
    if (st !== PState.PLAYING) {
      playPendingSince ||= now;
      if (now - lastSeekAt > 1000) {
        if (!live && Math.abs(t - exp) > 1 && st !== PState.CUED && st !== PState.UNSTARTED) player.seek(exp);
        player.play();
        lastSeekAt = now;
      }
      // iPhones block video that starts without a tap. Ask once, then the API works.
      if (now - playPendingSince > 2500 && (st === PState.CUED || st === PState.UNSTARTED) && !player.error) setTapNeeded(true);
      return;
    }
    playPendingSince = 0;
    setTapNeeded(false);
    if (reportedBuffering) { reportedBuffering = false; socket.emit('buffering', { on: false }); }
    setWake(true);
    // A live stream has no shared timeline. Everyone just watches the live edge.
    if (live) return;
    if (!player.fineRates) player.checkRates();
    const drift = t - exp;
    const fix = correction(drift, { fineRates: player.fineRates, settling: now - lastSeekAt < 2000 });
    if (fix.seek) { player.seek(exp + 0.2); lastSeekAt = now; } else if (fix.rate !== player.rate()) player.setRate(fix.rate);
    if (now - lastDriftSent > 2000) {
      lastDriftSent = now;
      socket.emit('drift', { value: Math.round(drift * 10) / 10 });
    }
  } else {
    playPendingSince = 0;
    setTapNeeded(false);
    bufferingSince = 0;
    if (reportedBuffering) { reportedBuffering = false; socket.emit('buffering', { on: false }); }
    if (st === PState.PLAYING || st === PState.BUFFERING) player.pause();
    if (player.rate() !== 1) player.setRate(1);
    const target = room.playback.position;
    if (!live && st !== PState.CUED && st !== PState.UNSTARTED && Math.abs(t - target) > 0.5 && now - lastSeekAt > 800) {
      player.seek(target);
      lastSeekAt = now;
    }
    setWake(false);
  }
}

function renderPlayerNote() {
  const note = $('#playerNote');
  const text = inBox(room?.current) && player?.key === room.current.id ? player.error : null;
  note.hidden = !text;
  if (text && note.textContent !== text) note.textContent = text;
}

async function setWake(on) {
  if (wakeBusy || !('wakeLock' in navigator)) return;
  wakeBusy = true;
  try {
    if (on && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not allowed right now */ }
  wakeBusy = false;
}

// ---------- controls ----------
function durationNow() {
  return (player && player.key === room?.current?.id && player.duration()) || room?.current?.duration || 0;
}

function updateControls() {
  if (!room?.current || !syncedNow()) return;
  const exp = expectedNow();
  const dur = durationNow();
  const playing = room.playback.playing;
  $('#playBtn').classList.toggle('is-playing', playing);
  $('#playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  // A stream can turn out to be live only once it loads, so this is checked every tick.
  $('#controls').classList.toggle('is-live', isLive(room.current));
  if (isLive(room.current)) $('#time').textContent = 'Live';
  else updateTimeline(exp, dur);
  updateSyncPill(playing);
}

function updateTimeline(exp, dur) {
  const scrub = $('#scrub');
  scrub.disabled = !dur;
  scrub.max = String(dur || 1);
  if (!scrubbing) scrub.value = String(dur ? Math.min(exp, dur) : 0);
  scrub.style.setProperty('--fill', dur ? `${(Number(scrub.value) / dur) * 100}%` : '0%');
  $('#time').textContent = `${fmt(scrubbing ? Number(scrub.value) : exp)}${dur ? ` / ${fmt(dur)}` : ''}`;
}

function updateSyncPill(playing) {
  const pill = $('#syncPill');
  let text = 'In sync';
  let mode = 'ok';
  const others = room.members.filter((m) => m.id !== clientId && !m.remote);
  const lagging = others.find((m) => m.drift != null && Math.abs(m.drift) > 0.8);
  const mine = self()?.drift;
  const cur = room.current;
  const lacking = cur?.kind === 'local' ? room.members.filter((m) => !m.remote && !m.ext && !m.files?.includes(cur.fp)) : [];
  if (room.holds.length) { text = `Waiting for ${listNames(room.holds)}`; mode = 'wait'; }
  else if (lacking.length) {
    const names = lacking.map((m) => (m.id === clientId ? 'You' : m.name));
    text = `${listNames(names)} ${names.length > 1 || names[0] === 'You' ? 'don’t' : 'doesn’t'} have the file yet`;
    mode = 'wait';
  }
  else if (!playing) { text = 'Paused'; mode = 'idle'; }
  else if (waitingForLaunch()) { text = 'Starting'; mode = 'idle'; }
  else if (mine != null && Math.abs(mine) > 0.8 && !me.remote) { text = 'Catching up'; mode = 'wait'; }
  else if (lagging) { text = `${lagging.name} is catching up`; mode = 'wait'; }
  pill.textContent = text;
  pill.dataset.mode = mode;
}

function togglePlay() {
  if (!room?.current || !syncedNow()) return;
  const position = expectedNow();
  if (room.playback.playing) {
    socket.emit('cmd:pause', { position });
  } else {
    if (player?.key === room.current.id) player.play(); // play inside the tap so iOS treats it as user-started
    socket.emit('cmd:play', { position });
  }
}
const seekBy = (delta) => {
  if (!room?.current || isLive(room.current)) return;
  const dur = durationNow() || Infinity;
  socket.emit('cmd:seek', { position: Math.min(dur, Math.max(0, expectedNow() + delta)) });
};

$('#playBtn').addEventListener('click', togglePlay);
$('#tapShield').addEventListener('click', () => {
  if (social?.tookTap()) return; // that was a press-and-hold ping, not a tap
  if (tapNeeded) player?.play(); // the one tap an iPhone needs before a video can play
  else togglePlay();
});
$('#becomeRemote').addEventListener('click', () => {
  me.remote = true;
  document.body.classList.add('is-remote');
  socket.emit('member:remote', { on: true });
  lastItemId = undefined; // re-render the stage as a remote
});
$('#back10').addEventListener('click', () => seekBy(-10));
$('#fwd10').addEventListener('click', () => seekBy(10));
$('#skipBtn').addEventListener('click', () => socket.emit('queue:skip'));
$('#skipExternal').addEventListener('click', () => socket.emit('queue:skip'));
$('#scrub').addEventListener('input', () => { scrubbing = true; updateControls(); });
$('#scrub').addEventListener('change', (e) => {
  scrubbing = false;
  socket.emit('cmd:seek', { position: Number(e.target.value) });
});
$('#startTogether').addEventListener('click', () => socket.emit('countdown:start', { seconds: 5 }));
$('#cancelCountdown').addEventListener('click', () => socket.emit('countdown:cancel'));
document.addEventListener('keydown', (e) => {
  if (!room || e.target.closest('input, select, textarea, button')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowLeft') seekBy(-10);
  if (e.code === 'ArrowRight') seekBy(10);
});

// ---------- queue ----------
const KIND_LABELS = { youtube: 'YouTube', vimeo: 'Vimeo', tiktok: 'TikTok', file: 'Video link', jellyfin: 'Jellyfin', plex: 'Plex', instagram: 'Instagram', local: 'Video file' };
function kindLabel(it) {
  if (it.kind === 'twitch') return it.live ? 'Twitch, live' : 'Twitch';
  if (KIND_LABELS[it.kind]) return KIND_LABELS[it.kind];
  const ep = epLabel(it);
  const svc = it.service && it.service !== 'Other' ? it.service : 'Your own screen';
  return ep ? `${svc}, ${ep}` : svc;
}

const THUMB_TEXT = { vimeo: 'V', twitch: 'TW', tiktok: 'TT', jellyfin: 'JF', plex: 'PLEX', instagram: 'IG', local: 'FILE' };
function thumbFor(it) {
  const box = el('div', { class: `thumb thumb-${it.kind}` });
  const src = thumbUrl(it);
  if (src) box.append(el('img', { src, alt: '', loading: 'lazy' }));
  else if (it.kind === 'file') box.textContent = it.format === 'hls' ? 'HLS' : it.format.toUpperCase();
  else if (THUMB_TEXT[it.kind]) box.textContent = THUMB_TEXT[it.kind];
  else box.textContent = it.service === 'Hulu' ? 'H' : it.service === 'Netflix' ? 'N' : 'TV';
  return box;
}

function renderQueue() {
  const ol = $('#queue');
  const rows = [];
  if (room.current) {
    rows.push(el('li', { class: 'q-item is-current' },
      thumbFor(room.current),
      el('div', { class: 'q-text' },
        el('p', { class: 'q-title' }, room.current.title),
        el('p', { class: 'q-sub' }, `Playing now. ${kindLabel(room.current)}`)),
    ));
  }
  room.queue.forEach((it, i) => {
    rows.push(el('li', { class: 'q-item' },
      thumbFor(it),
      el('div', { class: 'q-text' },
        el('p', { class: 'q-title' }, it.title),
        el('p', { class: 'q-sub' }, `${kindLabel(it)}${it.addedBy ? `. Added by ${it.addedBy}` : ''}`)),
      el('div', { class: 'q-actions' },
        el('button', { class: 'btn btn-small', onclick: () => socket.emit('queue:play', { id: it.id }) }, 'Play now'),
        i > 0 ? el('button', { class: 'btn btn-quiet btn-small', 'aria-label': `Move ${it.title} up`, onclick: () => socket.emit('queue:move', { id: it.id, dir: 'up' }) }, 'Up') : null,
        el('button', { class: 'btn btn-quiet btn-small', 'aria-label': `Remove ${it.title}`, onclick: () => socket.emit('queue:remove', { id: it.id }) }, 'Remove')),
    ));
  });
  if (!rows.length) rows.push(el('li', { class: 'q-empty' }, 'Up next is empty. Add the first thing to watch.'));
  // Everything that was on stays here, newest first, so you can go back to it.
  if (room.played?.length) {
    rows.push(el('li', { class: 'q-section' },
      el('span', {}, 'Played'),
      el('button', { class: 'btn btn-quiet btn-small', onclick: () => socket.emit('played:clear') }, 'Clear')));
    for (const it of room.played) {
      rows.push(el('li', { class: 'q-item is-played' },
        thumbFor(it),
        el('div', { class: 'q-text' },
          el('p', { class: 'q-title' }, it.title),
          el('p', { class: 'q-sub' }, `${kindLabel(it)}${it.kind === 'local' && !share?.has(it.fp) ? '. Pick or get the file again to play it' : ''}`)),
        el('div', { class: 'q-actions' },
          el('button', { class: 'btn btn-small', onclick: () => socket.emit('played:again', { id: it.id, now: true }) }, 'Play again'),
          el('button', { class: 'btn btn-quiet btn-small', onclick: () => socket.emit('played:again', { id: it.id, now: false }) }, 'Add back'),
          el('button', { class: 'btn btn-quiet btn-small', 'aria-label': `Remove ${it.title} from Played`, onclick: () => socket.emit('played:remove', { id: it.id }) }, 'Remove')),
      ));
    }
  }
  ol.replaceChildren(...rows);
}

// ---------- the add picker ----------
// Three ways to add something (a link, a file from this device, a show name), and under the
// link box, every source Couchline understands, each with a line on how to get its link.
const SOURCES = [
  { label: 'YouTube', placeholder: 'https://youtu.be/...', help: 'A video, Short, or live link. Plays here, in sync.' },
  { label: 'Vimeo', placeholder: 'https://vimeo.com/...', help: 'A Vimeo video link, unlisted ones included. Plays here, in sync.' },
  { label: 'Twitch', placeholder: 'https://www.twitch.tv/videos/...', help: 'A past broadcast (twitch.tv/videos/...) plays fully in sync. A channel link plays live: play and pause are shared, seeking is off. Clips can’t be synced.' },
  { label: 'Video link', placeholder: 'https://.../movie.mp4', help: 'A direct link to an .mp4, .webm, or .m3u8 file. Plays here, in sync. For a file on your computer, use Pick a file.' },
  { label: 'Jellyfin', placeholder: 'https://jellyfin.../Items/.../Download?api_key=...', help: 'Open the movie or episode, open its three dots menu, choose Copy Stream URL, and paste that. The link includes your sign-in token, so everyone in the room could use your account. Safer: a separate Jellyfin user that only sees this library.', warn: true },
  { label: 'Plex', placeholder: 'https://...plex.direct:32400/library/metadata/...', help: 'Open the movie or episode, choose Get Info, then View XML, and paste that page’s link. The link includes your Plex token, which works like your password. Safer: a Plex managed user that only sees this library.', warn: true },
  { label: 'Netflix', placeholder: 'https://www.netflix.com/watch/...', help: 'The episode or movie link. Syncs on its own when everyone uses the Couchline extension on a computer, otherwise a shared countdown.' },
  { label: 'Hulu', placeholder: 'https://www.hulu.com/watch/...', help: 'The episode or movie link. Syncs on its own when everyone uses the Couchline extension on a computer, otherwise a shared countdown.' },
  { label: 'Instagram', placeholder: 'https://www.instagram.com/reel/...', help: 'A reel or post link. Starts on a shared countdown. Got several? Use Swipe together below to go through them as one.' },
  { label: 'TikTok', placeholder: 'https://www.tiktok.com/@.../video/...', help: 'A TikTok video link, including the short ones from the Share button. Plays here, in sync. Got several? Use Swipe together below.' },
];
$('#sourceChips').append(...SOURCES.map((src) => el('button', {
  type: 'button', class: 'chip', 'aria-pressed': 'false',
  onclick: (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    for (const c of $('#sourceChips').children) c.setAttribute('aria-pressed', String(on && c === e.currentTarget));
    $('#addInput').placeholder = on ? src.placeholder : 'Paste a link';
    $('#sourceHelp').textContent = on ? src.help : '';
    $('#sourceHelp').className = src.warn ? 'note note-warn' : 'note';
    $('#sourceHelp').hidden = !on;
    $('#addInput').focus();
  },
}, src.label)));

$('#showAddForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#showAddName').value.trim();
  if (!name) return;
  // A show picked from the search carries its poster and the chosen episode.
  const picked = adding?.typedShow(name);
  const input = picked?.season ? `${name} S${picked.season} E${picked.episode}` : name;
  socket.emit('queue:add', {
    input, service: $('#showAddService').value, asName: true,
    poster: picked?.poster, season: picked?.season, episode: picked?.episode,
  }, (res) => {
    if (res?.error) return toast({ text: res.error });
    $('#showAddName').value = '';
    adding?.resetTypedShow();
  });
});

$('#filePick').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const status = $('#fileStatus');
  status.textContent = `Checking ${file.name}.`;
  const duration = await probeVideo(file);
  if (duration == null) {
    status.textContent = 'This browser can’t play that file. An .mp4 (H.264 video, AAC audio) plays everywhere.';
    return;
  }
  const fp = await share.add(file);
  socket.emit('queue:addLocal', { name: file.name, size: file.size, mime: file.type, fp, duration }, (res) => {
    status.textContent = res?.error || `Added ${file.name}. It plays from this device.`;
  });
});

// ---------- files from people's devices ----------
let localKey = '';
let mismatch = null; // { itemId, file } when someone picked a copy that isn't the same file

async function pickCopy(file, cur) {
  if (!file) return;
  $('#localStatus').textContent = 'Checking the file.';
  const fp = await fingerprint(file);
  if (fp === cur.fp) {
    mismatch = null;
    await share.add(file);
  } else {
    mismatch = { itemId: cur.id, file };
    localKey = '';
    renderLocal();
  }
}

function renderLocal() {
  const cur = room?.current;
  if (!share) return;
  // A copy just arrived (picked or downloaded), so start the player with it.
  if (cur?.kind === 'local' && share.has(cur.fp) && player?.key === cur.id && !player.ready) {
    player.load(cur, expectedNow());
    tick();
  }
  const need = cur?.kind === 'local' && !me.remote && !share.has(cur.fp);
  $('#localCard').hidden = !need;
  if (!need) { localKey = ''; return; }

  const t = share.incoming(cur.fp);
  const failed = [...share.transfers.values()].reverse().find((x) => x.dir === 'in' && x.fp === cur.fp && x.error);
  const owners = room.members.filter((m) => m.id !== clientId && m.files?.includes(cur.fp));
  const wrongFile = mismatch?.itemId === cur.id ? mismatch.file : null;

  // Rebuild the buttons only when they change, so an open file dialog isn't swept away.
  const key = JSON.stringify([cur.id, t?.id, owners.map((m) => m.id), !!wrongFile]);
  if (key !== localKey) {
    localKey = key;
    $('#localName').textContent = cur.title;
    $('#localMeta').textContent = [formatSize(cur.size), cur.duration ? fmt(cur.duration) : null].filter(Boolean).join(', ');
    const actions = [el('label', { class: 'btn btn-primary file-pick' }, 'Choose my copy',
      el('input', { type: 'file', class: 'sr', accept: 'video/*,.mp4,.m4v,.mov,.webm,.mkv', onchange: (e) => pickCopy(e.target.files[0], cur) }))];
    if (t) actions.push(el('button', { class: 'btn btn-quiet', onclick: () => share.cancel(t.id) }, 'Stop'));
    else for (const m of owners) actions.push(el('button', { class: 'btn', onclick: () => share.request(m.id, cur) }, `Get it from ${m.name}`));
    if (wrongFile) {
      actions.push(el('button', { class: 'btn btn-quiet', onclick: () => { mismatch = null; share.useAnyway(cur.fp, wrongFile); } }, 'Use mine anyway'));
    }
    $('#localActions').replaceChildren(...actions);
  }

  const bar = $('#localProgress');
  bar.hidden = !t;
  let status = '';
  if (t) {
    const from = room.members.find((m) => m.id === t.peer)?.name || 'them';
    bar.style.setProperty('--p', `${t.size ? (t.done / t.size) * 100 : 0}%`);
    status = t.state === 'connecting' ? `Connecting to ${from}.` : `Getting it from ${from}: ${formatSize(t.done)} of ${formatSize(t.size)}. It plays as soon as it’s here.`;
  } else if (wrongFile) {
    status = 'That isn’t the same file (a different size or version), so it may not line up with everyone else.';
  } else if (failed) {
    status = failed.error;
  } else if (!owners.length) {
    status = 'Nobody in the room can send it right now, so pick your own copy.';
  }
  $('#localStatus').textContent = status;
}

function shareNotice(t) {
  const to = room?.members.find((m) => m.id === t.peer)?.name || 'someone';
  toast({ text: t.state === 'done' ? `Sent ${t.name} to ${to}` : `Sending ${t.name} to ${to}` });
}

// Link detection uses the same parser as the server (public/media.js), so the hint under
// the box always matches what will actually happen.
const SOURCE_HINTS = {
  youtube: 'YouTube. Plays here, in sync.',
  vimeo: 'Vimeo. Plays here, in sync.',
  file: 'Video link. Plays here, in sync.',
  jellyfin: 'Jellyfin. Plays here, in sync.',
  plex: 'Plex. Plays here, in sync.',
  instagram: 'Instagram. Starts on a shared countdown.',
  tiktok: 'TikTok. Plays here, in sync.',
};
function sourceHint(m) {
  if (m.kind === 'twitch') return m.live ? 'Twitch live stream. Plays here. Play and pause are shared; seeking is off for live.' : 'Twitch video. Plays here, in sync.';
  if (SOURCE_HINTS[m.kind]) return SOURCE_HINTS[m.kind];
  if (m.service) return `${m.service}. Syncs on its own when everyone uses the Couchline extension, otherwise a shared countdown.`;
  return null;
}

// "warnFrom" is the index of the first line to show as a warning.
function renderAddNotes(lines, warnFrom = 0) {
  const box = $('#addNotes');
  box.replaceChildren(...lines.map((t, i) => el('p', { class: i >= warnFrom ? 'note note-warn' : 'note' }, t)));
  box.hidden = !lines.length;
}

$('#addInput').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  const m = v ? parseMedia(v) : null;
  const typedName = m?.kind === 'stream' && !m.url;
  $('#addService').hidden = !typedName;
  $('#addError').hidden = true;
  if (!m || typedName) return renderAddNotes([]);
  if (m.error) return renderAddNotes([m.error]);
  const hint = sourceHint(m);
  const warnings = mediaWarnings(m, { secure: location.protocol === 'https:' });
  renderAddNotes([hint, ...warnings].filter(Boolean), hint ? 1 : 0);
});
$('#addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#addInput').value.trim();
  if (!input) return;
  socket.emit('queue:add', { input, service: $('#addService').value }, (res) => {
    if (res?.error) {
      $('#addError').textContent = res.error;
      $('#addError').hidden = false;
      return;
    }
    $('#addInput').value = '';
    $('#addService').hidden = true;
    // Token warnings stay up after adding, since the link is now shared with the room.
    renderAddNotes(res?.warnings || []);
  });
});

// ---------- shows ----------
function renderShows() {
  const ul = $('#shows');
  if (!room.shows.length) {
    ul.replaceChildren(el('li', { class: 'q-empty' }, 'No shows yet. Add one you’re watching together.'));
    return;
  }
  ul.replaceChildren(...room.shows.map((s) => el('li', { class: s.poster ? 'show has-poster' : 'show' },
    s.poster ? el('img', { class: 'show-poster', src: s.poster, alt: '', loading: 'lazy' }) : null,
    el('div', { class: 'show-head' },
      el('p', { class: 'show-title' }, s.title),
      el('p', { class: 'show-service' }, s.service === 'Other' ? 'Own screen' : s.service)),
    el('p', { class: 'show-ep', 'aria-label': `Season ${s.season}, episode ${s.episode}` }, `S${s.season} E${s.episode}`),
    el('div', { class: 'show-actions' },
      el('button', { class: 'btn btn-primary btn-small', onclick: () => socket.emit('show:watch', { id: s.id }) }, 'Watch together'),
      el('button', { class: 'btn btn-small', onclick: () => socket.emit('show:finish', { id: s.id }) }, `Finished E${s.episode}`),
      s.episode > 1 ? el('button', { class: 'btn btn-quiet btn-small', onclick: () => socket.emit('show:set', { id: s.id, season: s.season, episode: s.episode - 1 }) }, 'Back one') : null,
      el('button', { class: 'btn btn-quiet btn-small', 'aria-label': `Remove ${s.title}`, onclick: () => socket.emit('show:remove', { id: s.id }) }, 'Remove')),
  )));
}

$('#showForm').addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('show:add', {
    title: $('#showTitle').value, service: $('#showService').value,
    season: $('#showSeason').value, episode: $('#showEpisode').value,
    poster: adding?.showExtras().poster,
  });
  $('#showTitle').value = '';
  $('#showSeason').value = '1';
  $('#showEpisode').value = '1';
});

// Each tab list (the panel tabs, and the add picker's modes) switches only its own panels.
for (const btn of document.querySelectorAll('[role=tab]')) {
  btn.addEventListener('click', () => {
    for (const b of btn.closest('[role=tablist]').querySelectorAll('[role=tab]')) {
      const on = b === btn;
      b.setAttribute('aria-selected', String(on));
      document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
    }
  });
}

// ---------- room menu ----------
function setRoomMenu(open) {
  $('#roomMenu').hidden = !open;
  $('#roomChip').setAttribute('aria-expanded', String(open));
}
$('#roomChip').addEventListener('click', () => setRoomMenu($('#roomMenu').hidden));
document.addEventListener('click', (e) => { if (!e.target.closest('.room-wrap')) setRoomMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setRoomMenu(false); });
async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast({ text: done }); } catch { toast({ text }); }
}
$('#copyCode').addEventListener('click', () => copy(roomId, 'Copied the room code'));
$('#copyLink').addEventListener('click', () => copy(`${location.origin}/r/${roomId}`, 'Copied the room link'));
$('#switchRoom').addEventListener('submit', (e) => {
  e.preventDefault();
  goToRoom($('#switchCode').value);
});

// ---------- call layout and full screen ----------
function setLayout(layout) {
  document.body.dataset.callLayout = layout;
  store.set('callLayout', layout);
  for (const b of document.querySelectorAll('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === layout));
}
setLayout(store.get('callLayout', 'below'));
for (const b of document.querySelectorAll('[data-layout]')) b.addEventListener('click', () => setLayout(b.dataset.layout));

// Full screen keeps the call on screen (floating, or half and half). Phones that can't make a
// page full screen (iPhone) still get the same full-window view.
function setFull(on) {
  document.body.classList.toggle('is-full', on);
  $('#fullBtn').textContent = on ? 'Exit full screen' : 'Full screen';
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
$('#fullBtn').addEventListener('click', () => setFull(!document.body.classList.contains('is-full')));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('is-full')) setFull(false); });

// Tap a face to make it bigger; double tap for full screen.
$('#tiles').addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const big = !tile.classList.contains('is-big');
  for (const t of $('#tiles').children) t.classList.remove('is-big');
  tile.classList.toggle('is-big', big);
});
$('#tiles').addEventListener('dblclick', (e) => {
  const video = e.target.closest('.tile')?.querySelector('video');
  if (!video) return;
  if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
  else video.webkitEnterFullscreen?.();
});

// ---------- camera, microphone, speaker ----------
async function renderDevices() {
  const { cameras, mics, speakers, chosen } = await call.listDevices();
  const fill = (sel, list, current, fallback) => {
    sel.replaceChildren(...list.map((d, i) => el('option', { value: d.deviceId, selected: d.deviceId === current }, d.label || `${fallback} ${i + 1}`)));
    sel.disabled = !list.length;
  };
  $('#optMirror').checked = call.mirror;
  fill($('#camSelect'), cameras, chosen.camera, 'Camera');
  fill($('#micSelect'), mics, chosen.mic, 'Microphone');
  fill($('#speakerSelect'), speakers, chosen.speaker, 'Speaker');
  $('#speakerField').hidden = !speakers.length;
  const unnamed = [...cameras, ...mics].some((d) => !d.label);
  $('#deviceNote').textContent = !cameras.length && !mics.length
    ? 'No camera or microphone found.'
    : unnamed ? 'Join the call once to see device names. Your choice is remembered on this device.' : 'Your choice is remembered on this device.';
}
$('#devicesBtn').addEventListener('click', () => {
  const open = $('#devicePanel').hidden;
  $('#devicePanel').hidden = !open;
  $('#devicesBtn').setAttribute('aria-expanded', String(open));
  if (open) renderDevices();
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (!$('#devicePanel').hidden) renderDevices(); });
$('#optMirror').addEventListener('change', (e) => call.setMirror(e.target.checked));
for (const [sel, kind] of [['#camSelect', 'camera'], ['#micSelect', 'mic'], ['#speakerSelect', 'speaker']]) {
  $(sel).addEventListener('change', async (e) => {
    const ok = await call.useDevice(kind, e.target.value);
    if (!ok) toast({ text: 'That device couldn’t be used. It may be busy in another app.' });
    renderCallButtons();
  });
}

// ---------- call ----------
async function startCall() {
  const ok = await call.start();
  if (!ok) {
    toast({ text: 'Camera and mic are blocked. You can still watch. Allow them in your browser settings to join the call.' });
  }
  renderCallButtons();
  if (!$('#devicePanel').hidden) renderDevices(); // names appear once the camera is allowed
}
function renderCallButtons() {
  $('#joinCallBtn').hidden = call.active;
  $('#micBtn').hidden = !call.active;
  $('#camBtn').hidden = !call.active || !call.camOn;
  $('#camOnBtn').hidden = !call.active || call.camOn || !call.videoAllowed;
  $('#leaveCallBtn').hidden = !call.active;
  $('#popOutBtn').hidden = !(popout?.available() || popout?.active);
  $('#popOutBtn').textContent = popout?.active ? 'Pop back in' : 'Pop out';
  popout?.syncSession();
  const waiting = call.active && !call.videoAllowed;
  $('#callNote').hidden = !waiting;
  if (waiting) $('#callNote').textContent = 'Five cameras are on, so you’re on audio. You’ll get a Turn camera on button when a spot opens.';
}
$('#popOutBtn').addEventListener('click', async () => {
  const ok = await popout.toggle();
  if (ok === false) toast({ text: 'This browser can’t pop the call out. Try Chrome, or Safari on iPhone.' });
  renderCallButtons();
});
$('#camOnBtn').addEventListener('click', async () => {
  if (!(await call.enableCamera())) toast({ text: 'The camera couldn’t start. It may be blocked or busy in another app.' });
  renderCallButtons();
});
$('#joinCallBtn').addEventListener('click', startCall);
$('#leaveCallBtn').addEventListener('click', () => { call.leave(); renderCallButtons(); });
$('#micBtn').addEventListener('click', (e) => { e.target.textContent = call.toggleMic() ? 'Mute' : 'Unmute'; });
$('#camBtn').addEventListener('click', (e) => { e.target.textContent = call.toggleCam() ? 'Camera off' : 'Camera on'; });

// ---------- reactions, toasts, invite ----------
$('#reactions').append(...REACTIONS.map((emoji) => el('button', {
  class: 'react-btn', 'aria-label': `React ${emoji}`, onclick: () => socket?.emit('react', { emoji }),
}, emoji)));

function floatReaction({ emoji, color, jinx }) {
  const layer = $('#reactLayer');
  const count = jinx ? 10 : 1;
  for (let i = 0; i < count; i++) {
    const node = el('span', { class: jinx ? 'float big' : 'float' }, emoji);
    node.style.left = `${5 + Math.random() * 85}%`;
    node.style.animationDelay = `${i * 70}ms`;
    node.style.setProperty('--c', colorOf(color));
    layer.append(node);
    setTimeout(() => node.remove(), 2400 + i * 70);
  }
  if (jinx) {
    const word = el('span', { class: 'jinx-word' }, 'Jinx!');
    layer.append(word);
    setTimeout(() => word.remove(), 1700);
    navigator.vibrate?.([30, 40, 30]);
  }
}


$('#share').addEventListener('click', async () => {
  const url = `${location.origin}/r/${roomId}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Watch with me on Couchline', url });
    else { await navigator.clipboard.writeText(url); toast({ text: 'Copied the room link' }); }
  } catch { /* share sheet closed */ }
});
