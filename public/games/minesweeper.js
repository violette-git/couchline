// Minesweeper, together. Tap to open; long press, right click, or Flag mode to flag. Tapping
// a number whose flags are all placed opens the rest around it. Flags are in the color of
// whoever placed them.
import { tint } from './kit.js';

const LONG_PRESS = 400;

export default function mount(root, api) {
  const { el } = api;
  let game = null;
  let flagMode = false;
  let prev = null; // the cells last drawn, to animate the newly opened ones
  let press = null; // { i, timer, fired }
  let lastLong = 0;

  const left = el('b', { class: 'ms-num' });
  const clock = el('b', { class: 'ms-num' });
  const modeBtns = [false, true].map((f) => el('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { flagMode = f; drawBar(); } }, f ? 'Flag' : 'Open'));
  const mode = el('div', { class: 'seg ms-mode', role: 'group', 'aria-label': 'What a tap does' }, ...modeBtns);
  const bar = el('div', { class: 'ms-bar' },
    el('span', { class: 'ms-stat' }, el('i', { class: 'ms-mine', 'aria-hidden': 'true' }), left, el('span', { class: 'sr' }, ' mines left')),
    el('span', { class: 'ms-stat' }, el('i', { class: 'ms-clock', 'aria-hidden': 'true' }), clock),
    mode);
  const board = el('div', { class: 'ms-board', role: 'grid', 'aria-label': 'Minefield' });
  const scroll = el('div', { class: 'ms-scroll' }, board);
  const note = el('p', { class: 'g-note ms-note' });
  root.append(bar, scroll, note);

  const canAct = () => game && !game.result && api.isPlayer();

  function act(i, flag) {
    if (!canAct()) return;
    const s = game.view;
    if (s.cells[i] != null) {
      if (flag) return;
      // Only ask the server to chord when it could do something.
      if (!s.cells[i]) return;
      const near = around(s, i);
      if (!near.some((j) => s.cells[j] == null && !s.flags[j])) return;
    } else if (!flag && s.flags[i]) {
      api.toast('That square is flagged. Long press or switch to Flag to remove it.');
      return;
    }
    api.send(flag ? { flag: i } : { open: i });
  }

  function around(s, i) {
    const x = i % s.w;
    const y = Math.floor(i / s.w);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < s.w && ny < s.h) out.push(ny * s.w + nx);
    }
    return out;
  }

  const cellOf = (e) => {
    const b = e.target.closest?.('.ms-cell');
    return b && board.contains(b) ? Number(b.dataset.i) : null;
  };
  const cancelPress = () => { if (press) clearTimeout(press.timer); press = null; };
  board.addEventListener('pointerdown', (e) => {
    const i = cellOf(e);
    if (i == null || e.button > 0) return;
    cancelPress();
    const p = { i, fired: false, x: e.clientX, y: e.clientY };
    p.timer = setTimeout(() => {
      p.fired = true;
      lastLong = Date.now();
      navigator.vibrate?.(15);
      act(i, true);
    }, LONG_PRESS);
    press = p;
  });
  board.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) board.addEventListener(ev, () => { if (press && !press.fired) cancelPress(); });
  board.addEventListener('click', (e) => {
    const i = cellOf(e);
    if (i == null) return;
    const longDone = press?.fired && press.i === i;
    cancelPress();
    if (longDone) return;
    act(i, flagMode);
  });
  board.addEventListener('contextmenu', (e) => {
    const i = cellOf(e);
    if (i == null) return;
    e.preventDefault();
    // A long press on a phone also fires this; it already flagged.
    if (Date.now() - lastLong < 800) return;
    cancelPress();
    act(i, true);
  });

  const fmt = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  function tick() {
    const s = game?.view;
    if (!s) return;
    clock.textContent = s.started ? fmt((s.ended || api.now()) - s.started) : '0:00';
  }
  const ticker = setInterval(tick, 500);

  function drawBar() {
    const s = game.view;
    left.textContent = String(s.count - Object.keys(s.flags).length);
    modeBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(!!k === flagMode)));
    mode.hidden = !canAct();
    board.classList.toggle('is-flagging', flagMode && canAct());
    tick();
  }

  return {
    update(g) {
      game = g;
      const s = g.view;
      const over = !!g.result;
      const mines = new Set(s.mines || []);
      board.style.setProperty('--cols', String(s.w));
      board.dataset.size = String(s.w);
      board.classList.toggle('is-over', over);
      const cells = s.cells.map((v, i) => {
        const flagBy = s.flags[i];
        const open = v != null;
        let cls = 'ms-cell';
        let inner = null;
        if (open) {
          cls += ` is-open${v ? ` n${v}` : ''}${prev && prev[i] == null ? ' is-new' : ''}`;
          inner = v ? String(v) : null;
        } else if (over && mines.has(i)) {
          cls += `${i === s.hit ? ' is-hit' : ''}${flagBy ? ' is-found' : ''} is-mined`;
          inner = flagBy ? tint(el('i', { class: 'ms-flag' }), api.player(flagBy)?.color) : el('i', { class: 'ms-mine' });
        } else if (flagBy) {
          cls += `${over ? ' is-wrong' : ''}`;
          inner = tint(el('i', { class: 'ms-flag' }), api.player(flagBy)?.color);
        }
        const label = open ? (v ? `${v}` : 'Empty') : flagBy ? `Flagged by ${api.name(flagBy)}` : over && mines.has(i) ? 'Mine' : 'Closed';
        return el('button', { type: 'button', class: cls, 'data-i': String(i), 'aria-label': label, disabled: over || !api.isPlayer() || (open && !v) }, inner);
      });
      board.replaceChildren(...cells);
      prev = s.cells;
      drawBar();
      if (over) {
        note.textContent = s.hit != null ? `${api.name(s.by)} found a mine.` : 'Every safe square is open.';
        return undefined;
      }
      note.textContent = !s.started ? 'The first square is always safe.' : api.isPlayer() ? 'Long press or right click to flag.' : 'Join to help clear the field.';
      if (!api.isPlayer()) return { text: 'Watching' };
      return { text: !s.started ? 'Open any square' : flagMode ? 'Tap to flag' : 'Clear the field together', color: !s.started ? 'me' : null };
    },
    destroy() {
      clearInterval(ticker);
      cancelPress();
    },
  };
}
