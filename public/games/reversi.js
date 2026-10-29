// Othello: tap a hinted square to place a disc. Discs are in their player's color, and the
// ones that turn over spin round, one after another out from the new disc.
import { tint, scoreboard } from './kit.js';

export default function mount(root, api) {
  const { el } = api;
  const scores = el('div', { class: 'rv-scores' });
  const board = el('div', { class: 'g-board rv-board', role: 'grid', 'aria-label': 'Board' });
  const note = el('p', { class: 'g-note rv-note', 'aria-live': 'polite' });
  root.append(scores, board, note);
  let shown = null;

  return {
    update(game) {
      const s = game.view;
      const side = s.sides.indexOf(api.me);
      const myTurn = side >= 0 && s.turn === api.me && !game.result;
      const colorOf = (v) => api.player(s.sides[Number(v)])?.color;
      const fresh = shown && shown !== s.board;
      const cells = [...s.board].map((v, i) => {
        const hint = myTurn && s.legal.includes(i);
        const cell = el('button', {
          type: 'button', class: `g-cell rv-cell${hint ? ' is-hint' : ''}${s.last === i ? ' is-last' : ''}`, disabled: !hint,
          'aria-label': `Row ${(i >> 3) + 1}, column ${(i & 7) + 1}${v === '.' ? (hint ? ', you can play here' : '') : `, ${api.player(s.sides[Number(v)])?.name || 'Someone'}`}`,
          onclick: () => api.send({ cell: i }),
        });
        if (v !== '.') {
          const disc = el('span', { class: 'g-disc rv-disc' });
          tint(disc, colorOf(v));
          if (fresh && shown[i] !== v && shown[i] !== '.') {
            // Turned over: show the old color until halfway through the spin.
            disc.classList.add('is-flip');
            disc.style.setProperty('--from', api.colorOf(colorOf(shown[i])));
            const d = Math.max(Math.abs((i >> 3) - (s.last >> 3)), Math.abs((i & 7) - (s.last & 7)));
            disc.style.setProperty('--delay', `${(d - 1) * 70 + 120}ms`);
          } else if (!fresh || shown[i] === v) disc.classList.add('is-still');
          cell.append(disc);
          if (s.last === i) tint(cell, colorOf(v));
        }
        return cell;
      });
      board.replaceChildren(...cells);
      shown = s.board;

      const count = (k) => [...s.board].filter((v) => v === String(k)).length;
      scores.replaceChildren(scoreboard(game.players, { [s.sides[0]]: count(0), [s.sides[1]]: count(1) }, { turn: game.result ? null : s.turn, me: api.me }));
      let msg = '';
      if (!game.result && s.pass) {
        const passer = s.pass === api.me ? 'You' : api.player(s.pass)?.name || 'Someone';
        msg = `${passer} had no move and passed.`;
      } else if (myTurn) msg = 'The dots show where you can play.';
      note.textContent = msg;
      if (!game.result && s.pass && myTurn) return { text: 'Your turn again', color: 'me' };
      return undefined;
    },
  };
}
