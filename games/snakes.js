// Snakes and Ladders: roll and move. Ladders climb, snakes slide, a 6 rolls again, and you
// have to land on 100 exactly (overshoot and you stay put).
import { Nope, nextPlayer } from './util.js';

export const LADDERS = { 3: 22, 8: 30, 20: 41, 28: 55, 36: 57, 51: 72, 63: 81, 71: 92 };
export const SNAKES = { 16: 6, 32: 10, 48: 26, 62: 19, 74: 53, 88: 67, 95: 75, 99: 78 };
export const GOAL = 100;

export default {
  setup({ players }) {
    return { pos: Object.fromEntries(players.map((p) => [p.id, 0])), rolls: 0, last: null, turn: players[0].id, result: null };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    if (m?.roll !== true) throw new Nope('Roll the die.');
    const roll = 1 + Math.floor(ctx.rng() * 6);
    const from = s.pos[by];
    const land = from + roll;
    s.rolls++;
    const last = { n: s.rolls, by, roll, from, land, to: from, via: null, over: false, again: false };
    if (land > GOAL) {
      last.over = true;
    } else {
      last.to = LADDERS[land] ?? SNAKES[land] ?? land;
      if (LADDERS[land]) last.via = 'ladder';
      else if (SNAKES[land]) last.via = 'snake';
      s.pos[by] = last.to;
    }
    s.last = last;
    if (s.pos[by] === GOAL) {
      s.turn = null;
      s.result = { winners: [by] };
      return;
    }
    if (roll === 6) last.again = true;
    else s.turn = nextPlayer(ctx.players, by);
  },
};
