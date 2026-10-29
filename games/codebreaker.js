// Mastermind, together: Couchline hides a code of colored pegs; anyone can submit a guess.
// Black is right color, right spot; white is right color, wrong spot. Ten guesses.
import { Nope, int } from './util.js';

export const COLORS = 6;
export const MAX_GUESSES = 10;

// How many pegs are right (black) and right color but misplaced (white).
export function score(code, guess) {
  let black = 0;
  const a = Array(COLORS).fill(0), b = Array(COLORS).fill(0);
  code.forEach((c, i) => {
    if (c === guess[i]) black++;
    else { a[c]++; b[guess[i]]++; }
  });
  const white = a.reduce((sum, n, k) => sum + Math.min(n, b[k]), 0);
  return { black, white };
}

export default {
  setup({ options, rng }) {
    const length = Number(options.length) === 5 ? 5 : 4;
    return {
      length, code: Array.from({ length }, () => Math.floor(rng() * COLORS)),
      guesses: [], turn: null, result: null,
    };
  },
  move(s, by, m, ctx) {
    const pegs = Array.isArray(m?.guess) && m.guess.length === s.length ? m.guess.map((c) => int(c, 0, COLORS - 1)) : null;
    if (!pegs || pegs.includes(null)) throw new Nope(`Fill all ${s.length} pegs first.`);
    if (s.guesses.some((g) => g.pegs.join() === pegs.join())) throw new Nope('That one’s been tried. Change a peg.');
    const { black, white } = score(s.code, pegs);
    s.guesses.push({ by, pegs, black, white });
    const n = s.guesses.length;
    const everyone = ctx.players.map((p) => p.id);
    if (black === s.length) s.result = { winners: everyone, text: n === 1 ? 'Cracked on the first try!' : `Cracked in ${n} guesses` };
    else if (n >= MAX_GUESSES) s.result = { winners: [], text: 'Out of guesses. The code is shown.' };
  },
  // The code only leaves the server once the game is over.
  view(s) {
    const { code, ...rest } = s;
    return { ...rest, code: s.result ? code : null };
  },
};
