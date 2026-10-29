// Mancala (Kalah): six pits a side, four seeds in each. pits[0..5] are the first player's pits
// (left to right as they see them), pits[6] their store, pits[7..12] the second player's pits,
// and pits[13] their store. Sowing goes up the indexes, which is counterclockwise for both.
import { Nope, int } from './util.js';

export const STORE = [6, 13];
const opposite = (i) => 12 - i;
const sideOf = (i) => (i < 6 ? 0 : i > 6 && i < 13 ? 1 : null);
const nameOf = (ctx, id) => ctx.players.find((p) => p.id === id)?.name || 'Someone';

export default {
  setup({ players }) {
    return {
      pits: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], sides: [players[0].id, players[1].id], turn: players[0].id,
      last: null, result: null,
    };
  },

  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const side = s.sides.indexOf(by);
    const pit = int(m?.pit, 0, 5);
    if (pit == null) throw new Nope('Pick one of your pits.');
    const from = side * 7 + pit;
    let seeds = s.pits[from];
    if (!seeds) throw new Nope('That pit is empty.');
    s.pits[from] = 0;
    const sown = [];
    let at = from;
    while (seeds) {
      at = (at + 1) % 14;
      if (at === STORE[1 - side]) continue;
      s.pits[at]++;
      sown.push(at);
      seeds--;
    }
    let capture = null, got = 0;
    // Ending in one of your own empty pits takes it and everything across from it.
    if (sideOf(at) === side && s.pits[at] === 1 && s.pits[opposite(at)] > 0) {
      capture = [at, opposite(at)];
      got = s.pits[at] + s.pits[opposite(at)];
      s.pits[STORE[side]] += got;
      s.pits[at] = 0;
      s.pits[opposite(at)] = 0;
    }
    const again = at === STORE[side];
    s.last = { by, from, sown, capture, got, again, sweep: null };

    const empty = (k) => s.pits.slice(k * 7, k * 7 + 6).every((n) => !n);
    if (empty(0) || empty(1)) {
      // One side is out: each side's leftover seeds go to that side's own store.
      s.last.sweep = [];
      for (const k of [0, 1]) {
        for (let j = k * 7; j < k * 7 + 6; j++) {
          if (s.pits[j]) s.last.sweep.push(j);
          s.pits[STORE[k]] += s.pits[j];
          s.pits[j] = 0;
        }
      }
      const [a, z] = [s.pits[6], s.pits[13]];
      const winners = a === z ? [] : [s.sides[a > z ? 0 : 1]];
      s.result = { winners, text: winners.length ? `${nameOf(ctx, winners[0])} wins, ${Math.max(a, z)} to ${Math.min(a, z)}` : `A draw, ${a} each` };
      return;
    }
    if (!again) s.turn = s.sides[1 - side];
  },
};
