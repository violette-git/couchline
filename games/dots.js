// Dots and Boxes: draw lines between dots; close a box to claim it and draw again.
// For a board of n by n boxes there are (n + 1) rows of n across lines, numbered first
// (row * n + col), then n rows of (n + 1) down lines (n * (n + 1) + row * (n + 1) + col).
import { Nope, int, nextPlayer, topScorers } from './util.js';

export const lineCount = (n) => 2 * n * (n + 1);

// The four lines around box (r, c): top, bottom, left, right.
export function sides(n, r, c) {
  const down = n * (n + 1);
  return [r * n + c, (r + 1) * n + c, down + r * (n + 1) + c, down + r * (n + 1) + c + 1];
}

// The boxes (one or two) that a line borders.
function boxesOf(n, line) {
  const down = n * (n + 1);
  const out = [];
  if (line < down) {
    const r = Math.floor(line / n), c = line % n;
    if (r > 0) out.push([r - 1, c]);
    if (r < n) out.push([r, c]);
  } else {
    const k = line - down, r = Math.floor(k / (n + 1)), c = k % (n + 1);
    if (c > 0) out.push([r, c - 1]);
    if (c < n) out.push([r, c]);
  }
  return out;
}

export default {
  setup({ players, options }) {
    const n = int(Number(options.size), 3, 6) ?? 4;
    return {
      size: n, lines: Array(lineCount(n)).fill(null), boxes: Array(n * n).fill(null),
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: players[0].id, last: null, claimed: [], result: null,
    };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const n = s.size;
    const line = int(m?.line, 0, lineCount(n) - 1);
    if (line == null) throw new Nope('Pick a line between two dots.');
    if (s.lines[line]) throw new Nope('That line is already drawn.');
    s.lines[line] = by;
    s.last = line;
    s.claimed = [];
    for (const [r, c] of boxesOf(n, line)) {
      if (sides(n, r, c).every((l) => s.lines[l])) {
        s.boxes[r * n + c] = by;
        s.scores[by]++;
        s.claimed.push(r * n + c);
      }
    }
    if (s.boxes.every(Boolean)) {
      s.result = { winners: topScorers(s.scores) };
      s.turn = null;
    } else if (!s.claimed.length) {
      s.turn = nextPlayer(ctx.players, by);
    }
  },
};
