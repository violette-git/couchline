// Would You Rather: everyone picks A or B in secret, and the picks reveal together. Siding with
// the majority scores a point; on a perfect split, everyone who picked scores.
import { Nope, shuffle, topScorers } from './util.js';
import { PROMPTS } from './wyr-prompts.js';

export const PICK_MS = 20000;
export const REVEAL_MS = 5000;

function ask(s, ctx) {
  s.phase = 'pick';
  s.picks = {};
  s.gained = {};
  s.deadline = ctx.now() + PICK_MS;
  ctx.timer(PICK_MS, reveal);
}

function reveal(s, ctx) {
  s.phase = 'reveal';
  const ids = Object.keys(s.picks);
  const a = ids.filter((id) => s.picks[id] === 'a').length;
  const b = ids.length - a;
  const side = a === b ? null : a > b ? 'a' : 'b';
  for (const id of ids) {
    if (!side || s.picks[id] === side) {
      s.gained[id] = 1;
      s.scores[id] = (s.scores[id] || 0) + 1;
    }
  }
  s.history.push({ a, b });
  s.deadline = ctx.now() + REVEAL_MS;
  ctx.timer(REVEAL_MS, (st, c) => {
    if (st.i + 1 < st.prompts.length) { st.i++; return ask(st, c); }
    st.deadline = null;
    const best = Math.max(...Object.values(st.scores));
    st.result = best > 0 ? { winners: topScorers(st.scores) } : { winners: [], text: 'Nobody scored this time.' };
  });
}

export default {
  setup({ players, options, rng }, ctx) {
    const s = {
      prompts: shuffle(PROMPTS, rng).slice(0, options.count || 10),
      i: 0, phase: 'pick', picks: {}, gained: {}, history: [],
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: null, deadline: null, result: null,
    };
    ask(s, ctx);
    return s;
  },
  move(s, by, m, ctx) {
    if (s.phase !== 'pick') throw new Nope('The next one is coming up.');
    if (m?.pick !== 'a' && m?.pick !== 'b') throw new Nope('Pick one side.');
    if (s.picks[by]) throw new Nope('You’ve picked. Waiting on the others.');
    s.picks[by] = m.pick;
    if (ctx.players.every((p) => s.picks[p.id])) {
      ctx.clearTimer();
      reveal(s, ctx);
    }
  },
  // Until the reveal, you see your own pick and only whether others have picked.
  view(s, viewer) {
    const open = s.phase === 'reveal';
    const picks = {};
    for (const [id, p] of Object.entries(s.picks)) picks[id] = open || id === viewer ? p : 'hidden';
    return {
      n: s.i + 1, total: s.prompts.length, phase: s.phase, prompt: s.prompts[s.i],
      picks, gained: open ? s.gained : {}, scores: s.scores,
    };
  },
  join(s, player) {
    s.scores[player.id] ??= 0;
  },
};
