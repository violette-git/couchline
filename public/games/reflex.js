// Fastest Finger: the whole board is one big button. It turns green when the server says so,
// and this page times the tap from the moment its own screen went green, so a slow
// connection doesn’t count against anyone.
import { scoreboard, tint } from './kit.js';

export default function mount(root, api) {
  const { el } = api;
  const pad = el('button', { type: 'button', class: 'rf-pad' });
  const big = el('span', { class: 'rf-big' });
  const small = el('span', { class: 'rf-small' });
  pad.append(big, small);
  const head = el('p', { class: 'g-note rf-head' });
  const times = el('ol', { class: 'rf-times', 'aria-live': 'polite' });
  const board = el('div', { class: 'rf-board' });
  root.append(head, pad, times, board);

  let game = null;
  let greenAt = null; // performance.now() when this page went green
  let greenKey = null; // which round that was
  let mine = null; // what this page sent this round, shown before the server answers

  const keyOf = (g) => `${g.view.round}`;

  function tap() {
    if (!game || game.result || !api.isPlayer()) return;
    const s = game.view;
    if (s.phase === 'results' || mine != null || s.taps[api.me] != null) return;
    if (s.phase === 'wait') {
      mine = 'early';
      api.send({ early: true });
    } else if (greenAt != null && greenKey === keyOf(game)) {
      const ms = Math.round(performance.now() - greenAt);
      mine = ms;
      api.send({ tap: ms });
    }
    draw();
  }

  pad.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    tap();
  });
  // Enter on the focused pad comes in as a click with no pointer; pointer taps were already handled.
  pad.addEventListener('click', (e) => { if (e.detail === 0) tap(); });
  // Space works from anywhere on the page, on key down so holding it doesn’t cost time.
  const onKey = (e) => {
    if (e.code !== 'Space' || e.repeat || !root.isConnected) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    tap();
  };
  document.addEventListener('keydown', onKey);

  const fmt = (t) => (typeof t === 'number' ? `${t} ms` : t === 'early' ? 'Too early' : 'No tap');

  function draw() {
    const s = game.view;
    const over = !!game.result;
    const playing = api.isPlayer() && !over;
    const myTap = s.taps[api.me] ?? mine;
    let phase = s.phase;
    if (over) phase = 'results';
    pad.className = `rf-pad is-${phase}${myTap === 'early' && phase !== 'results' ? ' is-out' : ''}`;
    pad.disabled = !playing || phase === 'results';
    head.textContent = `Round ${s.round} of ${s.rounds}`;

    if (phase === 'wait') {
      big.textContent = myTap === 'early' ? 'Too early' : 'Wait for green';
      small.textContent = myTap === 'early' ? 'You’re out this round.' : playing ? 'Tap the moment it turns green.' : 'Everyone’s waiting for green.';
    } else if (phase === 'go') {
      big.textContent = myTap === 'early' ? 'Too early' : typeof myTap === 'number' ? fmt(myTap) : playing ? 'Tap!' : 'Go!';
      small.textContent = myTap === 'early' ? 'You’re out this round.' : typeof myTap === 'number' ? 'Waiting on the others.' : '';
    } else {
      const last = s.last;
      const w = last?.winners || [];
      big.textContent = !w.length ? `No winner in round ${last?.round ?? s.round}` : w.length === 1 ? `${api.name(w[0])} ${w[0] === api.me ? 'win' : 'wins'} round ${last.round}` : `Round ${last.round} is a tie`;
      small.textContent = w.length ? fmt(last.taps[w[0]]) : 'Everyone was early or too slow.';
    }
    // During a round show who’s tapped; after it, everyone’s time, fastest first.
    const taps = phase === 'results' ? (s.last?.taps || {}) : s.taps;
    const order = [...game.players].sort((a, b) => {
      const ta = taps[a.id];
      const tb = taps[b.id];
      const rank = (t) => (typeof t === 'number' ? t : t === 'early' ? 1e6 : 2e6);
      return phase === 'results' ? rank(ta) - rank(tb) : 0;
    });
    times.replaceChildren(...order.map((p) => {
      const t = taps[p.id];
      const win = phase === 'results' && s.last?.winners.includes(p.id);
      let shown;
      if (phase === 'results') shown = fmt(t);
      else if (t === 'early') shown = 'Too early';
      else if (t != null) shown = 'Tapped';
      else shown = '';
      return tint(el('li', { class: `${win ? 'is-win' : ''}${t === 'early' ? ' is-early' : ''}` },
        el('span', { class: 'dot' }), el('span', { class: 'rf-name' }, p.id === api.me ? 'You' : p.name), el('b', {}, shown)), p.color);
    }));
    board.replaceChildren(el('p', { class: 'rf-label' }, 'Rounds won'), scoreboard(game.players, s.wins, { me: api.me }));
  }

  return {
    update(g) {
      const prevKey = game ? `${keyOf(game)}:${game.view.phase}` : null;
      game = g;
      const s = g.view;
      if (`${keyOf(g)}:${s.phase}` !== prevKey) {
        if (s.phase === 'wait') mine = null;
        if (s.phase === 'go') {
          // Start timing on the frame that shows green.
          greenKey = keyOf(g);
          greenAt = performance.now();
          requestAnimationFrame(() => { if (greenKey === keyOf(g)) greenAt = performance.now(); });
        }
      }
      if (s.taps[api.me] != null) mine = s.taps[api.me];
      draw();
      if (g.result) return undefined;
      if (!api.isPlayer()) return { text: s.phase === 'go' ? 'Green!' : s.phase === 'wait' ? 'Waiting for green' : `Round ${s.round} done` };
      const myTap = s.taps[api.me] ?? mine;
      if (s.phase === 'wait') return myTap === 'early' ? { text: 'Out this round' } : { text: 'Wait for green', color: 'me' };
      if (s.phase === 'go') return myTap == null ? { text: 'Tap now', color: 'me' } : { text: 'Waiting on the others' };
      return { text: 'Next round coming' };
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
