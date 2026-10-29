// Minesweeper, together: one field, anyone opens or flags any square. Mines are laid after
// the first open, away from it and its neighbors, so the first square always opens a patch.
// Mine positions stay on the server until the game ends.
import { Nope, int, shuffle } from './util.js';

export const SIZES = { small: { w: 9, h: 9, mines: 10 }, medium: { w: 12, h: 12, mines: 24 }, large: { w: 16, h: 16, mines: 40 } };

function around(s, i) {
  const x = i % s.w;
  const y = Math.floor(i / s.w);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < s.w && ny < s.h) out.push(ny * s.w + nx);
    }
  }
  return out;
}

function lay(s, first, ctx) {
  const keep = new Set([first, ...around(s, first)]);
  const spots = [...Array(s.w * s.h).keys()].filter((i) => !keep.has(i));
  s.mines = shuffle(spots, ctx.rng).slice(0, s.count).sort((a, b) => a - b);
  s.started = ctx.now();
}

// Opens one square, and spreads through every square with no mines around it.
function reveal(s, start) {
  const mines = new Set(s.mines);
  const queue = [start];
  while (queue.length) {
    const i = queue.pop();
    if (s.cells[i] != null || mines.has(i)) continue;
    const n = around(s, i).filter((j) => mines.has(j)).length;
    s.cells[i] = n;
    delete s.flags[i];
    s.opened++;
    if (n === 0) queue.push(...around(s, i).filter((j) => s.cells[j] == null));
  }
}

function boom(s, i, ctx) {
  s.hit = i;
  s.ended = ctx.now();
  s.result = { winners: [], text: 'Boom. The field wins this one.' };
}

function checkWin(s, ctx) {
  if (s.opened < s.w * s.h - s.count) return;
  s.ended = ctx.now();
  const secs = Math.round((s.ended - s.started) / 1000);
  s.result = { winners: ctx.players.map((p) => p.id), text: `Field cleared in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` };
}

export default {
  setup({ options }) {
    const size = SIZES[options.size] || SIZES.medium;
    return {
      w: size.w, h: size.h, count: size.mines, mines: null,
      cells: Array(size.w * size.h).fill(null), // null closed, else how many mines touch it
      flags: {}, // square -> who flagged it
      opened: 0, started: null, ended: null, hit: null, by: null, turn: null, result: null,
    };
  },
  move(s, by, m, ctx) {
    const n = s.w * s.h;
    if (m?.flag != null) {
      const i = int(m.flag, 0, n - 1);
      if (i == null) throw new Nope('Pick a square.');
      if (s.cells[i] != null) throw new Nope('That square is already open.');
      if (s.flags[i]) delete s.flags[i];
      else s.flags[i] = by;
      return;
    }
    const i = int(m?.open, 0, n - 1);
    if (i == null) throw new Nope('Pick a square.');
    if (s.flags[i]) throw new Nope('That square is flagged. Unflag it to open it.');
    s.by = by;
    if (!s.mines) lay(s, i, ctx);
    if (s.cells[i] != null) {
      // Chording: a number with that many flags around it opens the rest of its neighbors.
      const near = around(s, i);
      const flagged = near.filter((j) => s.flags[j]).length;
      const closed = near.filter((j) => s.cells[j] == null && !s.flags[j]);
      if (!s.cells[i] || !closed.length) throw new Nope('Nothing left to open around there.');
      if (flagged !== s.cells[i]) throw new Nope(`Flag ${s.cells[i]} ${s.cells[i] === 1 ? 'mine' : 'mines'} around it first.`);
      const mines = new Set(s.mines);
      const bad = closed.find((j) => mines.has(j));
      if (bad != null) return boom(s, bad, ctx);
      for (const j of closed) reveal(s, j);
      return checkWin(s, ctx);
    }
    if (s.mines.includes(i)) return boom(s, i, ctx);
    reveal(s, i);
    checkWin(s, ctx);
  },
  // Only opened squares’ numbers go out, never where the mines are, until it’s over.
  view(s) {
    const { mines, ...rest } = s;
    return { ...rest, mines: s.result ? mines : null };
  },
  join() {},
};
