// Pictionary: the canvas, the artist's tools, the word (or its blanks), the guesses, and the
// scores. The artist's strokes are sent in small batches as they're drawn and arrive on
// everyone else's canvas live; the canvas is redrawn from the game whenever it changes.
import { answerBox, scoreboard, tint } from './kit.js';

const BG = '#FBFAF7';
const PALETTE = [
  { id: 'ink', hex: '#1D1F27', name: 'Black' },
  { id: 'red', hex: '#E5484D', name: 'Red' },
  { id: 'orange', hex: '#F27A1A', name: 'Orange' },
  { id: 'yellow', hex: '#F2C200', name: 'Yellow' },
  { id: 'green', hex: '#2F9E6A', name: 'Green' },
  { id: 'blue', hex: '#1C86E8', name: 'Blue' },
  { id: 'purple', hex: '#8E4EC6', name: 'Purple' },
  { id: 'brown', hex: '#8D5A3B', name: 'Brown' },
];
const HEX = Object.fromEntries(PALETTE.map((c) => [c.id, c.hex]));
HEX.erase = BG;
const SIZES = [{ w: 3, label: 'Thin' }, { w: 8, label: 'Medium' }, { w: 18, label: 'Thick' }];
const ERASER = { 3: 8, 8: 18, 18: 40 };
const FLUSH_MS = 60;

