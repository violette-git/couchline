// Snakes and Ladders: a 10 by 10 board that snakes back and forth from 1 to 100, with the
// snakes and ladders drawn over it in SVG and a token per player that slides between squares.
import { die, scoreboard, tint } from './kit.js';

const LADDERS = { 3: 22, 8: 30, 20: 41, 28: 55, 36: 57, 51: 72, 63: 81, 71: 92 };
const SNAKES = { 16: 6, 32: 10, 48: 26, 62: 19, 74: 53, 88: 67, 95: 75, 99: 78 };
const ROWS = 11; // ten rows of squares and a start tray under them
const SLIDE_MS = 480;

// Column and row (from the top) of square n. Row one runs left to right, the next back again.
function place(n) {
  const r = Math.floor((n - 1) / 10);
  const k = (n - 1) % 10;
  return { col: r % 2 ? 9 - k : k, row: 9 - r };
}
const center = (n) => { const { col, row } = place(n); return [col * 100 + 50, row * 100 + 50]; };

// A ladder: two rails and rungs every so often.
function ladder(a, b) {
  const [x1, y1] = center(a), [x2, y2] = center(b);
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const px = -uy * 17, py = ux * 17;
  const rungs = [];
  for (let d = 30; d < len - 15; d += 38) rungs.push(`M${x1 + ux * d + px} ${y1 + uy * d + py}L${x1 + ux * d - px} ${y1 + uy * d - py}`);
  return `<g class="sn-ladder"><path class="sn-rung" d="${rungs.join('')}"/><path class="sn-rail" d="M${x1 + px} ${y1 + py}L${x2 + px} ${y2 + py}M${x1 - px} ${y1 - py}L${x2 - px} ${y2 - py}"/></g>`;
}

// A snake: a wavy body from head to tail, with a head and eyes at the top end.
function snake(a, b, k) {
  const [x1, y1] = center(a), [x2, y2] = center(b);
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const waves = Math.max(1.5, len / 160);
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const off = Math.sin(t * Math.PI * 2 * waves) * 26 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    pts.push(`${(x1 + (x2 - x1) * t - uy * off).toFixed(1)} ${(y1 + (y2 - y1) * t + ux * off).toFixed(1)}`);
  }
  const d = `M${pts.join('L')}`;
  const ex = -uy * 7, ey = ux * 7;
  return `<g class="sn-snake sn-snake-${k % 2}"><path class="sn-body" d="${d}"/><path class="sn-scales" d="${d}"/>`
    + `<circle class="sn-head" cx="${x1}" cy="${y1}" r="19"/><circle class="sn-eye" cx="${x1 + ex + ux * 6}" cy="${y1 + ey + uy * 6}" r="3.6"/><circle class="sn-eye" cx="${x1 - ex + ux * 6}" cy="${y1 - ey + uy * 6}" r="3.6"/></g>`;
}

