// Mastermind: ten rows of guesses, newest at the bottom, and a palette to build the next one.
// Each person builds their own guess here in the browser; any submitted guess is shared.
// Pegs carry a number as well as a color, so they read without telling colors apart.
const PEGS = ['Red', 'Orange', 'Green', 'Blue', 'White', 'Black'];
const MAX = 10;

export default function mount(root, api) {
  const { el } = api;
  let draft = [];
  let length = 4;
  let last = null; // the last game drawn, for keyboard input
  let seen = 0; // guesses already shown, so only new rows animate
  let animateFrom = Infinity;
  let added = -1; // the draft slot just filled, which pops in

  const peg = (c, attrs = {}) => el('span', { class: 'cb-peg', 'data-c': c == null ? null : String(c), 'aria-label': c == null ? 'Empty' : `${PEGS[c]} (${c + 1})`, ...attrs }, c == null ? '' : String(c + 1));

  function canPlay() {
    return last && api.isPlayer() && !last.result;
  }
  function add(c) {
    if (!canPlay()) return;
    const i = draft.indexOf(null);
    if (i < 0) return;
    draft[i] = c;
    added = i;
    draw();
  }
  function removeLast() {
    if (!canPlay()) return;
    const i = draft.findLastIndex((c) => c != null);
    if (i >= 0) { draft[i] = null; draw(); }
  }
  async function submit() {
    if (!canPlay() || draft.includes(null)) return;
    const r = await api.send({ guess: [...draft] });
    if (r?.ok) { draft = Array(length).fill(null); draw(); }
  }

  // Keys on a computer: 1 to 6 add a peg, Backspace takes one off, Enter submits.
  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!root.isConnected || !canPlay()) return;
    if (/^[1-6]$/.test(e.key)) { add(Number(e.key) - 1); e.preventDefault(); }
    else if (e.key === 'Backspace') { removeLast(); e.preventDefault(); }
    else if (e.key === 'Enter' && !e.target.closest?.('button')) { submit(); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  // Black and white feedback pegs, black first.
  function keys(g) {
    const list = [...Array(g.black).fill('black'), ...Array(g.white).fill('white'), ...Array(length - g.black - g.white).fill(null)];
    return el('span', { class: `cb-keys is-${length}`, 'aria-label': `${g.black} black, ${g.white} white` }, ...list.map((k) => el('i', { class: k ? `is-${k}` : null })));
  }

  function draw() {
    const game = last;
    const s = game.view;
    const playing = api.isPlayer() && !game.result;
    const rows = [];
    for (let n = 0; n < MAX; n++) {
      const g = s.guesses[n];
      if (g) {
        const who = api.player(g.by);
        const row = el('li', { class: `cb-row is-done${n >= animateFrom ? ' is-new' : ''}${g.black === length ? ' is-solved' : ''}` },
          el('span', { class: 'cb-n' }, String(n + 1)),
          el('span', { class: 'cb-pegs' }, ...g.pegs.map((c) => peg(c))),
          keys(g),
          el('span', { class: 'cb-who', title: who?.name || '' }, el('span', { class: 'dot' }), api.name(g.by)));
        row.style.setProperty('--c', api.colorOf(who?.color));
        rows.push(row);
      } else if (n === s.guesses.length && playing) {
        rows.push(el('li', { class: 'cb-row is-draft' },
          el('span', { class: 'cb-n' }, String(n + 1)),
          el('span', { class: 'cb-pegs' }, ...draft.map((c, i) => el('button', {
            type: 'button', class: `cb-slot${i === added ? ' is-new' : ''}`, 'aria-label': c == null ? `Slot ${i + 1}, empty` : `Slot ${i + 1}, ${PEGS[c]}. Tap to clear`,
            disabled: c == null, onclick: () => { draft[i] = null; draw(); },
          }, peg(c)))),
          el('span', { class: 'cb-hint' }, draft.includes(null) ? 'Your guess' : 'Ready')));
      } else {
        rows.push(el('li', { class: 'cb-row is-empty' }, el('span', { class: 'cb-n' }, String(n + 1)), el('span', { class: 'cb-pegs' }, ...Array.from({ length }, () => peg(null)))));
      }
    }
    const code = el('div', { class: `cb-code${s.code ? ' is-open' : ''}` },
      el('span', { class: 'cb-code-label' }, s.code ? 'The code' : 'Hidden code'),
      el('span', { class: 'cb-pegs' }, ...(s.code ? s.code.map((c) => peg(c)) : Array.from({ length }, () => el('span', { class: 'cb-peg is-hidden', 'aria-label': 'Hidden' }, '?')))));
    const full = !draft.includes(null);
    const palette = playing ? el('div', { class: 'cb-tools' },
      el('div', { class: 'cb-palette', role: 'group', 'aria-label': 'Peg colors' }, ...PEGS.map((name, c) => el('button', {
        type: 'button', class: 'cb-pick', 'aria-label': `Add ${name} (${c + 1})`, disabled: full, onclick: () => add(c),
      }, peg(c, { 'aria-hidden': 'true' })))),
      el('div', { class: 'g-actions' },
        el('button', { type: 'button', class: 'btn btn-quiet', disabled: draft.every((c) => c == null), onclick: () => { draft = Array(length).fill(null); draw(); } }, 'Clear'),
        el('button', { type: 'button', class: 'btn btn-primary cb-submit', disabled: !full, onclick: submit }, 'Submit guess'))) : '';
    root.replaceChildren(el('div', { class: 'cb-wrap' }, code, el('ol', { class: 'cb-rows', 'aria-label': 'Guesses' }, ...rows), palette));
    added = -1;
  }

  return {
    update(game) {
      const s = game.view;
      if (s.length !== length || draft.length !== s.length) { length = s.length; draft = Array(length).fill(null); }
      last = game;
      animateFrom = seen;
      seen = s.guesses.length;
      draw();
      animateFrom = Infinity;
      if (game.result) return undefined;
      const left = MAX - s.guesses.length;
      const text = `${left} ${left === 1 ? 'guess' : 'guesses'} left`;
      return api.isPlayer() ? { text: left === 1 ? 'Last guess. Make it count' : text, color: 'me' } : { text };
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
