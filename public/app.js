import { Clock, expectedPosition, correction, fmt } from './sync.js';
import { YouTubePlayer, YTState } from './youtube.js';
import { Call } from './call.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}
// Icons live as <symbol>s in index.html; this just points a <use> at one.
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

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
if (routeMatch) {
  roomId = routeMatch[1].toLowerCase();
  $('#entryRoom').textContent = roomId;
  $('#name').value = store.get('name', '');
  $('#optRemote').checked = store.get('remote', false);
  show('entry');
  $('#name').focus();
} else {
  show('landing');
}

for (const btn of document.querySelectorAll('[data-create-room]')) {
  btn.addEventListener('click', () => { location.href = `/r/${newRoomCode()}`; });
}
$('#joinCode').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#code').value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (code.length >= 3) location.href = `/r/${code}`;
});
$('#entryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#name').value.trim().slice(0, 24);
  if (!name) return;
  enterRoom({ name, call: $('#optCall').checked, remote: $('#optRemote').checked });
});

// ---------- room ----------
let socket, clock, yt, call;
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
  me.remote = opts.remote;
  document.body.classList.toggle('is-remote', me.remote);
  $('#roomCodeText').textContent = roomId;
  show('room');

  socket = window.io({ transports: ['websocket', 'polling'] });
  clock = new Clock(socket);
  if (!me.remote) yt = new YouTubePlayer('yt');
  call = new Call({ socket, selfId: clientId, tilesEl: $('#tiles') });
  if (opts.call) startCall(); // inside the tap, so iOS allows camera and audio

  socket.on('connect', () => {
    socket.emit('join', {
      roomId, clientId, name: opts.name, remote: me.remote, cache: store.get(`room:${roomId}`),
    }, async (res) => {
      if (res?.error) return toast({ text: res.error });
      if (res?.iceServers) call.iceServers = res.iceServers;
      await clock.calibrate();
      if (call.active) socket.emit('call:state', { inCall: true });
    });
  });
  socket.on('disconnect', () => toast({ text: 'Connection lost. Reconnecting.' }));
  socket.on('state', onState);
  socket.on('toast', toast);
  socket.on('react', floatReaction);
  socket.on('go', onGo);
  socket.on('signal', (d) => call.handleSignal(d));

  setInterval(tick, 500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeLock = null; tick(); } });
}

function onState(s) {
  room = s;
  store.set(`room:${roomId}`, { current: s.current, queue: s.queue, shows: s.shows });
  renderRoster();
  renderStage();
  renderQueue();
  renderShows();
  call.sync(s.members);
  tick();
}

const self = () => room?.members.find((m) => m.id === clientId);
const colorOf = (c) => (c ? `var(--${c})` : 'var(--muted)');

function renderRoster() {
  const ul = $('#roster');
  ul.replaceChildren(...room.members.map((m) => {
    const mine = m.id === clientId;
    return el('li', { 'data-color': m.color, class: mine ? 'is-me' : null, title: `${m.name}${mine ? ' (you)' : ''}${m.remote ? ', remote' : ''}` },
      el('span', { class: 'avatar', 'aria-hidden': 'true' }, initial(m.name)),
      el('span', { class: 'who' }, m.name),
      mine ? el('span', { class: 'tag' }, 'you') : m.remote ? el('span', { class: 'tag' }, 'remote') : null,
    );
  }));
}

// ---------- stage ----------
function epLabel(it) {
  if (it.season && it.episode) return `S${it.season} E${it.episode}`;
  if (it.episode) return `Episode ${it.episode}`;
  return '';
}

