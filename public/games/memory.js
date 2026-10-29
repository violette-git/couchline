// Memory: a grid of cards that flip in place. Pairs stay up in the matcher's color.
// The cards are built once and only their state changes, so flips can animate.
import { scoreboard, tint } from './kit.js';

export default function mount(root, api) {
  const { el } = api;
  const grid = el('div', { class: 'mm-grid', role: 'grid', 'aria-label': 'Cards' });
  const side = el('div', { class: 'mm-side' });
  root.append(el('div', { class: 'mm-wrap' }, grid, side));
  let cards = [];
  const clearing = new Map(); // faces wait for the flip back before they're removed

  function build(count) {
    grid.dataset.count = String(count);
    cards = Array.from({ length: count }, (_, i) => {
      const face = el('span', { class: 'mm-face' });
      const btn = el('button', { type: 'button', class: 'mm-card', 'aria-label': `Card ${i + 1}, face down`, onclick: () => api.send({ card: i }) },
        el('span', { class: 'mm-inner' }, el('span', { class: 'mm-back', 'aria-hidden': 'true' }), face));
      btn.face = face;
      return btn;
    });
    grid.replaceChildren(...cards);
  }

  return {
    update(game) {
      const s = game.view;
      if (cards.length !== s.cards.length) build(s.cards.length);
      const myTurn = game.turn === api.me && !game.result;
      const miss = s.busy && s.last && !s.last.match;
      s.cards.forEach((f, i) => {
        const btn = cards[i];
        const owner = s.taken[i];
        const up = !!f;
        btn.classList.toggle('is-up', up);
        btn.classList.toggle('is-taken', !!owner);
        btn.classList.toggle('is-miss', !!(miss && s.up.includes(i)));
        btn.classList.toggle('is-pair', !!(s.last?.match && s.last.cards.includes(i)));
        btn.disabled = !myTurn || s.busy || up;
        if (owner) tint(btn, api.player(owner)?.color);
        else btn.style.removeProperty('--c');
        if (up) {
          clearTimeout(clearing.get(i));
          btn.face.textContent = f;
          btn.setAttribute('aria-label', `Card ${i + 1}, ${f}${owner ? `, matched by ${api.name(owner)}` : ''}`);
        } else if (btn.face.textContent) {
          clearing.set(i, setTimeout(() => { btn.face.textContent = ''; }, 450));
          btn.setAttribute('aria-label', `Card ${i + 1}, face down`);
        }
      });
      const solo = game.players.length === 1;
      const pairs = s.cards.length / 2;
      const found = s.taken.filter(Boolean).length / 2;
      side.replaceChildren(
        solo ? '' : scoreboard(game.players, s.scores, { turn: game.result ? null : game.turn, me: api.me }),
        el('p', { class: 'mm-count' }, el('b', {}, `${found}`), ` of ${pairs} pairs found`),
        el('p', { class: 'g-note' }, `${s.moves} ${s.moves === 1 ? 'move' : 'moves'}`),
      );
      if (game.result) return undefined;
      const who = api.player(game.turn);
      if (miss) return { text: `${s.last.by === api.me ? 'No match' : `No match for ${who?.name || 'them'}`}`, color: who?.color };
      const again = s.last?.match && s.last.by === game.turn && !s.up.length;
      if (myTurn) return { text: again ? 'A pair! Go again' : s.up.length ? 'Flip one more' : 'Flip a card', color: 'me' };
      if (again) return { text: `${who?.name} found a pair`, color: who?.color };
      return undefined;
    },
    destroy() {
      for (const t of clearing.values()) clearTimeout(t);
    },
  };
}