export default function mount(root, api) {
  const { el } = api;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('class', 'sn-art');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = Object.entries(LADDERS).map(([a, b]) => ladder(+a, +b)).join('') + Object.entries(SNAKES).map(([a, b], k) => snake(+a, +b, k)).join('');
  const squares = [];
  for (let n = 1; n <= 100; n++) {
    const { col, row } = place(n);
    const sq = el('span', { class: `sn-sq${(col + row) % 2 ? ' is-alt' : ''}${n === 100 ? ' is-goal' : ''}` }, el('span', { class: 'sn-num' }, String(n)));
    sq.style.gridArea = `${row + 1} / ${col + 1}`;
    squares.push(sq);
  }
  const tokens = new Map();
  const layer = el('div', { class: 'sn-tokens' });
  const board = el('div', { class: 'sn-board', role: 'img', 'aria-label': 'Board' },
    el('div', { class: 'sn-grid' }, ...squares), svg,
    el('div', { class: 'sn-tray' }, el('span', {}, 'Start')), layer);
  const dieBox = el('div', { class: 'sn-die' });
  const said = el('p', { class: 'sn-said', 'aria-live': 'polite' });
  const rollBtn = el('button', { type: 'button', class: 'btn btn-primary sn-roll', onclick: () => api.send({ roll: true }) }, 'Roll');
  const side = el('div', { class: 'sn-side' });
  root.append(el('div', { class: 'sn-wrap' }, board, el('div', { class: 'sn-panel' }, el('div', { class: 'sn-controls' }, dieBox, rollBtn), said, side)));
  let lastN = 0;
  let slide = null;

  // Puts a token on square n (0 is the start tray), nudged so several can share a square.
  function put(tok, n, slot, count) {
    const spread = count > 1 ? [[-1, -1], [1, 1], [1, -1], [-1, 1], [0, -1.3], [0, 1.3]][slot % 6] : [0, 0];
    let x, y;
    if (n === 0) { x = 8 + slot * 9; y = (10.5 / ROWS) * 100; }
    else {
      const { col, row } = place(n);
      x = (col + 0.5) * 10 + spread[0] * 2.1;
      y = ((row + 0.5) / ROWS) * 100 + spread[1] * 1.9;
    }
    tok.style.left = `${x}%`;
    tok.style.top = `${y}%`;
  }

  return {
    update(game) {
      const s = game.view;
      const last = s.last;
      const fresh = last && last.n !== lastN;
      // Tokens: one per player, kept between updates so they glide.
      for (const p of game.players) {
        if (!tokens.has(p.id)) {
          const tok = tint(el('span', { class: 'sn-token', title: p.name }, el('span', {}, p.name.trim().charAt(0).toUpperCase())), p.color);
          tokens.set(p.id, tok);
          layer.append(tok);
        }
        tokens.get(p.id).classList.toggle('is-turn', game.turn === p.id && !game.result);
      }
      const where = { ...s.pos };
      if (fresh && last.via) where[last.by] = last.land; // stop at the foot or head first
      const placeAll = (pos) => {
        const at = {};
        for (const p of game.players) (at[pos[p.id]] ||= []).push(p.id);
        for (const p of game.players) {
          const here = at[pos[p.id]];
          put(tokens.get(p.id), pos[p.id], pos[p.id] === 0 ? game.players.indexOf(p) : here.indexOf(p.id), pos[p.id] === 0 ? 1 : here.length);
        }
      };
      clearTimeout(slide);
      placeAll(where);
      if (fresh && last.via) slide = setTimeout(() => placeAll(s.pos), SLIDE_MS + 120);

      const myTurn = game.turn === api.me && !game.result;
      dieBox.replaceChildren(last ? die(last.roll, { rolling: fresh, label: `Rolled ${last.roll}` }) : die(1, { label: 'Not rolled yet' }));
      dieBox.classList.toggle('is-idle', !last);
      if (last) tint(dieBox, api.player(last.by)?.color);
      rollBtn.hidden = !myTurn;
      if (fresh && myTurn) rollBtn.focus({ preventScroll: true });
      lastN = last?.n || 0;

      let text = '';
      if (last) {
        const who = api.name(last.by);
        const rolled = `${who} rolled ${last.roll}`;
        if (last.over) text = `${rolled}. Needs exactly ${100 - last.from}, so stays on ${last.from}.`;
        else if (last.via === 'ladder') text = `${rolled} to ${last.land}, and climbed a ladder to ${last.to}!`;
        else if (last.via === 'snake') text = `${rolled} to ${last.land}, and slid down a snake to ${last.to}.`;
        else text = `${rolled}: ${last.from || 'start'} to ${last.to}.`;
        if (last.again && !game.result) text += ' A 6 rolls again.';
      } else {
        text = 'Everyone starts off the board. First to land on 100 wins.';
      }
      said.textContent = text;
      if (last) tint(said, api.player(last.by)?.color);
      said.classList.toggle('is-big', !!last?.via);
      side.replaceChildren(scoreboard(game.players, Object.fromEntries(game.players.map((p) => [p.id, s.pos[p.id] || 'Start'])), { turn: game.result ? null : game.turn, me: api.me }));

      if (game.result) return undefined;
      if (myTurn) return { text: last?.again && last.by === api.me ? 'Roll again' : 'Your roll', color: 'me' };
      return undefined;
    },
    destroy() { clearTimeout(slide); },
  };
}
