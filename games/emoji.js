// Emoji Movies: a film shown as a row of emoji. Type the title; the first right answer scores
// 3, the next 2, and everyone after that 1. Close spelling counts. A hint shows halfway.
import { Nope, shuffle, text, squash, editDistance, topScorers } from './util.js';
import { MOVIES } from './emoji-movies.js';

export const ROUND_MS = 30000;
export const HINT_MS = 15000;
export const REVEAL_MS = 3000;

// A typed title matches when it's the same letters, or within a letter or two for longer
// titles. A leading "the" is optional on either side.
const forms = (s) => {
  const out = [squash(s)];
  const bare = String(s).trim().replace(/^the\s+/i, '');
  if (bare !== String(s).trim()) out.push(squash(bare));
  return out.filter(Boolean);
};
export function matches(guess, titles) {
  const gs = forms(guess);
  return titles.some((t) => forms(t).some((f) => gs.some((g) => {
    if (g === f) return true;
    const slack = f.length >= 10 ? 2 : f.length >= 5 ? 1 : 0;
    return slack > 0 && Math.abs(g.length - f.length) <= slack && editDistance(g, f) <= slack;
  })));
}

// The hint: each word's first letter and how long it is.
export const hint = (title) => title.split(/\s+/).map((w) => {
  const letters = w.replace(/[^\p{L}\p{N}]/gu, '');
  return { first: letters[0] || w[0], len: letters.length };
});

function startRound(s, ctx) {
  s.phase = 'guess';
  s.got = [];
  s.gained = {};
  s.wrong = {};
  s.hint = false;
  s.deadline = ctx.now() + ROUND_MS;
  ctx.timer(HINT_MS, (st, c) => {
    st.hint = true;
    c.timer(ROUND_MS - HINT_MS, endRound);
  });
}

function endRound(s, ctx) {
  s.phase = 'reveal';
  s.deadline = ctx.now() + REVEAL_MS;
  ctx.timer(REVEAL_MS, (st, c) => {
    if (st.i + 1 < st.movies.length) { st.i++; return startRound(st, c); }
    st.deadline = null;
    const best = Math.max(...Object.values(st.scores));
    st.result = best > 0 ? { winners: topScorers(st.scores) } : { winners: [], text: 'Nobody scored this time.' };
  });
}

export default {
  setup({ players, options, rng }, ctx) {
    const s = {
      movies: shuffle(MOVIES, rng).slice(0, options.count || 10).map(([title, emoji, also = []]) => ({ title, emoji: emoji.split(' '), titles: [title, ...also] })),
      i: 0, phase: 'guess', got: [], gained: {}, wrong: {}, hint: false,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: null, deadline: null, result: null,
    };
    startRound(s, ctx);
    return s;
  },
  move(s, by, m, ctx) {
    if (s.phase !== 'guess') throw new Nope('The next movie is coming up.');
    if (s.got.includes(by)) throw new Nope('You got this one. Waiting on the others.');
    const guess = text(m?.answer, 60);
    if (!squash(guess)) throw new Nope('Type a movie title.');
    if (matches(guess, s.movies[s.i].titles)) {
      const pts = [3, 2][s.got.length] || 1;
      s.got.push(by);
      s.gained[by] = pts;
      s.scores[by] = (s.scores[by] || 0) + pts;
      if (ctx.players.every((p) => s.got.includes(p.id))) {
        ctx.clearTimer();
        endRound(s, ctx);
      }
      return;
    }
    const mine = (s.wrong[by] ||= []);
    mine.push(guess);
    if (mine.length > 5) mine.shift();
  },
  // The title shows to people who have it and to everyone once the round ends.
  view(s, viewer) {
    const mv = s.movies[s.i];
    const open = s.phase === 'reveal' || s.got.includes(viewer);
    return {
      n: s.i + 1, total: s.movies.length, phase: s.phase, emoji: mv.emoji,
      title: open ? mv.title : null,
      hint: s.hint && !open ? hint(mv.title) : null,
      got: s.got, gained: s.gained, scores: s.scores, wrong: s.wrong[viewer] || [],
    };
  },
  join(s, player) {
    s.scores[player.id] ??= 0;
  },
};
