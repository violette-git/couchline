// Sudoku, together: one shared grid. Numbers show in the color of whoever placed them, and the
// server marks wrong ones. Pencil notes are this browser's own and never sent.
import { scoreboard } from './kit.js';

const box = (i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
// Squares sharing a row, column, or box with i.
const peer = (i, j) => Math.floor(i / 9) === Math.floor(j / 9) || i % 9 === j % 9 || box(i) === box(j);

export default function mount(root, api) {
  const { el } = api;
  let sel = null;
  let notesMode = false;
  let notes = {}; // cell -> digits, kept in this browser only
  let last = null;
  let key = null;
  let shown = []; // entries as last drawn, so only new numbers pop in
  let fresh = new Set();

  const loadNotes = (id) => {
    key = `couchline:sudoku-notes:${id}`;
    try { notes = JSON.parse(sessionStorage.getItem(key)) || {}; } catch { notes = {}; }
  };
  const saveNotes = () => { try { sessionStorage.setItem(key, JSON.stringify(notes)); } catch { /* private mode */ } };

  const canPlay = () => last && api.isPlayer() && !last.result;
  const valueAt = (s, i) => s.givens[i] || s.entries[i]?.d || 0;

  function place(digit) {
    if (sel == null || !canPlay()) return;
    const s = last.view;
    if (s.givens[sel]) { api.toast('That number is part of the puzzle.'); return; }
    if (notesMode && digit) {
      if (s.entries[sel]) return;
      const list = new Set(notes[sel] || []);
      if (list.has(digit)) list.delete(digit); else list.add(digit);
      if (list.size) notes[sel] = [...list].sort(); else delete notes[sel];
      saveNotes();
      draw();
      return;
    }
    if (!digit && !s.entries[sel] && notes[sel]) { delete notes[sel]; saveNotes(); draw(); return; }
    if (!digit && !s.entries[sel]) return;
    api.send({ cell: sel, digit });
  }

  function move(dr, dc) {
    const i = sel ?? 40;
    const r = (Math.floor(i / 9) + dr + 9) % 9, c = (i % 9 + dc + 9) % 9;
    sel = r * 9 + c;
    draw();
  }

  // Keys on a computer: arrows move, 1 to 9 place, 0, Backspace, or Delete clear, N for notes.
  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!root.isConnected || !last) return;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { move(...arrows[e.key]); e.preventDefault(); return; }
    if (!canPlay()) return;
    if (/^[1-9]$/.test(e.key)) { place(Number(e.key)); e.preventDefault(); }
    else if (['0', 'Backspace', 'Delete'].includes(e.key)) { place(0); e.preventDefault(); }
    else if (e.key === 'n' || e.key === 'N') { notesMode = !notesMode; draw(); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  function cell(s, i) {
    const given = s.givens[i];
    const entry = s.entries[i];
    const v = valueAt(s, i);
    const isPeer = sel != null && sel !== i && peer(sel, i);
    const same = sel != null && v && v === valueAt(s, sel);
    const cls = `su-cell${given ? ' is-given' : ''}${entry ? ' is-entry' : ''}${fresh.has(i) ? ' is-new' : ''}${entry?.wrong ? ' is-wrong' : ''}${sel === i ? ' is-sel' : ''}${isPeer ? ' is-peer' : ''}${same ? ' is-same' : ''}`;
    const r = Math.floor(i / 9) + 1, c = (i % 9) + 1;
    const label = `Row ${r}, column ${c}, ${v ? `${v}${given ? ', given' : entry?.wrong ? ', wrong' : ''}` : 'empty'}`;
    const btn = el('button', { type: 'button', class: cls, 'aria-label': label, onclick: () => { sel = i; draw(); } });
    if (v) btn.append(el('span', { class: 'su-digit' }, String(v)));
    else if (notes[i]?.length) btn.append(el('span', { class: 'su-notes', 'aria-hidden': 'true' }, ...Array.from({ length: 9 }, (_, k) => el('i', {}, notes[i].includes(k + 1) ? String(k + 1) : ''))));
    if (entry) btn.style.setProperty('--c', api.colorOf(api.player(entry.by)?.color));
    return btn;
  }

  function draw() {
    const game = last;
    const s = game.view;
    const playing = canPlay();
    const boxes = Array.from({ length: 9 }, (_, b) => {
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
      return el('div', { class: 'su-box' }, ...Array.from({ length: 9 }, (_, k) => cell(s, (br + Math.floor(k / 3)) * 9 + bc + (k % 3))));
    });
    // A digit is done once all nine of it are in, and right.
    const done = Array(10).fill(0);
    for (let i = 0; i < 81; i++) if (s.givens[i] || (s.entries[i] && !s.entries[i].wrong)) done[valueAt(s, i)]++;
    const selFixed = sel != null && !!s.givens[sel];
    const pad = playing ? el('div', { class: 'su-pad' },
      el('div', { class: 'su-digits', role: 'group', 'aria-label': 'Numbers' }, ...Array.from({ length: 9 }, (_, k) => el('button', {
        type: 'button', class: `su-key${done[k + 1] >= 9 ? ' is-done' : ''}`, disabled: sel == null || selFixed, onclick: () => place(k + 1),
      }, String(k + 1)))),
      el('div', { class: 'su-tools' },
        el('button', { type: 'button', class: 'btn btn-small', disabled: sel == null || selFixed, onclick: () => place(0) }, 'Erase'),
        el('button', { type: 'button', class: `btn btn-small su-notes-btn${notesMode ? ' is-on' : ''}`, 'aria-pressed': String(notesMode), onclick: () => { notesMode = !notesMode; draw(); } }, notesMode ? 'Notes on' : 'Notes off'))) : '';
    // Right numbers so far, per person.
    const placed = Object.fromEntries(game.players.map((p) => [p.id, 0]));
    for (const e of s.entries) if (e && !e.wrong && e.by in placed) placed[e.by]++;
    const level = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[s.level] || '';
    root.replaceChildren(el('div', { class: 'su-wrap' },
      el('div', { class: `su-grid${playing ? '' : ' is-still'}`, role: 'grid', 'aria-label': 'Sudoku grid' }, ...boxes),
      el('div', { class: 'su-side' },
        pad,
        game.players.length > 1 || !playing ? el('div', { class: 'su-who' }, el('p', { class: 'su-caption' }, 'Right numbers placed'), scoreboard(game.players, placed, { me: api.me })) : '',
        el('p', { class: 'g-note' }, playing ? `${level}. Tap a square, then a number.` : `${level} puzzle`))));
  }

  return {
    update(game) {
      if (!last || last.id !== game.id || last.round !== game.round) loadNotes(`${game.id}-${game.round}`);
      last = game;
      const now = game.view.entries.map((e) => (e ? `${e.d}${e.by}` : ''));
      fresh = new Set(now.flatMap((v, i) => (v && shown.length && v !== shown[i] ? [i] : [])));
      shown = now;
      draw();
      fresh = new Set();
      if (game.result) return undefined;
      const s = game.view;
      const left = s.entries.filter((e, i) => !s.givens[i] && (!e || e.wrong)).length;
      const wrong = s.entries.filter((e) => e?.wrong).length;
      const text = wrong ? `${left} to go, ${wrong} wrong` : `${left} ${left === 1 ? 'square' : 'squares'} to go`;
      return api.isPlayer() ? { text, color: 'me' } : { text };
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
