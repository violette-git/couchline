// Rock Paper Scissors: pick in secret; both picks show when the round is played.
import { scoreboard } from './kit.js';

const PICKS = [
  { id: 'rock', label: 'Rock', glyph: '✊' },
  { id: 'paper', label: 'Paper', glyph: '✋' },
  { id: 'scissors', label: 'Scissors', glyph: '✌️' },
];
const glyph = (id) => PICKS.find((p) => p.id === id)?.glyph || '?';

export default function mount(root, api) {
  const { el } = api;
  return {
    update(game) {
      const s = game.view;
      const playing = api.isPlayer() && !game.result;
      const mine = s.picks[api.me];
      const last = s.rounds.at(-1);
      const [a, b] = game.players;
      const reveal = last && el('div', { class: 'rps-reveal' },
        ...[a, b].map((p) => {
          const side = el('div', { class: `rps-side${last.winner === p.id ? ' is-win' : last.winner ? ' is-lose' : ''}` },
            el('span', { class: 'rps-glyph' }, glyph(last.picks[p.id])),
            el('span', { class: 'rps-name' }, api.name(p.id)));
          side.style.setProperty('--c', api.colorOf(p.color));
          return side;
        }));
      const choices = el('div', { class: 'g-choices rps-choices' }, ...PICKS.map((p) => el('button', {
        type: 'button', class: `g-choice rps-choice${mine === p.id ? ' is-picked' : ''}`, disabled: !playing || !!mine,
        onclick: () => api.send({ pick: p.id }),
      }, el('span', { class: 'rps-glyph' }, p.glyph), p.label)));
      root.replaceChildren(
        el('p', { class: 'g-note' }, `Best of ${s.bestOf}. First to ${Math.ceil(s.bestOf / 2)}.`),
        scoreboard(game.players, s.wins, { me: api.me }),
        reveal || el('p', { class: 'g-big rps-wait' }, 'Ready?'),
        last ? el('p', { class: 'g-note' }, last.winner ? `${api.name(last.winner)} ${last.winner === api.me ? 'win' : 'wins'} round ${s.rounds.length}` : `Round ${s.rounds.length} was a tie`) : null,
        game.result ? null : choices,
      );
      if (game.result) return;
      const waitingOn = game.players.filter((p) => !s.picks[p.id]).map((p) => p.id);
      if (!api.isPlayer()) return { text: waitingOn.length === 2 ? 'Both are picking' : `Waiting on ${api.name(waitingOn[0])}` };
      if (!mine) return { text: 'Pick one', color: 'me' };
      return { text: `Waiting on ${api.name(waitingOn[0])}` };
    },
  };
}
