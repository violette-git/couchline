// Rock Paper Scissors: both pick in secret, picks reveal together. Best of 3, 5, or 7.
import { Nope } from './util.js';

const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

export default {
  setup({ players, options }) {
    return {
      bestOf: options.bestOf, wins: Object.fromEntries(players.map((p) => [p.id, 0])),
      picks: {}, rounds: [], turn: null, result: null,
    };
  },
  move(s, by, m, ctx) {
    if (!BEATS[m?.pick]) throw new Nope('Pick rock, paper, or scissors.');
    if (s.picks[by]) throw new Nope('You’ve already picked. Waiting on the other player.');
    s.picks[by] = m.pick;
    const [a, b] = ctx.players;
    if (!s.picks[a.id] || !s.picks[b.id]) return;
    const pa = s.picks[a.id], pb = s.picks[b.id];
    const winner = pa === pb ? null : BEATS[pa] === pb ? a.id : b.id;
    if (winner) s.wins[winner]++;
    s.rounds.push({ picks: { ...s.picks }, winner });
    s.picks = {};
    const need = Math.ceil(s.bestOf / 2);
    if (winner && s.wins[winner] >= need) s.result = { winners: [winner] };
  },
  // Your own pick shows; the other player's only shows that they've picked.
  view(s, viewer) {
    return { ...s, picks: Object.fromEntries(Object.entries(s.picks).map(([id, p]) => [id, id === viewer ? p : 'hidden'])) };
  },
};