export default function mount(root, api) {
  const { el } = api;
  let game = null;
  let model = []; // strokes from the server, plus relays since
  let inflight = []; // the artist's batches sent but not echoed back yet
  let buffer = null; // the stroke being drawn right now: { id, color, width, points, sent }
  let color = 'ink';
  let size = 8;
  let erasing = false;
  let flushTimer = null;
  let turnKey = '';
  let feedSeen = 0;

  // ---------- layout, built once so the guess box keeps its text and focus ----------
  const topNote = el('p', { class: 'dr-round' });
  const wordEl = el('div', { class: 'dr-word', 'aria-live': 'polite' });
  const canvas = el('canvas', { class: 'dr-canvas', 'aria-label': 'Drawing' });
  const overlay = el('div', { class: 'dr-overlay' });
  const box = el('div', { class: 'dr-box' }, canvas, overlay);
  const swatches = PALETTE.map((c) => {
    const b = el('button', { type: 'button', class: 'dr-swatch', 'aria-label': c.name, onclick: () => { color = c.id; erasing = false; tools(); } });
    b.style.setProperty('--sw', c.hex);
    return b;
  });
  const eraser = el('button', { type: 'button', class: 'dr-tool dr-eraser', 'aria-label': 'Eraser', onclick: () => { erasing = true; tools(); } }, icon('<path d="M4 15l8-8 7 7-5 5H8z"/><path d="M9 19h11"/>'));
  const sizes = SIZES.map((s) => el('button', { type: 'button', class: 'dr-tool dr-size', 'aria-label': s.label, onclick: () => { size = s.w; tools(); } }, el('i', { style: `--d:${4 + s.w * 0.7}px` })));
  const undo = el('button', { type: 'button', class: 'dr-tool', 'aria-label': 'Undo', onclick: () => { if (!buffer) api.send({ undo: true }); } }, icon('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'));
  const clear = el('button', { type: 'button', class: 'dr-tool', 'aria-label': 'Clear the canvas', onclick: () => { if (!buffer) api.send({ clear: true }); } }, icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'));
  const toolbar = el('div', { class: 'dr-tools', role: 'toolbar', 'aria-label': 'Drawing tools' },
    el('div', { class: 'dr-swatches' }, ...swatches, eraser),
    el('div', { class: 'dr-group' }, ...sizes, el('span', { class: 'dr-sep' }), undo, clear));
  const feedList = el('ol', { class: 'dr-feed', 'aria-label': 'Guesses', 'aria-live': 'polite' });
  const guessBox = answerBox((guess) => { if (game?.view.phase === 'draw') api.send({ guess }); }, { placeholder: 'Type your guess', button: 'Guess', maxlength: 40 });
  const scores = el('div', { class: 'dr-scores' });
  root.append(el('div', { class: 'dr-wrap' },
    el('div', { class: 'dr-head' }, topNote, wordEl),
    el('div', { class: 'dr-main' },
      el('div', { class: 'dr-stage' }, box, toolbar),
      el('div', { class: 'dr-side' }, guessBox, feedList, scores))));

  function icon(paths) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = paths;
    return s;
  }

  function tools() {
    swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(!erasing && PALETTE[i].id === color)));
    eraser.setAttribute('aria-pressed', String(erasing));
    sizes.forEach((b, i) => b.setAttribute('aria-pressed', String(SIZES[i].w === size)));
    canvas.style.cursor = canDraw() ? 'crosshair' : 'default';
  }

  const isArtist = () => game?.view.artist === api.me;
  const canDraw = () => !!game && !game.result && game.view.phase === 'draw' && isArtist();

  // ---------- the canvas ----------
  const ctx2d = canvas.getContext('2d');
  let cssW = 0, cssH = 0;

  function fit() {
    const r = box.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cssW = r.width; cssH = r.width * 3 / 4;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  const ro = new ResizeObserver(() => fit());
  ro.observe(box);

  const px = (w) => Math.max(1, (w / 1000) * cssW);

  function line(stroke, from, pts) {
    ctx2d.strokeStyle = HEX[stroke.color] || HEX.ink;
    ctx2d.fillStyle = ctx2d.strokeStyle;
    ctx2d.lineWidth = px(stroke.width);
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    const all = from ? [from, ...pts] : pts;
    if (all.length === 1) {
      ctx2d.beginPath();
      ctx2d.arc(all[0][0] * cssW, all[0][1] * cssH, ctx2d.lineWidth / 2, 0, Math.PI * 2);
      ctx2d.fill();
      return;
    }
    ctx2d.beginPath();
    ctx2d.moveTo(all[0][0] * cssW, all[0][1] * cssH);
    for (let i = 1; i < all.length; i++) ctx2d.lineTo(all[i][0] * cssW, all[i][1] * cssH);
    ctx2d.stroke();
  }

  // Everything known: the server's strokes, the batches on their way, and the stroke in hand.
  function merged() {
    const out = model.map((s) => ({ ...s, points: [...s.points] }));
    const add = (s) => {
      const last = out.at(-1);
      if (last && last.id === s.id && last.color === s.color && last.width === s.width) last.points.push(...s.points);
      else out.push({ ...s, points: [...s.points] });
    };
    inflight.forEach(add);
    if (buffer && buffer.points.length > buffer.sent) add({ ...buffer, points: buffer.points.slice(buffer.sent) });
    return out;
  }

  function redraw() {
    if (!cssW) return;
    ctx2d.fillStyle = BG;
    ctx2d.fillRect(0, 0, cssW, cssH);
    for (const s of merged()) line(s, null, s.points);
  }

  function addToModel(s) {
    const last = model.at(-1);
    if (last && last.id === s.id && last.color === s.color && last.width === s.width) {
      const from = last.points.at(-1);
      last.points.push(...s.points);
      return from;
    }
    model.push({ ...s, points: [...s.points] });
    return null;
  }

  // ---------- drawing (the artist) ----------
  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000) / 1000,
      Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1000) / 1000];
  };

  function flush() {
    if (!buffer || buffer.points.length <= buffer.sent) return;
    const chunk = { id: buffer.id, color: buffer.color, width: buffer.width, points: buffer.points.slice(buffer.sent) };
    buffer.sent = buffer.points.length;
    inflight.push(chunk);
    api.send({ stroke: chunk }).then((r) => {
      if (r?.error) { inflight = inflight.filter((c) => c !== chunk); redraw(); }
    });
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = pointAt(e);
    buffer = { id: Math.floor(Math.random() * 2 ** 31), color: erasing ? 'erase' : color, width: erasing ? ERASER[size] : size, points: [p], sent: 0 };
    line(buffer, null, [p]);
    clearInterval(flushTimer);
    flushTimer = setInterval(flush, FLUSH_MS);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!buffer) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) {
      const p = pointAt(ev);
      const last = buffer.points.at(-1);
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) continue;
      buffer.points.push(p);
      line(buffer, last, [p]);
    }
  });
  const stop = () => {
    if (!buffer) return;
    flush();
    clearInterval(flushTimer);
    buffer = null;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('lostpointercapture', stop);

  // ---------- the rest of the screen ----------
  function drawWord(s) {
    if (s.phase === 'choose' || !s.mask) {
      wordEl.replaceChildren();
      return;
    }
    if (s.word) {
      wordEl.replaceChildren(...[el('span', { class: 'dr-known' }, s.word), isArtist() && s.phase === 'draw' ? el('span', { class: 'dr-tag' }, 'Draw this') : null].filter(Boolean));
      return;
    }
    const words = [];
    let cur = [];
    for (const ch of s.mask) {
      if (ch === ' ') { words.push(cur); cur = []; continue; }
      cur.push(el('span', { class: `dr-slot${ch ? ' is-open' : ''}` }, ch ? ch.toUpperCase() : ''));
    }
    words.push(cur);
    const count = s.mask.filter((c) => c !== ' ').length;
    wordEl.replaceChildren(...words.map((w) => el('span', { class: 'dr-w' }, ...w)), el('span', { class: 'dr-count' }, String(count)));
  }

  function drawOverlay(s) {
    const artist = api.player(s.artist);
    overlay.className = 'dr-overlay';
    if (game.result) {
      overlay.hidden = true;
      return;
    }
    if (s.phase === 'choose') {
      overlay.hidden = false;
      if (isArtist()) {
        overlay.replaceChildren(el('p', { class: 'dr-ov-title' }, 'Pick a word to draw'),
          el('div', { class: 'dr-picks' }, ...s.choices.map((w, i) => el('button', { type: 'button', class: 'btn dr-pick', onclick: () => api.send({ choose: i }) }, w))));
      } else {
        overlay.replaceChildren(tint(el('p', { class: 'dr-ov-title dr-who' }, el('span', { class: 'dot' }), `${artist?.name || 'Someone'} is picking a word`), artist?.color));
      }
      return;
    }
    if (s.phase === 'reveal') {
      overlay.hidden = false;
      overlay.classList.add('is-reveal');
      const right = game.players.filter((p) => s.guessed[p.id] !== undefined);
      overlay.replaceChildren(
        el('p', { class: 'dr-ov-note' }, 'The word was'),
        el('p', { class: 'dr-ov-word' }, s.word || ''),
        el('ul', { class: 'dr-gains' },
          ...right.map((p) => tint(el('li', {}, el('span', { class: 'dot' }), `${api.name(p.id)} +${s.guessed[p.id]}`), p.color)),
          right.length ? tint(el('li', { class: 'is-artist' }, el('span', { class: 'dot' }), `${api.name(s.artist)} drew it +${s.artistGain}`), artist?.color) : el('li', { class: 'is-none' }, 'Nobody got it this time.')));
      return;
    }
    overlay.hidden = true;
  }

  function drawFeed(s) {
    const items = s.feed.map((f, i) => {
      const p = api.player(f.by);
      const li = f.kind === 'right'
        ? el('li', { class: 'is-right' }, el('span', { class: 'dot' }), el('span', {}, `${f.by === api.me ? 'You' : p?.name || 'Someone'} got it`))
        : f.kind === 'close'
          ? el('li', { class: 'is-close' }, el('span', {}, `“${f.text}” is close!`))
          : el('li', {}, el('b', {}, `${p?.name || 'Someone'}`), el('span', {}, f.text));
      if (i >= feedSeen) li.classList.add('is-new');
      return tint(li, p?.color);
    });
    feedSeen = s.feed.length;
    feedList.replaceChildren(...(items.length ? items : [el('li', { class: 'is-empty' }, 'Guesses show up here.')]));
    feedList.hidden = !items.length && s.phase !== 'draw';
    feedList.scrollTop = feedList.scrollHeight;
  }

  return {
    update(g) {
      game = g;
      const s = g.view;
      const key = `${g.round}:${s.lap}:${s.artist}:${s.phase === 'choose' ? 'c' : 'd'}`;
      if (key !== turnKey) {
        turnKey = key;
        inflight = [];
        buffer = null;
        clearInterval(flushTimer);
        feedSeen = 0;
      }
      model = s.strokes.map((x) => ({ ...x, points: [...x.points] }));
      redraw();
      const artist = isArtist();
      const playing = api.isPlayer() && !g.result;
      const guessed = s.guessed[api.me] !== undefined;
      root.querySelector('.dr-wrap').classList.toggle('is-artist', artist && s.phase === 'draw' && !g.result);
      topNote.textContent = g.result ? 'Final scores' : `Round ${s.lap + 1} of ${s.turns}`;
      drawWord(s);
      drawOverlay(s);
      toolbar.hidden = !(artist && s.phase === 'draw' && !g.result);
      guessBox.hidden = !(playing && !artist && s.phase === 'draw' && !guessed);
      drawFeed(s);
      const order = [...g.players].sort((a, b) => (s.scores[b.id] || 0) - (s.scores[a.id] || 0));
      scores.replaceChildren(scoreboard(order, s.scores, { turn: g.result ? null : s.artist, me: api.me }));
      tools();
      if (g.result) return undefined;
      const who = api.player(s.artist);
      if (s.phase === 'choose') return artist ? { text: 'Pick a word', color: 'me' } : { text: `${who?.name || 'Someone'} is choosing`, color: who?.color };
      if (s.phase === 'reveal') return { text: `It was ${s.word.charAt(0).toUpperCase()}${s.word.slice(1)}` };
      if (artist) return { text: 'Draw it!', color: 'me' };
      if (guessed) return { text: 'You got it' };
      if (playing) return { text: 'Guess the word', color: 'me' };
      return { text: `${who?.name || 'Someone'} is drawing`, color: who?.color };
    },
    relay(data, by) {
      if (!data?.stroke || game?.view.phase !== 'draw') return;
      const s = data.stroke;
      if (by === api.me) {
        // Our own batch came back: it's part of the shared drawing now.
        const i = inflight.findIndex((c) => c.id === s.id && c.points.length === s.points.length);
        if (i >= 0) inflight.splice(i, 1);
        addToModel(s);
        return;
      }
      const from = addToModel(s);
      line(s, from, s.points);
    },
    destroy() {
      clearInterval(flushTimer);
      ro.disconnect();
    },
  };
}
