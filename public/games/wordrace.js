// Wordle: your board with letters, everyone else's as colors, and a keyboard. Typing on a
// computer keyboard works too.
import { keyboard, tint } from './kit.js';

const RANK = { right: 3, close: 2, wrong: 1 };

export default function mount(root, api) {
  const { el } = api;
  let game = null;
  let typed = '';
  let sending = false;
  let seen = {}; // rows already drawn per board, so only new rows flip
  let current = null; // tiles of the row being typed
  let mineEl = null;

  const me = () => game?.view.boards[api.me];
  const canPlay = () => !!game && !game.result && api.isPlayer() && !!me() && !me().done;

  function shake() {
    if (!mineEl) return;
    const row = mineEl.querySelector('.wr-row.is-typing');
    row?.classList.remove('is-shake');
    void row?.offsetWidth;
    row?.classList.add('is-shake');
  }

  function drawTyped(popAt = -1) {
    if (!current) return;
    current.forEach((t, i) => {
      t.textContent = typed[i] || '';
      t.classList.toggle('is-pop', i === popAt);
    });
  }

  function key(k) {
    if (!canPlay() || sending) return;
    if (k === 'enter') return submit();
    if (k === 'back') { typed = typed.slice(0, -1); drawTyped(); return; }
    if (/^[a-z]$/.test(k) && typed.length < 5) { typed += k; drawTyped(typed.length - 1); }
  }

  async function submit() {
    if (typed.length < 5) { api.toast('Five letters, please.'); shake(); return; }
    sending = true;
    const r = await api.send({ guess: typed });
    sending = false;
    if (r?.ok) { typed = ''; drawTyped(); } else shake();
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (!canPlay()) return;
    const k = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' ? 'back' : e.key.length === 1 ? e.key.toLowerCase() : '';
    if (!k || (k !== 'enter' && k !== 'back' && !/^[a-z]$/.test(k))) return;
    if (k === 'enter' && e.target.closest?.('button')) e.preventDefault();
    else if (k !== 'enter') e.preventDefault();
    key(k);
  }
  document.addEventListener('keydown', onKey);

  // A full board: letters for yours, colors only for others.
  function grid(id, b, big) {
    const was = seen[id] ?? b.rows.length;
    const rows = [];
    for (let r = 0; r < game.view.tries; r++) {
      const row = b.rows[r];
      const typing = big && id === api.me && !b.done && !game.result && r === b.rows.length;
      const tiles = Array.from({ length: 5 }, (_, i) => {
        const t = el('span', { class: big ? 'g-letter wr-tile' : 'wr-dot' });
        if (row) {
          t.dataset.state = row.colors[i];
          if (row.word && big) t.textContent = row.word[i];
          if (r >= was) { t.classList.add('is-new'); t.style.setProperty('--i', String(i)); }
        }
        return t;
      });
      if (typing) current = tiles;
      rows.push(el('div', { class: `wr-row${typing ? ' is-typing' : ''}` }, ...tiles));
    }
    seen[id] = b.rows.length;
    return el('div', { class: big ? 'wr-board' : 'wr-mini', role: 'img', 'aria-label': big ? 'Your guesses' : `${api.name(id)}’s colors` }, ...rows);
  }

  function label(id, b) {
    if (b.solved) return `Solved in ${b.rows.length}`;
    if (b.done) return game.result ? 'Didn’t get it' : 'Out of guesses';
    return b.rows.length ? `${b.rows.length} of ${game.view.tries}` : 'Thinking';
  }

  return {
    update(g) {
      game = g;
      const v = g.view;
      const mine = v.boards[api.me];
      if (sending && mine && mine.rows.length > (seen[api.me] ?? 0)) typed = '';
      current = null;
      const states = {};
      for (const row of mine?.rows || []) {
        [...row.word].forEach((ch, i) => { if ((RANK[row.colors[i]] || 0) > (RANK[states[ch]] || 0)) states[ch] = row.colors[i]; });
      }
      const others = g.players.filter((p) => p.id !== api.me && v.boards[p.id]).map((p) => {
        const b = v.boards[p.id];
        return tint(el('li', { class: `wr-other${b.solved ? ' is-solved' : ''}` },
          el('span', { class: 'wr-who' }, el('span', { class: 'dot' }), el('span', { class: 'wr-name' }, p.name)),
          grid(p.id, b, false),
          el('span', { class: 'wr-label' }, label(p.id, b))), p.color);
      });
      mineEl = mine ? grid(api.me, mine, true) : null;
      drawTyped();
      const play = canPlay();
      const answer = v.answer ? el('div', { class: 'wr-answer', 'aria-label': `The word was ${v.answer}` },
        ...[...v.answer].map((ch, i) => { const t = el('span', { class: 'g-letter wr-tile is-new', 'data-state': 'right' }, ch); t.style.setProperty('--i', String(i)); return t; })) : null;
      root.replaceChildren(el('div', { class: 'wr-wrap' },
        el('div', { class: 'wr-main' },
          answer && !mine?.solved ? el('p', { class: 'g-note' }, 'The word was') : null,
          answer && !mine?.solved ? answer : null,
          mineEl || el('p', { class: 'g-big wr-watch' }, 'Watching the race'),
          mine ? el('p', { class: 'g-note wr-mine-note' }, mine.solved ? `You got it in ${mine.rows.length}.` : mine.done ? (g.result ? 'Out of guesses.' : 'Out of guesses. Waiting on the others.') : '') : null,
          play ? keyboard(key, { states, extra: [{ key: 'enter', label: 'Enter' }, { key: 'back', label: '⌫' }] }) : null),
        others.length ? el('ul', { class: 'wr-others', 'aria-label': 'Everyone else' }, ...others) : null));
      // Name the back key for screen readers.
      root.querySelector('.g-keys .is-wide:last-child')?.setAttribute('aria-label', 'Delete');
      if (g.result) return undefined;
      if (!mine) return { text: v.firstSolver ? `${api.name(v.firstSolver)} solved it` : 'Watching' };
      if (mine.solved) return { text: 'Solved. Waiting on the others' };
      if (mine.done) return { text: 'Waiting on the others' };
      if (v.firstSolver) return { text: `${api.name(v.firstSolver)} got it. Hurry!`, color: 'me' };
      return { text: `Guess ${mine.rows.length + 1} of ${v.tries}`, color: 'me' };
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
