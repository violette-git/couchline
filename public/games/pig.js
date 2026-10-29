// Pig: one big die, the turn total, everyone’s banked score as a race to the target.
import { die, tint } from './kit.js';

export default function mount(root, api) {
  const { el } = api;
  // Draws the game; skips the pieces that don’t apply right now.
  const put = (...kids) => root.replaceChildren(...kids.filter(Boolean));
  let seenRoll = null;

  return {
    update(game) {
      const s = game.view;
      const myTurn = game.turn === api.me && !game.result;
      const roller = game.turn ? api.player(game.turn) : null;
      // The die shows this turn’s latest roll, or how the last turn ended.
      const face = s.rolls.at(-1) ?? s.last?.rolls.at(-1) ?? null;
      const rolling = seenRoll != null && s.rollNo !== seenRoll;
      seenRoll = s.rollNo;
      const pct = (n) => Math.max(0, Math.min(100, (n / s.target) * 100));
      const bust = !s.rolls.length && s.last && !s.last.banked && face === 1;

      const race = el('ol', { class: 'pig-race', 'aria-label': 'Scores' }, ...game.players.map((p) => {
        const score = s.scores[p.id];
        const turnHere = p.id === game.turn ? s.total : 0;
        const li = el('li', { class: `${p.id === game.turn ? 'is-turn' : ''}${game.result?.winners.includes(p.id) ? ' is-win' : ''}` },
          el('span', { class: 'pig-who' }, p.id === api.me ? `${p.name} (you)` : p.name),
          el('b', { class: 'pig-score' }, String(score), turnHere ? el('small', {}, ` +${turnHere}`) : null),
          el('span', { class: 'pig-bar', 'aria-hidden': 'true' },
            el('i', { class: 'pig-fill', style: `width:${pct(score)}%` }),
            turnHere ? el('i', { class: 'pig-pend', style: `left:${pct(score)}%;width:${pct(Math.min(turnHere, s.target - score))}%` }) : null));
        return tint(li, p.color);
      }));

      const center = el('div', { class: `pig-center${bust ? ' is-bust' : ''}` },
        face ? die(face, { rolling, color: roller?.color }) : el('span', { class: 'g-die pig-blank', 'aria-hidden': 'true' }),
        el('div', { class: 'pig-total' },
          el('span', { class: 'pig-label' }, 'Turn total'),
          el('b', {}, String(s.total)),
          el('span', { class: 'pig-rolls', 'aria-label': 'Rolls this turn' }, ...s.rolls.map((n) => el('span', {}, String(n))))));

      let note = '';
      if (s.last && !s.rolls.length) {
        const who = api.name(s.last.by);
        note = s.last.banked ? `${who} banked ${s.last.banked}.` : s.last.lost ? `${who} rolled a 1 and lost ${s.last.lost}.` : `${who} rolled a 1.`;
      }

      put(
        el('p', { class: 'g-note' }, `First to ${s.target} wins.`),
        race,
        center,
        el('p', { class: 'g-note pig-log', 'aria-live': 'polite' }, note),
        api.isPlayer() && !game.result ? el('div', { class: 'g-actions pig-actions' },
          el('button', { type: 'button', class: 'btn btn-primary btn-big', disabled: !myTurn, onclick: () => api.send({ roll: true }) }, 'Roll'),
          el('button', { type: 'button', class: 'btn btn-big', disabled: !myTurn || !s.total, onclick: () => api.send({ hold: true }) }, myTurn && s.total ? `Hold ${s.total}` : 'Hold')) : null,
      );
      if (game.result) return undefined;
      if (myTurn) {
        const reach = s.scores[api.me] + s.total >= s.target;
        return { text: reach ? 'Hold to win' : s.total ? 'Roll again or hold' : 'Roll the die', color: 'me' };
      }
      return undefined;
    },
  };
}
