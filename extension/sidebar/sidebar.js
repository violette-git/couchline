// Couchline extension sidebar. An extension page shown in a frame on Netflix or Hulu.
// It joins the room on the Couchline server as its own seat (tagged as the extension), runs
// the room's video call with the web app's call.js, sends reactions, and passes the room's
// state to the content script, which drives the video.
import { Clock } from '../lib/sync.js';
import { Call } from '../lib/call.js';

const $ = (s) => document.querySelector(s);
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

const REACTIONS = ['😂', '😮', '😭', '😍', '👀', '🙌'];
const params = new URLSearchParams(location.hash.slice(1));
const NONCE = params.get('n');
const SERVICE = params.get('svc') === 'Hulu' ? 'Hulu' : 'Netflix';
// Events the content script may send to the room through this page.
const PAGE_EVENTS = new Set(['cmd:play', 'cmd:pause', 'cmd:seek', 'buffering', 'drift', 'media:meta', 'countdown:start', 'ext:next']);

const session = {
  get() { try { return JSON.parse(sessionStorage.getItem('couchline:session')); } catch { return null; } },
  set(v) { try { if (v) sessionStorage.setItem('couchline:session', JSON.stringify(v)); else sessionStorage.removeItem('couchline:session'); } catch { /* blocked */ } },
};
// One seat per tab, so a Netflix tab and a Hulu tab don't knock each other out of the room.
function tabClientId() {
  let id = null;
  try { id = sessionStorage.getItem('couchline:clientId'); } catch { /* blocked */ }
  if (!id) {
    id = `ext-${crypto.randomUUID()}`;
    try { sessionStorage.setItem('couchline:clientId', id); } catch { /* blocked */ }
  }
  return id;
}
const clientId = tabClientId();

// ---------- channel to the content script ----------
let port = null;
let page = { watchId: null, onWatch: true };
chrome.runtime.onConnect.addListener((p) => {
  if (!NONCE || p.name !== `couchline:${NONCE}`) return;
  port = p;
  p.onMessage.addListener((msg) => {
    if (msg.t === 'emit' && PAGE_EVENTS.has(msg.ev)) socket?.emit(msg.ev, msg.data);
    else if (msg.t === 'page') { page = msg; if (room) renderStatus(); }
  });
  p.onDisconnect.addListener(() => { if (port === p) port = null; });
  pushState();
});
const toPage = (msg) => { try { port?.postMessage(msg); } catch { /* page navigated */ } };
const pushState = () => toPage({ t: 'state', state: room, offset: clock?.offset || 0 });
setInterval(() => { if (room) pushState(); }, 5000); // keeps the clock offset fresh

$('#hideJoin').addEventListener('click', () => toPage({ t: 'panel', open: false }));
$('#hideRoom').addEventListener('click', () => toPage({ t: 'panel', open: false }));

// ---------- joining ----------
let socket = null;
let clock = null;
let call = null;
let room = null;
let cdRaf = null;

