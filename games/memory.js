// Memory: flip two cards a turn. A pair is yours and you go again; a miss stays up a moment
// for everyone to see, then flips back and the turn passes. Works solo too.
import { Nope, int, nextPlayer, shuffle, topScorers } from './util.js';

export const FACES = ['🍎', '🍋', '🍇', '🍉', '🍓', '🥝', '🍍', '🥕', '🌽', '🍄', '🌵', '🌻', '🌙', '⭐', '🔥', '⚡', '❄️', '🎈',
  '🎲', '🎸', '🚀', '⚓', '🐙', '🦊', '🐢', '🦉', '🐝', '🍩', '🔑', '🎁'];
export const LOOK_MS = 1200;

export default {
  setup({ players, options, rng }) {
    const pairs = [8, 12, 18].includes(Number(options.pairs)) ? Number(options.pairs) : 12;
    const faces = shuffle(FACES, rng).slice(0, pairs);
    return {
      deck: shuffle([...faces, ...faces], rng), // secret: the face of every card
      taken: Array(pairs * 2).fill(null), // who matched each card
      up: [], busy: false, moves: 0, last: null,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: players[0].id, result: null,
    };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    if (s.busy) throw new Nope('Hang on, those are flipping back.');
    const i = int(m?.card, 0, s.deck.length - 1);
    if (i == null) throw new Nope('Pick a card.');
    if (s.taken[i] || s.up.includes(i)) throw new Nope('Pick a face-down card.');
    s.up.push(i);
    if (s.up.length < 2) return;
    const [a, b] = s.up;
    s.moves++;
    if (s.deck[a] === s.deck[b]) {
      s.taken[a] = s.taken[b] = by;
      s.scores[by]++;
      s.up = [];
      s.last = { by, cards: [a, b], match: true };
      if (s.taken.every(Boolean)) {
        s.turn = null;
        s.result = ctx.players.length === 1
          ? { winners: [by], text: `All ${s.deck.length / 2} pairs in ${s.moves} moves` }
          : { winners: topScorers(s.scores) };
      }
      return;
    }
    // A miss: both stay up for a look, then flip back and the turn passes.
    s.busy = true;
    s.last = { by, cards: [a, b], match: false };
    ctx.timer(LOOK_MS, (st, c) => {
      st.up = [];
      st.busy = false;
      st.turn = nextPlayer(c.players, by);
    });
  },
  // Faces only for cards that are face up or matched; the deck itself never leaves the server.
  view(s) {
    const { deck, ...rest } = s;
    return { ...rest, cards: deck.map((f, i) => (s.taken[i] || s.up.includes(i) ? f : null)) };
  },
};