function renderStage() {
  const cur = room.current;
  const kind = cur?.kind ?? null;
  const stage = $('#stage');
  stage.dataset.kind = kind || 'empty';
  $('#emptyStage').hidden = !!cur;
  $('#ytWrap').hidden = !(kind === 'youtube' && !me.remote);
  $('#remotePoster').hidden = !(kind === 'youtube' && me.remote);
  $('#igWrap').hidden = kind !== 'instagram';
  $('#streamCard').hidden = kind !== 'stream';
  $('#controls').hidden = kind !== 'youtube';
  $('#startBar').hidden = !(kind === 'instagram' || kind === 'stream') || !!room.countdown;

  if ((cur?.id ?? null) !== lastItemId) {
    lastItemId = cur?.id ?? null;
    endedSent = null;
    playPendingSince = 0;
    setTapNeeded(false);
    if (kind === 'youtube') {
      if (yt) yt.load(cur.videoId, room.playback.position);
      $('#remoteThumb').src = `https://i.ytimg.com/vi/${cur.videoId}/hqdefault.jpg`;
    } else if (yt?.ready) {
      yt.stop();
    }
    const frame = $('#igFrame');
    if (kind === 'instagram') frame.src = `https://www.instagram.com/${cur.igType}/${cur.code}/embed/`;
    else frame.removeAttribute('src'); // stops a reel that's still playing
  }

  const open = $('#openExternal');
  if (kind === 'stream') {
    $('#streamService').textContent = cur.service && cur.service !== 'Other' ? cur.service : 'On your own screen';
    $('#streamTitle').textContent = cur.title;
    $('#streamEp').textContent = epLabel(cur);
    open.hidden = !cur.url;
    if (cur.url) { open.href = cur.url; open.textContent = `Open ${cur.service || 'link'}`; }
  } else if (kind === 'instagram') {
    open.hidden = false;
    open.href = cur.url;
    open.textContent = 'Open in Instagram';
  } else {
    open.hidden = true;
  }
  renderCountdown();
}

function renderCountdown() {
  const box = $('#countdown');
  cancelAnimationFrame(cdRaf);
  if (!room.countdown) { box.hidden = true; return; }
  box.hidden = false;
  box.style.setProperty('--cd', colorOf(room.countdown.color));
  $('#countBy').textContent = room.countdown.by ? `${room.countdown.by === self()?.name ? 'You' : room.countdown.by} started the countdown` : '';
  const cur = room.current;
  const svc = cur?.service && cur.service !== 'Other' ? cur.service : 'your screen';
  $('#countHint').textContent = cur?.kind === 'stream' ? `Get ready to press play on ${svc}`
    : cur?.kind === 'instagram' ? 'Get ready to tap play on the reel' : 'Starting on both screens';
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
  if (cur.kind === 'youtube') return;
  flash(cur.kind === 'instagram' ? 'Tap play now' : `Press play on ${cur.service && cur.service !== 'Other' ? cur.service : 'your screen'} now`);
}

function flash(text) {
  const f = $('#goFlash');
  f.textContent = text;
  f.hidden = false;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { f.hidden = true; }, 2600);
}