function normalizeRoom(v) {
  return v.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
// Accepts "couchline.example.com", a full address, or a pasted room link (which also fills the code).
function readForm() {
  let server = $('#server').value.trim();
  let roomId = $('#room').value.trim();
  const link = roomId.match(/^(https?:\/\/[^/]+)\/r\/([a-z0-9-]{3,40})/i);
  if (link) { server = link[1]; roomId = link[2]; }
  if (server && !/^https?:\/\//i.test(server)) server = `${/^(localhost|127\.)/.test(server) ? 'http' : 'https'}://${server}`;
  try { server = new URL(server).origin; } catch { server = ''; }
  return { server, roomId: normalizeRoom(roomId), name: $('#name').value.trim().slice(0, 24), withCall: $('#optCall').checked };
}

async function fillForm() {
  const saved = await chrome.storage.local.get(['server', 'name', 'withCall']);
  $('#server').value = params.get('server') || saved.server || '';
  $('#room').value = params.get('room') || '';
  $('#name').value = saved.name || '';
  $('#optCall').checked = saved.withCall ?? true;
  (!$('#name').value ? $('#name') : !$('#room').value ? $('#room') : $('#server')).focus();
}

function showJoinError(text) {
  $('#joinError').textContent = text;
  $('#joinError').hidden = !text;
}

$('#joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const opts = readForm();
  if (!opts.server) return showJoinError('That Couchline address doesn’t look right.');
  if (opts.roomId.length < 3) return showJoinError('Type the room code, like cozy-lamp-1234.');
  if (!opts.name) return showJoinError('Add your name.');
  // The room is remembered too, so "Add to Couchline" on other sites goes here.
  chrome.storage.local.set({ server: opts.server, name: opts.name, withCall: opts.withCall, room: opts.roomId });
  join(opts);
});

function join(opts) {
  showJoinError('');
  session.set(opts);
  socket = window.io(opts.server, { transports: ['websocket'], reconnectionDelayMax: 5000 });
  clock = new Clock(socket);
  call = new Call({ socket, selfId: clientId, tilesEl: $('#tiles') });
  if (opts.withCall) startCall(); // inside the click, so the camera prompt is allowed

  let joinedOnce = false;
  socket.on('connect', () => {
    socket.emit('join', { roomId: opts.roomId, clientId, name: opts.name, ext: SERVICE }, async (res) => {
      if (res?.error) { leave(); showJoinError(res.error); return; }
      joinedOnce = true;
      if (res?.iceServers) call.iceServers = res.iceServers;
      renderChat(res.chat || []);
      await clock.calibrate();
      pushState();
      if (call.active) socket.emit('call:state', { inCall: true });
    });
  });
  socket.on('connect_error', () => {
    if (!joinedOnce) showToast({ text: `Can’t reach ${opts.server} yet. Still trying.` });
  });
  socket.on('disconnect', () => showToast({ text: 'Connection lost. Reconnecting.' }));
  socket.on('state', onState);
  socket.on('toast', showToast);
  socket.on('react', (r) => toPage({ t: 'react', ...r }));
  socket.on('go', onGo);
  socket.on('signal', (d) => { if (!d.msg?.share) call.handleSignal(d); });
  socket.on('chat', (m) => { addMessage(m); toPage({ t: 'chat', name: m.name, color: m.color, text: m.text }); });
  socket.on('typing', ({ id, name, on }) => { if (on) typing.set(id, { name, until: Date.now() + 4000 }); else typing.delete(id); renderTyping(); });

  $('#roomCode').textContent = opts.roomId;
  $('#joinView').hidden = true;
  $('#roomView').hidden = false;
  renderCallButtons();
}

function leave() {
  session.set(null);
  call?.leave();
  socket?.disconnect();
  socket = null;
  room = null;
  pushState();
  $('#tiles').replaceChildren();
  $('#roomView').hidden = true;
  $('#joinView').hidden = false;
}
$('#leaveRoom').addEventListener('click', leave);

// ---------- room state ----------
function onState(s) {
  room = s;
  pushState();
  renderRoster();
  renderStatus();
  renderCountdown();
  call.sync(s.members);
}

function renderRoster() {
  $('#roster').replaceChildren(...room.members.map((m) => el('li', { 'data-color': m.color, class: m.id === clientId ? 'is-me' : null },
    el('span', { class: 'dot' }),
    el('span', { class: 'who' }, m.name),
    m.remote ? el('span', { class: 'tag' }, 'remote') : m.ext ? null : el('span', { class: 'tag' }, 'web'),
  )));
}

const svcName = (s) => (s && s !== 'Other' ? s : 'their own screen');
function epLabel(it) {
  if (it.season && it.episode) return `S${it.season} E${it.episode}`;
  if (it.episode) return `Episode ${it.episode}`;
  return '';
}

function renderStatus() {
  const cur = room.current;
  const status = $('#syncStatus');
  const warn = $('#pageWarning');
  let showStart = false;
  let showSyncToMe = false;
  warn.hidden = true;
  $('#nowService').textContent = cur ? (cur.kind === 'stream' ? svcName(cur.service) : 'In Couchline') : '';
  $('#nowTitle').textContent = cur ? [cur.title, cur.kind === 'stream' ? epLabel(cur) : ''].filter(Boolean).join(' ') : 'Nothing’s on yet';

  if (!cur) {
    status.textContent = 'Add something in Couchline and it shows up here.';
  } else if (cur.kind !== 'stream') {
    status.textContent = 'The room is watching this in the Couchline web app.';
  } else if (cur.service !== SERVICE) {
    status.textContent = `The room is on ${svcName(cur.service)}. Open it there to sync.`;
  } else if (room.extSync) {
    status.textContent = `Synced. Play, pause, and seek on ${SERVICE} and everyone follows.`;
    showSyncToMe = true;
    showStart = !room.playback.playing;
  } else {
    const missing = room.members.filter((m) => !m.remote && m.ext !== SERVICE).map((m) => m.name);
    status.textContent = `Countdown mode. Automatic sync starts when everyone watching uses the extension${missing.length ? `. Still needed: ${missing.join(' and ')}` : ''}.`;
    showStart = true;
  }

  if (cur?.kind === 'stream' && cur.service === SERVICE) {
    const itemWatch = (cur.url?.match(/\/watch\/([\w-]+)/) || [])[1];
    if (!page.onWatch) { warn.textContent = `Open the ${SERVICE} player in this tab to sync.`; warn.hidden = false; }
    else if (itemWatch && page.watchId && itemWatch !== page.watchId) { warn.textContent = 'This tab is playing a different title from the one in the room.'; warn.hidden = false; }
  }
  $('#startTogether').hidden = !showStart || !!room.countdown;
  $('#syncToMe').hidden = !showSyncToMe;
  // This tab is on a title the room isn't watching: one tap puts it on for everyone.
  const roomWatch = (cur?.url?.match(/\/watch\/([\w-]+)/) || [])[1];
  $('#watchThis').hidden = !(page.onWatch && page.url && page.watchId && page.watchId !== roomWatch);
}

$('#startTogether').addEventListener('click', () => toPage({ t: 'startTogether' }));
// Puts the title this tab is on in front of everyone.
$('#watchThis').addEventListener('click', () => {
  if (page.url) socket?.emit('queue:add', { input: page.url, playNow: true }, (r) => { if (r?.error) showToast({ text: r.error }); });
});

// ---------- chat ----------
const typing = new Map();
function chatNode(m) {
  return el('li', { class: `chat-msg${m.from === clientId ? ' is-me' : ''}`, 'data-color': m.color },
    el('p', { class: 'chat-meta' }, el('span', { class: 'chat-name' }, m.name)),
    el('p', { class: 'chat-text' }, m.text));
}
function renderChat(list) {
  $('#chatList').replaceChildren(...list.slice(-100).map(chatNode));
  $('#chatList').scrollTop = $('#chatList').scrollHeight;
}
function addMessage(m) {
  $('#chatList').append(chatNode(m));
  while ($('#chatList').children.length > 100) $('#chatList').firstChild.remove();
  $('#chatList').scrollTop = $('#chatList').scrollHeight;
  typing.delete(m.from);
  renderTyping();
}
function renderTyping() {
  const now = Date.now();
  for (const [id, t] of typing) if (t.until < now) typing.delete(id);
  const names = [...typing.values()].map((t) => t.name);
  $('#typingNote').textContent = names.length ? `${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} typing` : '';
  $('#typingNote').hidden = !names.length;
}
setInterval(renderTyping, 1000);
let typingSent = 0;
$('#chatInput').addEventListener('input', (e) => {
  if (!e.target.value.trim() || Date.now() - typingSent < 2000) return;
  typingSent = Date.now();
  socket?.emit('chat:typing', { on: true });
});
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#chatInput').value.trim();
  if (!text || !socket) return;
  socket.emit('chat:send', { text }, () => {});
  $('#chatInput').value = '';
  typingSent = 0;
});
$('#syncToMe').addEventListener('click', () => toPage({ t: 'syncToMe' }));
$('#cancelCountdown').addEventListener('click', () => socket?.emit('countdown:cancel'));

