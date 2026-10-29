// Wordle: everyone guesses the same hidden five letter word, six tries each, at their own
// pace. You see your own letters and everyone else's colors. Once someone solves it, the rest
// have two minutes to finish. Fewest guesses wins, and the faster solver breaks a tie.
import { Nope, pick, text } from './util.js';
import { ANSWERS, ALLOWED } from './wordrace-words.js';

export const TRIES = 6;
export const LAST_CALL = 120000;

// Green, yellow, gray for one guess. Letters that are right in place are matched first, so a
// repeated letter only shows yellow as many times as the answer still has it.
export function colors(guess, answer) {
  const out = Array(5).fill('wrong');
  const left = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = 'right';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] !== 'right' && left[guess[i]]) { out[i] = 'close'; left[guess[i]]--; }
  }
  return out;
}

const board = () => ({ rows: [], solved: false, done: false, at: null, order: null });

function finish(s, ctx) {
  s.deadline = null;
  const word = s.answer.toUpperCase();
  const solved = Object.entries(s.boards).filter(([, b]) => b.solved);
  if (!solved.length) {
    s.result = { winners: [], text: `Nobody got it. The word was ${word}.` };
    return;
  }
  solved.sort(([, a], [, b]) => a.rows.length - b.rows.length || a.at - b.at || a.order - b.order);
  const [id, best] = solved[0];
  const name = ctx.players.find((p) => p.id === id)?.name || 'Someone';
  s.result = { winners: [id], text: `${name} wins in ${best.rows.length}. The word was ${word}.` };
}

// The game ends when everyone is done, or when the last call runs out.
function check(s, ctx) {
  if (!Object.values(s.boards).every((b) => b.done)) return;
  ctx.clearTimer();
  finish(s, ctx);
}

function lastCall(s, ctx) {
  if (s.deadline) return;
  s.deadline = ctx.now() + LAST_CALL;
  ctx.timer(LAST_CALL, (st, c) => {
    for (const b of Object.values(st.boards)) b.done = true;
    check(st, c);
  });
}

export default {
  setup({ players, rng }) {
    return {
      answer: pick(ANSWERS, rng),
      boards: Object.fromEntries(players.map((p) => [p.id, board()])),
      firstSolver: null,
      finished: 0,
      turn: null,
      deadline: null,
      result: null,
    };
  },
  move(s, by, m, ctx) {
    const b = s.boards[by];
    if (!b) throw new Nope('Join the game to play.');
    if (b.done) throw new Nope(b.solved ? 'You solved it. Waiting on the others.' : 'You’re out of guesses. Waiting on the others.');
    const guess = text(m?.guess, 10).toLowerCase();
    if (!/^[a-z]{5}$/.test(guess)) throw new Nope('Guesses are five letters.');
    if (!ALLOWED.has(guess)) throw new Nope('Not in the word list.');
    if (b.rows.some((r) => r.word === guess)) throw new Nope('You tried that one already.');
    const row = { word: guess, colors: colors(guess, s.answer) };
    b.rows.push(row);
    if (guess === s.answer) {
      b.solved = true;
      b.done = true;
      b.at = ctx.now();
      b.order = ++s.finished;
      if (!s.firstSolver) {
        s.firstSolver = by;
        ctx.say(`${ctx.players.find((p) => p.id === by)?.name || 'Someone'} solved it in ${b.rows.length}. Two minutes left.`, by);
      }
      lastCall(s, ctx);
    } else if (b.rows.length >= TRIES) {
      b.done = true;
      b.at = ctx.now();
      // Someone out of guesses also starts the clock, so nobody waits forever on an idle player.
      lastCall(s, ctx);
    }
    check(s, ctx);
  },
  // Your own rows with letters; everyone else's as colors only, until the end.
  view(s, viewer) {
    const over = !!s.result;
    const boards = {};
    for (const [id, b] of Object.entries(s.boards)) {
      const open = over || id === viewer;
      boards[id] = { solved: b.solved, done: b.done, rows: b.rows.map((r) => (open ? r : { colors: r.colors })) };
    }
    return { boards, firstSolver: s.firstSolver, answer: over ? s.answer : null, tries: TRIES };
  },
  join(s, player) {
    s.boards[player.id] ||= board();
  },
};
