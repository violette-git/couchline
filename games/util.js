// Helpers shared by the games' rules.

// A move or a start that isn't allowed. The message is shown to the person who tried it.
// Any other error is a bug: it's logged, and the person sees a generic message.
export class Nope extends Error {}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length)];
export const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
export const text = (v, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// The next player id after "id", going round the table.
export function nextPlayer(players, id, step = 1) {
  const i = players.findIndex((p) => p.id === id);
  return players[(i + step + players.length) % players.length].id;
}

// Lowercase letters and digits only, for comparing typed answers.
export const squash = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

// How many single-letter edits turn a into b (for "close spelling counts").
export function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

// Points for winning, by player id, in the order given. Ties all win.
export function topScorers(scores) {
  const best = Math.max(...Object.values(scores));
  return Object.keys(scores).filter((id) => scores[id] === best);
}
