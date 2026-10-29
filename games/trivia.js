// Trivia: everyone answers the same multiple choice question against a 20 second clock. The
// answers reveal together once everyone is in or time runs out. Right answers score 1000,
// sliding down to 500 the longer you took.
import { Nope, shuffle, int, topScorers } from './util.js';
import { QUESTIONS, CATEGORIES } from './trivia-questions.js';

export const ASK_MS = 20000;
export const REVEAL_MS = 4000;

export const points = (ms) => Math.round(1000 - 500 * Math.min(1, Math.max(0, ms) / ASK_MS));

function ask(s, ctx) {
  s.phase = 'ask';
  s.answers = {};
  s.gained = {};
  s.askedAt = ctx.now();
  s.deadline = s.askedAt + ASK_MS;
  ctx.timer(ASK_MS, reveal);
}

function reveal(s, ctx) {
  const q = s.qs[s.i];
  s.phase = 'reveal';
  for (const [id, a] of Object.entries(s.answers)) {
    s.gained[id] = a.choice === q.answer ? points(a.ms) : 0;
    s.scores[id] = (s.scores[id] || 0) + s.gained[id];
  }
  s.deadline = ctx.now() + REVEAL_MS;
  ctx.timer(REVEAL_MS, (st, c) => {
    if (st.i + 1 < st.qs.length) { st.i++; return ask(st, c); }
    st.deadline = null;
    const best = Math.max(...Object.values(st.scores));
    st.result = best > 0 ? { winners: topScorers(st.scores) } : { winners: [], text: 'Nobody scored this time.' };
  });
}

export default {
  setup({ players, options, rng }, ctx) {
    const qs = shuffle(QUESTIONS, rng).slice(0, options.count || 10).map(([cat, q, right, ...wrong]) => {
      const choices = shuffle([right, ...wrong], rng);
      return { cat: CATEGORIES[cat], q, choices, answer: choices.indexOf(right) };
    });
    const s = {
      qs, i: 0, phase: 'ask', answers: {}, gained: {}, askedAt: 0,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: null, deadline: null, result: null,
    };
    ask(s, ctx);
    return s;
  },
  move(s, by, m, ctx) {
    if (s.phase !== 'ask') throw new Nope('The next question is coming up.');
    if (s.answers[by]) throw new Nope('You’ve answered. Waiting on the others.');
    const choice = int(m?.choice, 0, 3);
    if (choice === null) throw new Nope('Pick one of the four answers.');
    s.answers[by] = { choice, ms: ctx.now() - s.askedAt };
    if (ctx.players.every((p) => s.answers[p.id])) {
      ctx.clearTimer();
      reveal(s, ctx);
    }
  },
  // Only the current question goes out. Its answer, and everyone else's picks, wait for the reveal.
  view(s, viewer) {
    const q = s.qs[s.i];
    const open = s.phase === 'reveal';
    const answers = {};
    for (const [id, a] of Object.entries(s.answers)) answers[id] = open || id === viewer ? a.choice : -1;
    return {
      n: s.i + 1, total: s.qs.length, phase: s.phase,
      question: { cat: q.cat, q: q.q, choices: q.choices },
      answer: open ? q.answer : null,
      answers, gained: open ? s.gained : {}, scores: s.scores,
    };
  },
  join(s, player) {
    s.scores[player.id] ??= 0;
  },
};