function setTapNeeded(on) {
  $('#tapToStart').hidden = !on;
  $('#tapShield').hidden = on; // let the tap reach YouTube's own player once
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
  const cur = room.current;
  if (!cur || cur.kind !== 'youtube' || me.remote || !yt?.ready || yt.videoId !== cur.videoId) {
    setWake(false);
    return;
  }
  const st = yt.state();
  const t = yt.time();
  const exp = expectedNow();
  const now = performance.now();

  const dur = yt.duration();
  if (dur && !cur.duration) socket.emit('media:meta', { itemId: cur.id, duration: dur });

  if (st === YTState.ENDED) {
    if (endedSent !== cur.id && room.playback.playing) {
      endedSent = cur.id;
      socket.emit('media:ended', { itemId: cur.id });
    }
    return;
  }

  if (roomIsPlaying()) {
    if (st === YTState.BUFFERING) {
      bufferingSince ||= now;
      if (!reportedBuffering && now - bufferingSince > 1500) {
        reportedBuffering = true;
        socket.emit('buffering', { on: true });
      }
      return;
    }
    bufferingSince = 0;
    if (st !== YTState.PLAYING) {
      playPendingSince ||= now;
      if (now - lastSeekAt > 1000) {
        if (Math.abs(t - exp) > 1 && st !== YTState.CUED && st !== YTState.UNSTARTED) yt.seek(exp);
        yt.play();
        lastSeekAt = now;
      }
      // iPhones block video that starts without a tap. Ask once, then the API works.
      if (now - playPendingSince > 2500 && (st === YTState.CUED || st === YTState.UNSTARTED)) setTapNeeded(true);
      return;
    }
    playPendingSince = 0;
    setTapNeeded(false);
    if (reportedBuffering) { reportedBuffering = false; socket.emit('buffering', { on: false }); }
    if (!yt.fineRates) yt.checkRates();
    const drift = t - exp;
    const fix = correction(drift, { fineRates: yt.fineRates, settling: now - lastSeekAt < 2000 });
    if (fix.seek) { yt.seek(exp + 0.2); lastSeekAt = now; } else if (fix.rate !== yt.rate()) yt.setRate(fix.rate);
    if (now - lastDriftSent > 2000) {
      lastDriftSent = now;
      socket.emit('drift', { value: Math.round(drift * 10) / 10 });
    }
    setWake(true);
  } else {
    playPendingSince = 0;
    setTapNeeded(false);
    bufferingSince = 0;
    if (reportedBuffering) { reportedBuffering = false; socket.emit('buffering', { on: false }); }
    if (st === YTState.PLAYING || st === YTState.BUFFERING) yt.pause();
    if (yt.rate() !== 1) yt.setRate(1);
    const target = room.playback.position;
    if (st !== YTState.CUED && st !== YTState.UNSTARTED && Math.abs(t - target) > 0.5 && now - lastSeekAt > 800) {
      yt.seek(target);
      lastSeekAt = now;
    }
    setWake(false);
  }
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
  return (yt?.videoId === room?.current?.videoId && yt?.duration()) || room?.current?.duration || 0;
}

