// Tic-tac-toe: a 3 by 3 board. Marks are drawn in their player's color.
import { tint } from './kit.js';

const svg = (inner) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 100 100');
  s.setAttribute('class', 'ttt-mark');
  s.innerHTML = inner;
  return s;
};
const X = () => svg('<path d="M24 24 76 76M76 24 24 76"/>');
const O = () => svg('<circle cx="50" cy="50" r="27"/>');

export default function mount(root, api) {
  const { el } = api;
  const board = el('div', { class: 'g-board ttt-board', role: 'grid', 'aria-label': 'Board' });
  const note = el('p', { class: 'g-note' });
  root.append(board, note);
  let shown = [];

  return {
    update(game) {
      const s = game.view;
      const myTurn = game.turn === api.me && !game.result;
      board.replaceChildren(...s.board.map((owner, i) => {
        const p = owner ? api.player(owner) : null;
        const cell = el('button', {
          class: `g-cell${s.last === i ? ' is-last' : ''}${s.line?.includes(i) ? ' is-win' : ''}`,
          disabled: !!owner || !myTurn, 'aria-label': owner ? `${p?.name}: ${s.marks[owner]}` : `Square ${i + 1}, empty`,
          onclick: () => api.send({ cell: i }),
        });
        if (owner) {
          const mark = s.marks[owner] === 'X' ? X() : O();
          if (shown[i] !== owner) mark.classList.add('is-new');
          cell.append(mark);
          tint(cell, p?.color);
        }
        return cell;
      }));
      shown = [...s.board];
      const mine = s.marks[api.me];
      note.textContent = mine ? `You’re ${mine}.` : '';
    },
  };
}