function renderCountdown() {
  const box = $('#countdown');
  cancelAnimationFrame(cdRaf);
  if (!room?.countdown) { box.hidden = true; return; }
  box.hidden = false;
  box.style.setProperty('--cd', room.countdown.color ? `var(--${room.countdown.color})` : 'var(--paper)');
  const num = $('#countNum');
  num.textContent = '';
  const step = () => {
    if (!room?.countdown) return;
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
  if (!cur || cur.id !== itemId || cur.kind !== 'stream') return;
  if (room.extSync && cur.service === SERVICE) return; // the content script starts the video itself
  const f = $('#goFlash');
  f.textContent = `Press play on ${svcName(cur.service)} now`;
  f.hidden = false;
  clearTimeout(onGo.t);
  onGo.t = setTimeout(() => { f.hidden = true; }, 2600);
}

// ---------- call, reactions, toasts ----------
async function startCall() {
  const ok = await call.start();
  if (!ok) showToast({ text: 'Camera and mic are blocked. Allow them for this extension to join the call.' });
  renderCallButtons();
  if (!$('#devicePanel').hidden) renderDevices();
}
function renderCallButtons() {
  $('#joinCallBtn').hidden = !!call?.active;
  $('#micBtn').hidden = !call?.active;
  $('#camBtn').hidden = !call?.active || !call.camOn;
  $('#leaveCallBtn').hidden = !call?.active;
}
$('#joinCallBtn').addEventListener('click', startCall);
$('#leaveCallBtn').addEventListener('click', () => { call.leave(); renderCallButtons(); });
$('#micBtn').addEventListener('click', (e) => { e.target.textContent = call.toggleMic() ? 'Mute' : 'Unmute'; });
$('#camBtn').addEventListener('click', (e) => { e.target.textContent = call.toggleCam() ? 'Camera off' : 'Camera on'; });

// Tap a face to make it bigger; double tap for full screen.
$('#tiles').addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const big = !tile.classList.contains('is-big');
  for (const t of $('#tiles').children) t.classList.remove('is-big');
  tile.classList.toggle('is-big', big);
});
$('#tiles').addEventListener('dblclick', (e) => e.target.closest('.tile')?.querySelector('video')?.requestFullscreen?.().catch(() => {}));

