// Chess: tap a piece to see where it can go, tap a square to move. The board turns around for
// black. Pieces are white and black; each player's name carries their own color.
import { tint } from './kit.js';

const FILES = 'abcdefgh';
// Filled glyphs for both sides (colored by CSS), with U+FE0E so phones don't draw emoji.
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER = 'qrbnp';
const name = (i) => FILES[i & 7] + (8 - (i >> 3));
const sideOf = (p) => (p === '.' ? null : p < 'a' ? 'w' : 'b');
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function mount(root, api) {
  const { el } = api;
  let selected = null; // square index
  let promo = null; // { from, to } waiting for a piece choice
  let confirmResign = false;
  let resignTimer = null;
  let shownLast = null;
  let game = null;

  const board = el('div', { class: 'g-board ch-board', role: 'grid', 'aria-label': 'Chess board' });
  let top = el('div', { class: 'ch-card ch-top' });
  let bottom = el('div', { class: 'ch-card ch-bottom' });
  const moves = el('ol', { class: 'ch-moves', 'aria-label': 'Moves' });
  const actions = el('div', { class: 'ch-actions' });
  const boardBox = el('div', { class: 'ch-boardbox' }, board);
  root.append(el('div', { class: 'ch-wrap' }, top, boardBox, bottom, actions, moves));

  const glyph = (p, extra = '') => el('span', { class: `ch-piece is-${sideOf(p)}${extra}`, 'aria-hidden': 'true' }, `${GLYPH[p.toLowerCase()]}︎`);

  function send(move) {
    selected = null;
    promo = null;
    api.send(move);
    draw();
  }

  function tap(i) {
    const s = game.view;
    const me = s.colors.w === api.me ? 'w' : s.colors.b === api.me ? 'b' : null;
    const mine = me && s.side === me && !game.result;
    if (!mine) return;
    if (selected != null && targets(selected).includes(i)) {
      const pawn = s.board[selected].toLowerCase() === 'p';
      if (pawn && (i >> 3 === 0 || i >> 3 === 7)) {
        promo = { from: selected, to: i };
        draw();
        return;
      }
      send({ from: name(selected), to: name(i) });
      return;
    }
    selected = sideOf(s.board[i]) === me && targets(i).length && selected !== i ? i : null;
    promo = null;
    draw();
  }

  function targets(i) {
    const from = name(i);
    return game.view.legal.filter((m) => m.startsWith(from)).map((m) => (8 - Number(m[3])) * 8 + FILES.indexOf(m[2]));
  }

  function card(side, s, flip) {
    const id = s.colors[side];
    const p = api.player(id);
    const taken = [...s.taken[side]].sort((a, b) => ORDER.indexOf(a.toLowerCase()) - ORDER.indexOf(b.toLowerCase()));
    let material = 0;
    for (const ch of s.board) if (ch !== '.') material += (sideOf(ch) === side ? 1 : -1) * VALUE[ch.toLowerCase()];
    const toMove = !game.result && s.side === side;
    const node = el('div', { class: `ch-card ${flip}${toMove ? ' is-turn' : ''}` },
      el('span', { class: 'ch-dot' }),
      el('span', { class: 'ch-who' },
        el('b', {}, id === api.me ? `${p?.name || 'You'} (you)` : p?.name || 'Someone'),
        el('span', { class: 'ch-side' }, side === 'w' ? 'White' : 'Black')),
      el('span', { class: 'ch-taken', 'aria-label': taken.length ? `Captured: ${taken.map((t) => NAMES[t.toLowerCase()]).join(', ')}` : 'Nothing captured yet' },
        ...taken.map((t) => glyph(t)),
        material > 0 ? el('span', { class: 'ch-plus' }, `+${material}`) : null));
    tint(node, p?.color);
    return node;
  }

  function draw() {
    const s = game.view;
    const me = s.colors.w === api.me ? 'w' : s.colors.b === api.me ? 'b' : null;
    const flip = me === 'b';
    const myTurn = me && s.side === me && !game.result;
    if (!myTurn) { selected = null; promo = null; }
    const dests = selected != null ? targets(selected) : [];
    const movable = new Set(myTurn ? s.legal.map((m) => (8 - Number(m[1])) * 8 + FILES.indexOf(m[0])) : []);

    const cells = [];
    for (let k = 0; k < 64; k++) {
      const i = flip ? 63 - k : k;
      const r = i >> 3, f = i & 7;
      const p = s.board[i];
      const dark = (r + f) % 2 === 1;
      const isDest = dests.includes(i);
      const cls = ['g-cell', 'ch-sq', dark ? 'is-dark' : 'is-light'];
      if (s.last && (s.last.from === i || s.last.to === i)) cls.push('is-last');
      if (selected === i) cls.push('is-sel');
      if (isDest) cls.push(p === '.' ? 'is-dest' : 'is-hit');
      if (s.check === i) cls.push('is-check');
      const label = `${name(i)}${p === '.' ? '' : `, ${sideOf(p) === 'w' ? 'white' : 'black'} ${NAMES[p.toLowerCase()]}`}`;
      const cell = el('button', {
        class: cls.join(' '), type: 'button', 'aria-label': label,
        disabled: !myTurn || (!isDest && !movable.has(i) && selected == null), onclick: () => tap(i),
      });
      if (p !== '.') cell.append(glyph(p));
      // Coordinates along the near edges, like a printed board.
      if (k % 8 === 0) cell.append(el('span', { class: 'ch-rank', 'aria-hidden': 'true' }, String(8 - r)));
      if (k >= 56) cell.append(el('span', { class: 'ch-file', 'aria-hidden': 'true' }, FILES[f]));
      cells.push(cell);
    }
    board.replaceChildren(...cells);

    // Slide the piece that just moved from where it was.
    const lastKey = s.last ? `${s.moves.length}:${s.last.from}-${s.last.to}` : null;
    if (lastKey && shownLast && lastKey !== shownLast && !calm()) {
      const to = cells[flip ? 63 - s.last.to : s.last.to].querySelector('.ch-piece');
      const dr = (s.last.from >> 3) - (s.last.to >> 3), df = (s.last.from & 7) - (s.last.to & 7);
      const sign = flip ? -1 : 1;
      to?.animate([{ transform: `translate(${sign * df * 100}%, ${sign * dr * 100}%)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    }
    shownLast = lastKey || shownLast || 'start';

    // Promotion: pick the new piece.
    boardBox.querySelector('.ch-promo')?.remove();
    if (promo) {
      const pick = (k) => el('button', { type: 'button', class: 'ch-promo-pick', 'aria-label': `Promote to ${NAMES[k]}`, onclick: () => send({ from: name(promo.from), to: name(promo.to), promo: k }) },
        glyph(me === 'w' ? k.toUpperCase() : k));
      boardBox.append(el('div', { class: 'ch-promo', role: 'dialog', 'aria-label': 'Promote your pawn' },
        el('p', {}, 'Promote to'),
        el('div', { class: 'ch-promo-row' }, ...'qrbn'.split('').map(pick)),
        el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { promo = null; draw(); } }, 'Cancel')));
    }

    // Opponent on top, you at the bottom; watchers see white at the bottom.
    const near = flip ? 'b' : 'w';
    const far = flip ? 'w' : 'b';
    const t = card(far, s, 'ch-top'), b = card(near, s, 'ch-bottom');
    top.replaceWith(t);
    bottom.replaceWith(b);
    top = t;
    bottom = b;

    // The move list, numbered in pairs.
    const items = [];
    for (let n = 0; n < s.moves.length; n += 2) {
      const at = (j) => (s.moves[j] ? el('span', { class: `ch-san${j === s.moves.length - 1 ? ' is-now' : ''}` }, s.moves[j]) : el('span', { class: 'ch-san' }));
      items.push(el('li', {}, el('span', { class: 'ch-num' }, `${n / 2 + 1}.`), at(n), at(n + 1)));
    }
    moves.replaceChildren(...items);
    moves.hidden = !items.length;
    moves.scrollTop = moves.scrollHeight;
    moves.scrollLeft = moves.scrollWidth;

    // Draw offers and resigning.
    const them = me ? s.colors[me === 'w' ? 'b' : 'w'] : null;
    const kids = [];
    if (me && !game.result) {
      if (s.offer === them) {
        kids.push(el('div', { class: 'ch-offer' },
          el('span', {}, `${api.player(them)?.name || 'They'} offers a draw.`),
          el('button', { type: 'button', class: 'btn btn-primary btn-small', onclick: () => api.send({ acceptDraw: true }) }, 'Accept'),
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => api.send({ declineDraw: true }) }, 'Decline')));
      } else {
        kids.push(el('button', {
          type: 'button', class: 'btn btn-quiet btn-small', disabled: s.offer === api.me, onclick: () => api.send({ offerDraw: true }),
        }, s.offer === api.me ? 'Draw offered' : 'Offer a draw'));
        kids.push(el('button', {
          type: 'button', class: `btn btn-small ${confirmResign ? 'ch-resign-sure' : 'btn-quiet'}`,
          onclick: () => {
            if (!confirmResign) {
              confirmResign = true;
              clearTimeout(resignTimer);
              resignTimer = setTimeout(() => { confirmResign = false; draw(); }, 3000);
              draw();
              return;
            }
            confirmResign = false;
            api.send({ resign: true });
          },
        }, confirmResign ? 'Tap again to resign' : 'Resign'));
      }
    } else if (!me && s.offer && !game.result) {
      kids.push(el('p', { class: 'g-note' }, `${api.player(s.offer)?.name || 'Someone'} offered a draw.`));
    }
    actions.replaceChildren(...kids);
    actions.hidden = !kids.length;
  }

  return {
    update(g) {
      game = g;
      const s = g.view;
      draw();
      if (g.result) return undefined;
      const me = s.colors.w === api.me ? 'w' : s.colors.b === api.me ? 'b' : null;
      if (me && s.offer && s.offer !== api.me) return { text: `${api.player(s.offer)?.name || 'They'} offers a draw`, color: 'me' };
      if (me && s.side === me) return { text: s.check >= 0 ? 'Check. Your move' : 'Your move', color: 'me' };
      const mover = api.player(s.colors[s.side]);
      return { text: `${s.check >= 0 ? 'Check. ' : ''}${mover?.name || 'Someone'} to move`, color: mover?.color };
    },
    destroy() { clearTimeout(resignTimer); },
  };
}
