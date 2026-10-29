// Sudoku, together: one grid, everyone filling it at once. The puzzle has exactly one
// solution, which stays on the server; wrong numbers are marked by comparing against it.
import { Nope, int, shuffle } from './util.js';

const GIVENS = { easy: 40, medium: 32, hard: 26 };
const ALL = 0x3FE; // bits 1 to 9
const bits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const ROW = (i) => Math.floor(i / 9), COL = (i) => i % 9, BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

// Counts solutions of grid (0 is empty), stopping at limit. Fills grid with the first one found
// when fill is true. Picks the emptiest-choice cell first, so it's quick.
function solve(grid, limit, rng = null, fill = false) {
  const g = [...grid];
  const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    if (!g[i]) continue;
    const b = 1 << g[i];
    if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0;
    rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
  }
  let count = 0;
  const step = () => {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]);
      const n = bits(mask);
      if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) {
      count++;
      if (fill && count === 1) grid.splice(0, 81, ...g);
      return count >= limit;
    }
    let digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rng) digits = shuffle(digits, rng);
    const r = ROW(best), c = COL(best), bx = BOX(best);
    for (const d of digits) {
      const b = 1 << d;
      g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      const done = step();
      g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
      if (done) return true;
    }
    return false;
  };
  step();
  return count;
}

// A full random grid, then numbers taken away (in random order) as long as the puzzle keeps
// exactly one solution, until it's down to the level's count of givens. Hard grids sometimes
// get stuck a few above the target, so a few fresh tries keep the sparsest.
export function generate(level, rng) {
  const target = GIVENS[level] || GIVENS.easy;
  let best = null;
  for (let tries = 0; tries < 6 && !(best?.left <= target); tries++) {
    const solution = Array(81).fill(0);
    solve(solution, 1, rng, true);
    const puzzle = [...solution];
    let left = 81;
    for (const i of shuffle([...Array(81).keys()], rng)) {
      if (left <= target) break;
      const keep = puzzle[i];
      puzzle[i] = 0;
      if (solve(puzzle, 2) === 1) left--;
      else puzzle[i] = keep;
    }
    if (!best || left < best.left) best = { puzzle, solution, left };
  }
  return { puzzle: best.puzzle, solution: best.solution };
}
export const countSolutions = (grid, limit = 2) => solve(grid, limit);

export default {
  setup({ options, rng }) {
    const level = GIVENS[options.level] ? options.level : 'easy';
    const { puzzle, solution } = generate(level, rng);
    return {
      level, givens: puzzle, solution, entries: Array(81).fill(null), turn: null, result: null,
    };
  },
  move(s, by, m, ctx) {
    const cell = int(m?.cell, 0, 80);
    const digit = int(m?.digit, 0, 9);
    if (cell == null || digit == null) throw new Nope('Pick a square and a number.');
    if (s.givens[cell]) throw new Nope('That number is part of the puzzle.');
    if (!digit) { s.entries[cell] = null; return; }
    if (s.entries[cell]?.d === digit) return;
    s.entries[cell] = { d: digit, by };
    if (s.entries.every((e, i) => s.givens[i] || e?.d === s.solution[i])) {
      s.result = { winners: ctx.players.map((p) => p.id), text: 'Solved together!' };
    }
  },
  // Wrong numbers are flagged here so the solution itself never leaves the server.
  view(s) {
    const { solution, entries, ...rest } = s;
    return { ...rest, entries: entries.map((e, i) => (e ? (e.d === solution[i] ? e : { ...e, wrong: true }) : null)) };
  },
  // Late joiners need nothing set up: the grid is shared, and their numbers show in their color.
  join() {},
};
