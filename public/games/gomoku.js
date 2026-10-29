// Five in a Row: stones on the points of a 15 by 15 grid, in each player's color. On touch
// screens the first tap shows where the stone would go and a second tap places it, since the
// points are small on a phone.
import { tint } from './kit.js';

const SIZE = 15;
// The star points: one near each corner, and the center.
const STARS = [48, 56, 112, 168, 176];

export default function mount(root, api) {
  const { el } = api;
  const board = el('div', { class: 'g-board gm-board', role: 'grid', 'aria-label': 'Board, 15 by 15' });
  const note = el('p', { class: 'g-note gm-note', 'aria-live': 'polite' });
  root.append(board, note);
  const coarse = matchMedia('(pointer: coarse)');
  let pending = null;
  let game = null;
  let shown = null;

  function draw() {
    const s = game.view;
    const side = s.sides.indexOf(api.me);
    const myTurn = side >= 0 && s.turn === api.me && !game.result;
    if (!myTurn || (pending != null && s.board[pending] !== '.')) pending = null;
    const me = api.player(api.me);
    const cells = [...s.board].map((v, i) => {
      const r = Math.floor(i / SIZE), c = i % SIZE;
      const edge = `${r === 0 ? ' is-top' : ''}${r === SIZE - 1 ? ' is-bottom' : ''}${c === 0 ? ' is-left' : ''}${c === SIZE - 1 ? ' is-right' : ''}`;
      const win = s.line?.includes(i);
      const cell = el('button', {
        type: 'button', class: `g-cell gm-pt${edge}${win ? ' is-win' : ''}${pending === i ? ' is-pending' : ''}`, disabled: !myTurn || v !== '.',
        'aria-label': `Row ${r + 1}, column ${c + 1}${v === '.' ? '' : `, ${api.player(s.sides[Number(v)])?.name || 'Someone'}`}`,
        onclick: () => {
          if (coarse.matches && pending !== i) { pending = i; draw(); return; }
          pending = null;
          api.send({ cell: i });
        },
      });
      if (STARS.includes(i)) cell.append(el('span', { class: 'gm-star' }));
      if (v !== '.') {
        const stone = el('span', { class: `gm-stone${shown && shown[i] === '.' ? ' is-new' : ''}${s.last === i ? ' is-last' : ''}` });
        tint(stone, api.player(s.sides[Number(v)])?.color);
        cell.append(stone);
      } else if (myTurn) {
        const ghost = el('span', { class: 'gm-stone gm-ghost' });
        tint(ghost, me?.color);
        cell.append(ghost);
      }
      return cell;
    });
    board.replaceChildren(...cells);
    shown = s.board;
    if (game.result) note.textContent = '';
    else if (myTurn && coarse.matches) note.textContent = pending == null ? 'Tap a point, then tap it again to place your stone.' : 'Tap the same point again to place it.';
    else note.textContent = 'Five or more in a row, in any direction, wins.';
  }

  return {
    update(g) {
      game = g;
      draw();
    },
  };
}
