// Connect Four: tap a column to drop a disc. Discs are in their player's color.
import { tint } from './kit.js';

const COLS = 7;
const ROWS = 6;

export default function mount(root, api) {
  const { el } = api;
  const board = el('div', { class: 'g-board c4-board', role: 'grid', 'aria-label': 'Board' });
  const note = el('p', { class: 'g-note' });
  root.append(board, note);
  let shown = [];

  return {
    update(game) {
      const s = game.view;
      const myTurn = game.turn === api.me && !game.result;
      const full = (c) => !!s.board[c];
      const cells = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          const owner = s.board[i];
          const cell = el('button', {
            class: `g-cell c4-cell${s.line?.includes(i) ? ' is-win' : ''}${s.last === i ? ' is-last' : ''}`, 'data-col': String(c),
            disabled: !myTurn || full(c), 'aria-label': `Column ${c + 1}`, onclick: () => api.send({ col: c }),
          });
          if (owner) {
            const disc = el('span', { class: 'g-disc' });
            if (shown[i] !== owner) {
              disc.style.setProperty('--drop', `${-(r + 1) * 118}%`);
              disc.classList.add('is-new');
            }
            cell.append(disc);
            tint(cell, api.player(owner)?.color);
          }
          cells.push(cell);
        }
      }
      board.replaceChildren(...cells);
      // Hovering any cell lights up its whole column.
      board.onpointerover = (e) => {
        const col = e.target.closest('.c4-cell')?.dataset.col;
        for (const c of board.children) c.classList.toggle('is-col', c.dataset.col === col && !c.disabled);
      };
      board.onpointerleave = () => { for (const c of board.children) c.classList.remove('is-col'); };
      shown = [...s.board];
      const me = api.player(api.me);
      note.textContent = game.players.some((p) => p.id === api.me) ? 'Your discs are in your color.' : '';
      if (me) tint(note, me.color);
    },
  };
}
