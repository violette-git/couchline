// Pig: roll one die as often as you dare. Every roll adds to your turn total, a 1 wipes it
// out and passes the die, and holding banks it. First to the target wins on the spot.
import { Nope, nextPlayer } from './util.js';

export default {
  setup({ players, options }) {
    return {
      target: options.target,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: players[0].id,
      total: 0, // this turn so far
      rolls: [], // this turn’s rolls
      rollNo: 0, // counts every roll, so pages know when to animate the die
      last: null, // how the previous turn ended: { by, rolls, banked } (banked 0 means a 1 came up)
      result: null,
    };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    if (m?.roll) {
      const n = 1 + Math.floor(ctx.rng() * 6);
      s.rolls.push(n);
      s.rollNo++;
      if (n === 1) {
        s.last = { by, rolls: s.rolls, banked: 0, lost: s.total };
        s.total = 0;
        s.rolls = [];
        s.turn = nextPlayer(ctx.players, by);
      } else {
        s.total += n;
      }
      return;
    }
    if (m?.hold) {
      if (!s.total) throw new Nope('Roll at least once before you hold.');
      s.scores[by] += s.total;
      s.last = { by, rolls: s.rolls, banked: s.total };
      s.total = 0;
      s.rolls = [];
      if (s.scores[by] >= s.target) {
        s.result = { winners: [by] };
        s.turn = null;
      } else {
        s.turn = nextPlayer(ctx.players, by);
      }
      return;
    }
    throw new Nope('Roll or hold.');
  },
};