// Camera, microphone, and speaker, the same choices as in the web app (from call.js).
async function renderDevices() {
  if (!call) return;
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
  $('#deviceNote').textContent = [...cameras, ...mics].some((d) => !d.label) ? 'Join the call once to see device names.' : '';
}
$('#devicesBtn').addEventListener('click', () => {
  const open = $('#devicePanel').hidden;
  $('#devicePanel').hidden = !open;
  $('#devicesBtn').setAttribute('aria-expanded', String(open));
  if (open) renderDevices();
});
$('#optMirror').addEventListener('change', (e) => call?.setMirror(e.target.checked));
for (const [sel, kind] of [['#camSelect', 'camera'], ['#micSelect', 'mic'], ['#speakerSelect', 'speaker']]) {
  $(sel).addEventListener('change', async (e) => {
    if (!(await call?.useDevice(kind, e.target.value))) showToast({ text: 'That device couldn’t be used. It may be busy in another app.' });
    renderCallButtons();
  });
}

$('#reactions').append(...REACTIONS.map((emoji) => el('button', {
  class: 'react-btn', 'aria-label': `React ${emoji}`, onclick: () => socket?.emit('react', { emoji }),
}, emoji)));

function showToast({ text, color }) {
  const box = $('#toasts');
  const node = el('p', { class: 'toast' }, text);
  node.style.setProperty('--c', color ? `var(--${color})` : 'var(--muted)');
  box.append(node);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => node.remove(), 3200);
}

// ---------- start ----------
// A reload of this frame (moving into fullscreen on older browsers) rejoins on its own.
const resume = session.get();
if (resume?.server && resume.roomId) {
  join(resume);
} else {
  fillForm();
}