function updateControls() {
  if (!room?.current || room.current.kind !== 'youtube') return;
  const exp = expectedNow();
  const dur = durationNow();
  const playing = room.playback.playing;
  $('#playBtn').classList.toggle('is-playing', playing);
  $('#playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  const scrub = $('#scrub');
  scrub.disabled = !dur;
  scrub.max = String(dur || 1);
  if (!scrubbing) scrub.value = String(dur ? Math.min(exp, dur) : 0);
  scrub.style.setProperty('--fill', dur ? `${(Number(scrub.value) / dur) * 100}%` : '0%');
  $('#time').textContent = fmt(scrubbing ? Number(scrub.value) : exp);
  $('#timeDur').textContent = dur ? fmt(dur) : '';

  const pill = $('#syncPill');
  let text = 'In sync';
  let mode = 'ok';
  const others = room.members.filter((m) => m.id !== clientId && !m.remote);
  const lagging = others.find((m) => m.drift != null && Math.abs(m.drift) > 0.8);
  const mine = self()?.drift;
  if (room.holds.length) { text = `Waiting for ${room.holds.join(' and ')}`; mode = 'wait'; }
  else if (!playing) { text = 'Paused'; mode = 'idle'; }
  else if (waitingForLaunch()) { text = 'Starting'; mode = 'idle'; }
  else if (mine != null && Math.abs(mine) > 0.8 && !me.remote) { text = 'Catching up'; mode = 'wait'; }
  else if (lagging) { text = `${lagging.name} is catching up`; mode = 'wait'; }
  pill.textContent = text;
  pill.dataset.mode = mode;
}

function togglePlay() {
  if (!room?.current || room.current.kind !== 'youtube') return;
  const position = expectedNow();
  if (room.playback.playing) {
    socket.emit('cmd:pause', { position });
  } else {
    yt?.play(); // play inside the tap so iOS treats it as user-started
    socket.emit('cmd:play', { position });
  }
}
const seekBy = (delta) => {
  const dur = durationNow() || Infinity;
  socket.emit('cmd:seek', { position: Math.min(dur, Math.max(0, expectedNow() + delta)) });
};

$('#playBtn').addEventListener('click', togglePlay);
$('#tapShield').addEventListener('click', togglePlay);
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
function kindLabel(it) {
  if (it.kind === 'youtube') return 'YouTube';
  if (it.kind === 'instagram') return 'Instagram';
  const ep = epLabel(it);
  const svc = it.service && it.service !== 'Other' ? it.service : 'Your own screen';
  return ep ? `${svc}, ${ep}` : svc;
}

function thumbFor(it) {
  const box = el('div', { class: `thumb thumb-${it.kind}` });
  if (it.kind === 'youtube') {
    box.textContent = 'YouTube';
    const img = el('img', { src: `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  else if (it.kind === 'instagram') box.textContent = 'Reel';
  else box.textContent = it.service && it.service !== 'Other' ? it.service : 'TV';
  return box;
}

function iconButton(name, label, onclick, extra = '') {
  return el('button', { type: 'button', class: `icon-btn icon-btn-sq ${extra}`.trim(), 'aria-label': label, title: label, onclick }, icon(name));
}

function renderQueue() {
  const ol = $('#queue');
  const rows = [];
  if (room.current) {
    rows.push(el('li', { class: 'q-item is-current' },
      thumbFor(room.current),
      el('div', { class: 'q-text' },
        el('p', { class: 'q-now' }, 'Now playing'),
        el('p', { class: 'q-title' }, room.current.title),
        el('p', { class: 'q-sub' }, kindLabel(room.current))),
    ));
  }
  room.queue.forEach((it, i) => {
    rows.push(el('li', { class: 'q-item' },
      thumbFor(it),
      el('div', { class: 'q-text' },
        el('p', { class: 'q-title' }, it.title),
        el('p', { class: 'q-sub' }, `${kindLabel(it)}${it.addedBy ? ` · ${it.addedBy}` : ''}`)),
      el('div', { class: 'q-actions' },
        iconButton('play', `Play ${it.title} now`, () => socket.emit('queue:play', { id: it.id }), 'q-play'),
        i > 0 ? iconButton('up', `Move ${it.title} up`, () => socket.emit('queue:move', { id: it.id, dir: 'up' })) : null,
        iconButton('x', `Remove ${it.title}`, () => socket.emit('queue:remove', { id: it.id }))),
    ));
  });
  if (!rows.length) rows.push(el('li', { class: 'q-empty' }, 'Up next is empty. Paste a link or type a show to add the first thing to watch.'));
  ol.replaceChildren(...rows);
  $('#queueCount').textContent = room.queue.length ? String(room.queue.length) : '';
}

const looksLikeLink = (v) => /^(https?:\/\/|www\.)|^[\w-]+\.[a-z]{2,}(\/|$)/i.test(v.trim());
$('#addInput').addEventListener('input', (e) => {
  const v = e.target.value;
  $('#addService').hidden = !v.trim() || looksLikeLink(v);
  $('#addError').hidden = true;
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
  });
});

// ---------- shows ----------
function renderShows() {
  const ul = $('#shows');
  if (!room.shows.length) {
    ul.replaceChildren(el('li', { class: 'q-empty' }, 'No shows yet. Add one you’re watching together.'));
    return;
  }
  ul.replaceChildren(...room.shows.map((s) => el('li', { class: 'show' },
    el('div', { class: 'show-head' },
      el('p', { class: 'show-title' }, s.title),
      el('p', { class: 'show-service' }, s.service === 'Other' ? 'Own screen' : s.service)),
    el('p', { class: 'show-ep', 'aria-label': `Season ${s.season}, episode ${s.episode}` }, `S${s.season} `, el('span', {}, '·'), ` E${s.episode}`),
    el('div', { class: 'show-actions' },
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => socket.emit('show:watch', { id: s.id }) }, 'Watch together'),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => socket.emit('show:finish', { id: s.id }) }, `Finished E${s.episode}`)),
    el('div', { class: 'show-more' },
      s.episode > 1 ? el('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: () => socket.emit('show:set', { id: s.id, season: s.season, episode: s.episode - 1 }) }, 'Back one episode') : null,
      el('button', { type: 'button', class: 'btn btn-ghost btn-xs', 'aria-label': `Remove ${s.title}`, onclick: () => socket.emit('show:remove', { id: s.id }) }, 'Remove')),
  )));
}

$('#showForm').addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('show:add', {
    title: $('#showTitle').value, service: $('#showService').value,
    season: $('#showSeason').value, episode: $('#showEpisode').value,
  });
  $('#showTitle').value = '';
  $('#showSeason').value = '1';
  $('#showEpisode').value = '1';
});

for (const btn of document.querySelectorAll('[role=tab]')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('[role=tab]')) {
      const on = b === btn;
      b.setAttribute('aria-selected', String(on));
      document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
    }
  });
}

// ---------- call ----------
async function startCall() {
  const ok = await call.start();
  if (!ok) {
    toast({ text: 'Camera and mic are blocked. You can still watch. Allow them in your browser settings to join the call.' });
  }
  renderCallButtons();
}
function renderCallButtons() {
  $('#joinCallBtn').hidden = call.active;
  $('#micBtn').hidden = !call.active;
  $('#camBtn').hidden = !call.active || !call.camOn;
  $('#leaveCallBtn').hidden = !call.active;
  for (const id of ['#micBtn', '#camBtn']) {
    const btn = $(id);
    if (!call.active) { btn.setAttribute('aria-pressed', 'false'); btn.querySelector('span').textContent = id === '#micBtn' ? 'Mute' : 'Camera off'; }
  }
}
$('#joinCallBtn').addEventListener('click', startCall);
$('#leaveCallBtn').addEventListener('click', () => { call.leave(); renderCallButtons(); });
$('#micBtn').addEventListener('click', () => {
  const on = call.toggleMic();
  const btn = $('#micBtn');
  btn.querySelector('span').textContent = on ? 'Mute' : 'Unmute';
  btn.setAttribute('aria-pressed', String(!on));
  btn.title = on ? 'Mute' : 'Unmute';
});
$('#camBtn').addEventListener('click', () => {
  const on = call.toggleCam();
  const btn = $('#camBtn');
  btn.querySelector('span').textContent = on ? 'Camera off' : 'Camera on';
  btn.setAttribute('aria-pressed', String(!on));
  btn.title = on ? 'Turn camera off' : 'Turn camera on';
});

// ---------- reactions, toasts, invite ----------
$('#reactions').append(...REACTIONS.map((emoji) => el('button', {
  class: 'react-btn', 'aria-label': `React ${emoji}`, onclick: () => socket?.emit('react', { emoji }),
}, emoji)));

function floatReaction({ emoji, color }) {
  const layer = $('#reactLayer');
  const node = el('span', { class: 'float', 'data-color': color }, emoji);
  node.style.left = `${10 + Math.random() * 75}%`;
  node.style.setProperty('--c', colorOf(color));
  layer.append(node);
  setTimeout(() => node.remove(), 2400);
}

function toast({ text, color }) {
  const box = $('#toasts');
  const node = el('p', { class: 'toast', 'data-color': color || null }, text);
  box.append(node);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => node.remove(), 3200);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/r/${roomId}`);
    toast({ text: 'Copied the room link' });
  } catch {
    toast({ text: `Room code: ${roomId}` });
  }
}
$('#share').addEventListener('click', async () => {
  const url = `${location.origin}/r/${roomId}`;
  if (!navigator.share) return copyLink();
  try { await navigator.share({ title: 'Watch with me on Couchline', url }); } catch { /* share sheet closed */ }
});
$('#roomCode').addEventListener('click', copyLink);
