// Battleship: their waters big (tap to fire on your turn), your fleet small beside it.
// Hits are marked in the shooter's color; a fleet shows in its owner's color.
import { tint } from './kit.js';

const SIZE = 10;
const FLEET = [['Carrier', 5], ['Battleship', 4], ['Cruiser', 3], ['Submarine', 3], ['Destroyer', 2]];
const LETTERS = 'ABCDEFGHIJ';
const spot = (i) => `${LETTERS[i % SIZE]}${Math.floor(i / SIZE) + 1}`;

export default function mount(root, api) {
  const { el } = api;
  let seen = {}; // the shots last drawn per board, so only new ones animate

  // Which ship (if any) covers each square, and where in the ship it sits.
  function hulls(ships) {
    const at = {};
    for (const sh of ships) {
      const across = sh.cells[1] - sh.cells[0] === 1;
      sh.cells.forEach((i, k) => { at[i] = { across, head: k === 0, tail: k === sh.cells.length - 1, sunk: sh.sunk }; });
    }
    return at;
  }

  function grid(board, { owner, shooter, fire, last, small }) {
    const hull = hulls(board.ships);
    const before = seen[board.id] || [];
    const cells = [el('span', { class: 'bs-corner' })];
    for (let c = 0; c < SIZE; c++) cells.push(el('span', { class: 'bs-label' }, LETTERS[c]));
    for (let r = 0; r < SIZE; r++) {
      cells.push(el('span', { class: 'bs-label' }, String(r + 1)));
      for (let c = 0; c < SIZE; c++) {
        const i = r * SIZE + c;
        const shot = board.shots[i];
        const h = hull[i];
        const cell = el(fire ? 'button' : 'span', {
          class: `bs-cell${last === i ? ' is-last' : ''}`,
          type: fire ? 'button' : null, disabled: fire ? !!shot : null,
          'aria-label': `${spot(i)}${shot === 2 ? ', hit' : shot === 1 ? ', miss' : ''}${h ? ', ship' : ''}`,
          onclick: fire && !shot ? () => fire(i) : null,
        });
        if (h) {
          const part = el('span', { class: `bs-hull ${h.across ? 'is-across' : 'is-down'}${h.head ? ' is-head' : ''}${h.tail ? ' is-tail' : ''}${h.sunk ? ' is-sunk' : ''}` });
          tint(part, owner.color);
          cell.append(part);
        }
        if (shot) {
          const mark = el('span', { class: shot === 2 ? 'bs-hit' : 'bs-miss' });
          if (shot === 2) tint(mark, shooter?.color);
          if (before[i] !== shot) mark.classList.add('is-new');
          cell.append(mark);
        }
        cells.push(cell);
      }
    }
    seen[board.id] = [...board.shots];
    return el('div', { class: `bs-grid${fire ? ' is-live' : ''}${small ? ' is-small' : ''}`, role: 'grid', 'aria-label': `${api.name(owner.id) === 'You' ? 'Your' : `${owner.name}’s`} waters` }, ...cells);
  }

  // Five little ships per side, crossed off as they sink.
  function tracker(board, owner) {
    return el('ul', { class: 'bs-fleet', 'aria-label': `${board.afloat} of 5 ships afloat` }, ...FLEET.map(([name, size]) => {
      const sunk = board.sunk.includes(name);
      return tint(el('li', { class: sunk ? 'is-sunk' : null, title: `${name}${sunk ? ', sunk' : ''}` }, ...Array.from({ length: size }, () => el('i'))), owner.color);
    }));
  }

  function side(board, opts) {
    const owner = api.player(board.id) || { id: board.id, name: 'Someone' };
    const mine = board.id === api.me;
    const title = mine ? 'Your fleet' : `${owner.name}’s waters`;
    return el('section', { class: `bs-side${opts.small ? ' is-small' : ''}` },
      el('header', { class: 'bs-head' },
        tint(el('span', { class: 'bs-title' }, el('span', { class: 'dot' }), title), owner.color),
        tracker(board, owner)),
      grid(board, { ...opts, owner }));
  }

  return {
    update(game) {
      const s = game.view;
      const playing = api.isPlayer();
      const over = !!game.result;
      const myTurn = game.turn === api.me && !over;
      const [a, b] = game.players;
      const last = s.last;
      const boardOf = (id) => s.boards.find((x) => x.id === id);
      const shooterOf = (id) => api.player(game.players.find((p) => p.id !== id)?.id);
      let boards;
      if (playing) {
        const foe = game.players.find((p) => p.id !== api.me);
        boards = [
          side(boardOf(foe.id), { shooter: api.player(api.me), fire: myTurn ? (i) => api.send({ at: i }) : null, last: last?.by === api.me ? last.at : null }),
          side(boardOf(api.me), { shooter: api.player(foe.id), small: true, last: last?.by === foe.id ? last.at : null }),
        ];
      } else {
        boards = [a, b].map((p) => side(boardOf(p.id), { shooter: shooterOf(p.id), last: last && last.by !== p.id ? last.at : null }));
      }

      // What just happened, in a sentence.
      let line = '';
      if (last) {
        const shooter = api.name(last.by);
        const target = game.players.find((p) => p.id !== last.by);
        const whose = target.id === api.me ? 'your' : `${target.name}’s`;
        if (last.sunk) line = `${shooter} sank ${whose} ${last.sunk.toLowerCase()}!`;
        else if (last.hit) line = `${shooter} hit ${target.id === api.me ? 'you' : target.name} at ${spot(last.at)}.`;
        else line = `${shooter} missed at ${spot(last.at)}.`;
      }
      const canShuffle = playing && !s.fired && !over;
      const log = el('p', { class: `bs-log${last?.hit ? ' is-hit' : ''}`, 'aria-live': 'polite' }, line || (canShuffle ? 'Shuffle your fleet until you like it. It locks in at the first shot.' : ''));
      if (last?.hit) tint(log, api.player(last.by)?.color);
      root.replaceChildren(
        el('div', { class: `bs-boards${playing ? '' : ' is-watching'}` }, ...boards),
        log,
        canShuffle ? el('div', { class: 'g-actions' }, el('button', { type: 'button', class: 'btn', onclick: () => api.send({ shuffle: true }) }, 'Shuffle my fleet')) : '',
      );

      if (over) return undefined;
      if (myTurn) return { text: last?.by === api.me && last.hit ? 'Hit! Fire again' : 'Your shot', color: 'me' };
      if (last?.by === game.turn && last.hit) return { text: `${api.name(game.turn)} fires again`, color: api.player(game.turn)?.color };
      return undefined;
    },
  };
}
