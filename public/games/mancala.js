// Mancala: your pits along the bottom, your store on the right, so sowing always runs left to
// right along your side and back along theirs. Watchers see it from the first player's side.
// A move plays back seed by seed so everyone can follow where they went.
import { tint } from './kit.js';

const STORE = [6, 13];
// Seed spots inside a pit, as percentages, spiralling out from the middle.
const SPOTS = Array.from({ length: 24 }, (_, k) => {
  const a = k * 2.4, d = 4 + Math.sqrt(k) * 9.5;
  return [50 + Math.cos(a) * d, 50 + Math.sin(a) * d];
});
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function mount(root, api) {
  const { el } = api;
  const board = el('div', { class: 'mc-board' });
  const note = el('p', { class: 'g-note mc-note', 'aria-live': 'polite' });
  root.append(board, note);
  let game = null;
  let shown = null; // the pits last drawn when no move was playing
  let shownKey = null;
  let frames = null;
  let tick = null;

  function seeds(n) {
    return el('span', { class: 'mc-seeds', 'aria-hidden': 'true' }, ...SPOTS.slice(0, Math.min(n, 24)).map(([x, y], k) => {
      const dot = el('i');
      dot.style.left = `${x}%`;
      dot.style.top = `${y}%`;
      dot.style.setProperty('--l', `${62 + ((k * 37) % 5) * 6}%`);
      return dot;
    }));
  }

  function draw(pits, hot = -1) {
    const s = game.view;
    const mine = s.sides.indexOf(api.me);
    const k = mine >= 0 ? mine : 0;
    const them = 1 - k;
    const myTurn = mine >= 0 && s.turn === api.me && !game.result && !frames;
    const colorOf = (side) => api.player(s.sides[side])?.color;
    const nameOf = (side) => (s.sides[side] === api.me ? 'Your' : `${api.player(s.sides[side])?.name || 'Their'}’s`);
    const last = s.last;

    const pit = (i) => {
      const side = i < 7 ? 0 : 1;
      const n = pits[i];
      const can = myTurn && side === k && n > 0;
      const cls = ['mc-pit'];
      if (i === hot) cls.push('is-hot');
      if (!frames && last?.from === i) cls.push('is-from');
      if (!frames && last?.capture?.includes(i)) cls.push('is-taken');
      const node = el(can ? 'button' : 'div', {
        class: cls.join(' '), type: can ? 'button' : null,
        'aria-label': `${nameOf(side)} pit ${(i % 7) + 1}, ${n} ${n === 1 ? 'seed' : 'seeds'}`,
        onclick: can ? () => api.send({ pit: i % 7 }) : null,
      }, el('span', { class: 'mc-well' }, seeds(n)), el('b', { class: 'mc-count' }, String(n)));
      tint(node, colorOf(side));
      return node;
    };
    const store = (side) => {
      const i = STORE[side];
      const node = el('div', { class: `mc-store${i === hot ? ' is-hot' : ''}`, 'aria-label': `${nameOf(side)} store, ${pits[i]}` },
        el('span', { class: 'mc-store-name' }, s.sides[side] === api.me ? 'You' : api.player(s.sides[side])?.name || ''),
        el('b', { class: 'mc-store-count' }, String(pits[i])), seeds(pits[i]));
      tint(node, colorOf(side));
      return node;
    };
    const far = [5, 4, 3, 2, 1, 0].map((j) => them * 7 + j);
    const near = [0, 1, 2, 3, 4, 5].map((j) => k * 7 + j);
    board.replaceChildren(
      store(them),
      el('div', { class: 'mc-row is-far' }, ...far.map(pit)),
      el('div', { class: 'mc-row is-near' }, ...near.map(pit)),
      store(k));
    board.classList.toggle('is-mine', myTurn);
  }

  function say() {
    const s = game.view;
    const last = s.last;
    if (game.result) { note.textContent = ''; return; }
    const who = (id) => (id === api.me ? 'You' : api.player(id)?.name || 'Someone');
    if (last?.capture) note.textContent = `${who(last.by)} captured ${last.got} ${last.got === 1 ? 'seed' : 'seeds'}.`;
    else if (last?.again) note.textContent = `Last seed in the store: ${last.by === api.me ? 'you go' : `${who(last.by)} goes`} again.`;
    else note.textContent = s.turn === api.me ? 'Pick one of your pits to sow.' : '';
  }

  // The frames of the latest move: lift the pit, drop one seed at a time, then settle.
  function playBack(prev, s) {
    const last = s.last;
    const pits = [...prev];
    const out = [];
    pits[last.from] = 0;
    out.push({ pits: [...pits], hot: last.from });
    for (const i of last.sown) {
      pits[i]++;
      out.push({ pits: [...pits], hot: i });
    }
    out.push({ pits: s.pits, hot: -1 });
    return out;
  }

  return {
    update(g) {
      game = g;
      const s = g.view;
      const key = s.last ? `${s.last.by}:${s.last.from}:${s.pits.join(',')}` : 'start';
      clearInterval(tick);
      frames = null;
      if (shown && key !== shownKey && s.last && !calm() && shown.reduce((a, b) => a + b) === 48) {
        frames = playBack(shown, s);
        let n = 0;
        draw(frames[0].pits, frames[0].hot);
        tick = setInterval(() => {
          n++;
          if (n >= frames.length - 1) {
            clearInterval(tick);
            frames = null;
            draw(s.pits);
            say();
            return;
          }
          draw(frames[n].pits, frames[n].hot);
        }, 150);
      } else draw(s.pits);
      shown = s.pits;
      shownKey = key;
      say();
      if (g.result) return undefined;
      if (s.last?.again && s.turn === api.me) return { text: 'Go again', color: 'me' };
      if (s.last?.again) {
        const p = api.player(s.turn);
        return { text: `${p?.name || 'They'} goes again`, color: p?.color };
      }
      return undefined;
    },
    destroy() { clearInterval(tick); },
  };
}
