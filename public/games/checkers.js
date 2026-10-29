// Checkers: tap a piece, then a square. Each side's pieces are in that player's color, and the
// board turns so your pieces start at the bottom. Kings wear a crown.
import { tint, scoreboard } from './kit.js';

const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5h16l1.2-9.2-5.2 3.7L12 5l-4 7-5.2-3.7z"/><path d="M4.5 20h15"/></svg>';
const owner = (p) => (p === 'a' || p === 'A' ? 0 : p === 'b' || p === 'B' ? 1 : null);
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function mount(root, api) {
  const { el } = api;
  const board = el('div', { class: 'g-board ck-board', role: 'grid', 'aria-label': 'Checkers board' });
  const scores = el('div', { class: 'ck-scores' });
  const note = el('p', { class: 'g-note ck-note', 'aria-live': 'polite' });
  root.append(scores, board, note);
  let selected = null;
  let game = null;
  let shown = null;

  function piece(p, color) {
    const node = el('span', { class: `ck-piece${p === 'A' || p === 'B' ? ' is-king' : ''}` });
    if (p === 'A' || p === 'B') node.innerHTML = CROWN;
    tint(node, color);
    return node;
  }

  function draw() {
    const s = game.view;
    const side = s.sides.indexOf(api.me);
    const flip = side === 1;
    const myTurn = side >= 0 && s.turn === api.me && !game.result;
    const froms = new Set(myTurn ? s.legal.map(([f]) => f) : []);
    if (!myTurn) selected = null;
    if (myTurn && s.chain >= 0) selected = s.chain;
    else if (myTurn && froms.size === 1) selected = [...froms][0];
    else if (selected != null && !froms.has(selected)) selected = null;
    const dests = selected != null ? s.legal.filter(([f]) => f === selected).map(([, t]) => t) : [];
    const jumping = s.legal.some(([f, t]) => Math.abs((t >> 3) - (f >> 3)) === 2);
    const path = s.last?.path || [];
    const colorOf = (k) => api.player(s.sides[k])?.color;

    const cells = [];
    for (let k = 0; k < 64; k++) {
      const i = flip ? 63 - k : k;
      const dark = ((i >> 3) + (i & 7)) % 2 === 1;
      const p = s.board[i];
      const isDest = dests.includes(i);
      const cls = ['g-cell', 'ck-sq', dark ? 'is-dark' : 'is-light'];
      if (path.includes(i)) cls.push('is-path');
      if (selected === i) cls.push('is-sel');
      if (isDest) cls.push('is-dest');
      if (myTurn && froms.has(i) && selected == null) cls.push(jumping ? 'is-must' : 'is-can');
      const o = owner(p);
      const cell = el('button', {
        class: cls.join(' '), type: 'button', disabled: !myTurn || !dark || (!isDest && !froms.has(i)),
        'aria-label': `Row ${8 - (i >> 3)}, column ${(i & 7) + 1}${o == null ? '' : `, ${api.player(s.sides[o])?.name || 'Someone'}’s ${p === 'A' || p === 'B' ? 'king' : 'piece'}`}`,
        onclick: () => {
          if (isDest) { api.send({ from: selected, to: i }); selected = s.chain >= 0 ? selected : null; return; }
          selected = selected === i && s.chain < 0 ? null : i;
          draw();
        },
      });
      if (o != null) cell.append(piece(p, colorOf(o)));
      cells.push(cell);
    }
    board.replaceChildren(...cells);

    // Slide the piece that just moved, and fade out what it jumped.
    const key = s.last ? `${s.last.by}:${path.join(',')}` : null;
    if (key && shown && key !== shown && !calm() && path.length >= 2) {
      const to = path.at(-1), from = path.at(-2);
      const at = (i) => cells[flip ? 63 - i : i];
      const sign = flip ? -1 : 1;
      at(to).querySelector('.ck-piece')?.animate([
        { transform: `translate(${sign * ((from & 7) - (to & 7)) * 100}%, ${sign * ((from >> 3) - (to >> 3)) * 100}%)` }, { transform: 'none' },
      ], { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
      const cap = s.last.caps.at(-1);
      if (cap != null && s.last.caps.length === path.length - 1) {
        const loser = s.sides.find((id) => id !== s.last.by);
        const ghost = piece('a', api.player(loser)?.color);
        ghost.classList.add('ck-ghost');
        at(cap).append(ghost);
      }
    }
    shown = key || shown || 'start';

    const left = (k) => [...s.board].filter((p) => owner(p) === k).length;
    scores.replaceChildren(scoreboard(game.players, { [s.sides[0]]: `${left(0)} left`, [s.sides[1]]: `${left(1)} left` }, { turn: game.result ? null : s.turn, me: api.me }));

    let msg = '';
    if (myTurn && s.chain >= 0) msg = 'Keep jumping with the same piece.';
    else if (myTurn && jumping) msg = 'You have a capture, so you must take it.';
    if (!msg && !game.result && s.quiet >= 60) msg = `${Math.ceil((80 - s.quiet) / 2)} more moves each with no capture or crowning is a draw.`;
    note.textContent = msg;
  }

  return {
    update(g) {
      game = g;
      draw();
      const s = g.view;
      if (g.result) return undefined;
      if (s.turn === api.me && s.chain >= 0) return { text: 'Jump again', color: 'me' };
      return undefined;
    },
  };
}
