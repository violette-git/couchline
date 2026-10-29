// A video during a game: the room's video plays in a small window over the game, synced for
// everyone like always. Each person drags it wherever they like on their own screen and
// resizes it from the corner; the spot is remembered on this device. The Video button in the
// game bar puts a link on, shows what's already on, or hides it for everyone.
// The player itself never moves in the page (moving an iframe reloads it); the window is the
// player's own box, restyled to float while a game is open.
import { $, store, toast } from './ui.js';
import { parseMedia, IN_BOX } from './media.js';

const MIN_W = 200;
const SPOT = 'gameVideoSpot';
const inBox = (it) => IN_BOX.includes(it?.kind);

export function initGameVideo({ socket, getRoom, isRemote }) {
  const box = $('#playerWrap');
  const panel = $('#gameVideoPanel');
  let spot = store.get(SPOT, null); // { x, y } as fractions of the window, and w in px
  let floating = false;

  const ask = (event, data = {}) => new Promise((res) => socket.emit(event, data, (r) => res(r || {})));

  // ---------- where the window sits ----------
  function maxW() { return Math.min(innerWidth * 0.9, 720); }
  function place() {
    if (!floating) return;
    const w = Math.round(Math.max(MIN_W, Math.min(spot?.w || Math.min(340, innerWidth * 0.58), maxW())));
    const h = Math.round(w * 9 / 16) + box.querySelector('.pip-bar').offsetHeight;
    // Bottom right to start, clear of the toasts.
    const x = spot ? spot.x * innerWidth : innerWidth - w - 16;
    const y = spot ? spot.y * innerHeight : innerHeight - h - 96;
    box.style.setProperty('--pip-w', `${w}px`);
    box.style.setProperty('--pip-x', `${Math.round(Math.max(8, Math.min(x, innerWidth - w - 8)))}px`);
    box.style.setProperty('--pip-y', `${Math.round(Math.max(8, Math.min(y, innerHeight - h - 8)))}px`);
  }
  function save() {
    const r = box.getBoundingClientRect();
    spot = { x: r.left / innerWidth, y: r.top / innerHeight, w: Math.round(r.width) };
    store.set(SPOT, spot);
  }
  addEventListener('resize', place);

  // Drag by the bar; resize from the corner. Pointer capture keeps the moves coming even over
  // the video's own frame.
  function dragger(handle, onMove) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const r = box.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, w: r.width };
      box.classList.add('is-moving');
      const move = (ev) => onMove(ev.clientX - start.x, ev.clientY - start.y, start);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        box.classList.remove('is-moving');
        save();
        place();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
      handle.addEventListener('pointercancel', up, { once: true });
    });
  }
  dragger($('#pipBar'), (dx, dy, s) => {
    spot = { ...spot, w: s.w, x: (s.left + dx) / innerWidth, y: (s.top + dy) / innerHeight };
    place();
  });
  dragger($('#pipResize'), (dx, _dy, s) => {
    spot = { x: s.left / innerWidth, y: s.top / innerHeight, w: Math.max(MIN_W, Math.min(s.w + dx, maxW())) };
    place();
  });
  // Double-click the bar to put it back in the corner.
  $('#pipBar').addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    spot = null;
    store.set(SPOT, null);
    place();
  });
  $('#pipHide').addEventListener('click', () => ask('game:video', { on: false }));

  // ---------- the Video panel in the game bar ----------
  function setPanel(open) {
    panel.hidden = !open;
    $('#gameVideoBtn').setAttribute('aria-expanded', String(open));
    if (open) { renderPanel(); $('#gameVideoInput').focus(); }
  }
  $('#gameVideoBtn').addEventListener('click', () => setPanel(panel.hidden));
  function say(text) {
    $('#gameVideoError').textContent = text || '';
    $('#gameVideoError').hidden = !text;
  }
  $('#gameVideoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#gameVideoInput').value.trim();
    if (!input) return;
    const m = parseMedia(input);
    if (!m || m.error || !inBox(m)) {
      return say(m?.error || 'That one doesn’t play inside Couchline, so it can’t float over the game. Try a YouTube, Vimeo, Twitch, TikTok, or video file link.');
    }
    say('');
    await ask('game:video', { on: true });
    const r = await ask('queue:add', { input, playNow: true });
    if (r.error) return say(r.error);
    // With nothing on before, it goes on paused; start it on a short countdown like Play now does.
    const room = getRoom();
    if (!room.countdown && !room.playback.playing) socket.emit('countdown:start', { seconds: 3 });
    $('#gameVideoInput').value = '';
    setPanel(false);
  });
  $('#gameVideoShow').addEventListener('click', async () => {
    const room = getRoom();
    if (room.gameVideo) { await ask('game:video', { on: false }); return; }
    await ask('game:video', { on: true });
    if (!room.playback.playing) socket.emit('cmd:play', {});
    setPanel(false);
  });

  function renderPanel() {
    const room = getRoom();
    const cur = inBox(room?.current) ? room.current : null;
    $('#gameVideoShow').hidden = !cur;
    $('#gameVideoShow').textContent = room?.gameVideo ? 'Hide the video' : 'Show it';
    $('#gameVideoNow').textContent = cur
      ? `On now: ${cur.title}.${room.gameVideo ? '' : ' Show it in a window over the game, or put on something else.'}`
      : 'Put on a video while you play. It plays for everyone in a window you can move around.';
  }

  return {
    render(room) {
      const gaming = !!room.games?.open;
      const was = floating;
      floating = gaming && !!room.gameVideo && inBox(room.current) && !isRemote();
      $('#stage').classList.toggle('has-float', floating);
      $('#pipTitle').textContent = floating ? room.current.title : '';
      if (floating && !was) requestAnimationFrame(place);
      if (!gaming) setPanel(false);
      else if (!panel.hidden) renderPanel();
      // The Video button says when one is floating.
      $('#gameVideoBtn').classList.toggle('is-on', floating);
      if (floating && !was && room.playback.playing === false && !room.countdown) {
        // Shown but paused: a tap on the video plays it for everyone.
        toast({ text: 'The video is over the game. Tap it to play.' });
      }
    },
  };
}
