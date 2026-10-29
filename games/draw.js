// Pictionary: players take turns as the artist. The artist picks one of three words and draws
// it while everyone else types guesses. Sooner guesses score more (100 down to 50), and the
// artist scores for each person who gets it. Strokes go straight to every screen as they're
// drawn, without resending the whole game.
import { Nope, shuffle, pick, int, text, squash, editDistance, topScorers } from './util.js';
import { WORDS } from './draw-words.js';

export const CHOOSE_MS = 8000;
export const REVEAL_MS = 4000;
export const MAX_POINTS = 20000;
export const ARTIST_POINTS = 25;
export const COLORS = ['ink', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'erase'];
export const WIDTHS = [3, 8, 18, 40];
const FEED_MAX = 40;

const isLetter = (ch) => /[a-z0-9]/i.test(ch);
const nameOf = (ctx, id) => ctx.players.find((p) => p.id === id)?.name || 'Someone';

// The guessers this turn: every player but the artist.
const guessers = (s, ctx) => ctx.players.filter((p) => p.id !== s.artist);

function startTurn(s, ctx) {
  s.artist = s.order[s.pos];
  s.turn = s.artist;
  s.phase = 'choose';
  const fresh = WORDS.filter((w) => !s.used.includes(w));
  s.choices = shuffle(fresh.length >= 3 ? fresh : WORDS, ctx.rng).slice(0, 3);
  s.word = null;
  s.strokes = [];
  s.points = 0;
  s.guessed = {};
  s.artistGain = 0;
  s.feed = [];
  s.shown = 0;
  s.hints = [];
  s.deadline = ctx.now() + CHOOSE_MS;
  ctx.timer(CHOOSE_MS, (st, c) => choose(st, c, pick(st.choices, c.rng)));
}

function choose(s, ctx, word) {
  s.word = word;
  s.used.push(word);
  s.choices = [];
  s.phase = 'draw';
  // Up to two letters to give away later, picked now so everyone sees the same ones.
  const spots = [...word].map((ch, i) => (isLetter(ch) ? i : -1)).filter((i) => i >= 0);
  s.hints = shuffle(spots, ctx.rng).slice(0, spots.length >= 6 ? 2 : 1);
  const ms = s.seconds * 1000;
  s.startedAt = ctx.now();
  s.deadline = s.startedAt + ms;
  // Half time: one letter. Three quarters: a second one for longer words. Then time's up.
  ctx.timer(ms / 2, (st, c) => {
    st.shown = 1;
    c.timer(ms / 4, (st2, c2) => {
      st2.shown = st2.hints.length;
      c2.timer(ms / 4, endTurn);
    });
  });
}

function endTurn(s, ctx) {
  s.phase = 'reveal';
  s.deadline = ctx.now() + REVEAL_MS;
  ctx.timer(REVEAL_MS, nextTurn);
}

function nextTurn(s, ctx) {
  s.pos++;
  if (s.pos >= s.order.length) { s.pos = 0; s.lap++; }
  if (s.lap >= s.turns) {
    s.deadline = null;
    s.turn = null;
    const best = Math.max(...Object.values(s.scores));
    s.result = best > 0 ? { winners: topScorers(s.scores) } : { winners: [], text: 'Nobody scored this time.' };
    return;
  }
  startTurn(s, ctx);
}

function feed(s, entry) {
  s.feed.push(entry);
  if (s.feed.length > FEED_MAX) s.feed.shift();
}

// A stroke's points, checked and rounded: [[x, y], ...] with both between 0 and 1.
function cleanPoints(list) {
  if (!Array.isArray(list) || !list.length || list.length > 400) return null;
  const out = [];
  for (const p of list) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000]);
  }
  return out;
}

export default {
  setup({ players, options }, ctx) {
    const s = {
      order: players.map((p) => p.id), turns: options.turns || 1, seconds: options.seconds || 80,
      lap: 0, pos: 0, artist: null, phase: 'choose', choices: [], word: null, used: [],
      strokes: [], points: 0, guessed: {}, artistGain: 0, feed: [], shown: 0, hints: [], startedAt: 0,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: null, deadline: null, result: null,
    };
    startTurn(s, ctx);
    return s;
  },
  move(s, by, m, ctx) {
    const artist = by === s.artist;
    if (s.phase === 'choose') {
      if (!artist) throw new Nope(`${nameOf(ctx, s.artist)} is picking a word.`);
      const i = int(m?.choose, 0, s.choices.length - 1);
      if (i === null) throw new Nope('Pick one of the three words.');
      choose(s, ctx, s.choices[i]);
      return;
    }
    if (s.phase !== 'draw') throw new Nope('The next turn is coming up.');

    if (artist) {
      if (m?.stroke) {
        const st = m.stroke;
        const id = int(st.id, 0, 2 ** 31);
        const color = COLORS.includes(st.color) ? st.color : null;
        const width = WIDTHS.includes(st.width) ? st.width : null;
        const points = cleanPoints(st.points);
        if (id === null || !color || !width || !points) throw new Nope('That stroke didn’t make sense.');
        if (s.points + points.length > MAX_POINTS) throw new Nope('The canvas is full. Undo or clear to keep drawing.');
        const last = s.strokes.at(-1);
        if (last && last.id === id && last.color === color && last.width === width) last.points.push(...points);
        else s.strokes.push({ id, color, width, points });
        s.points += points.length;
        return { quiet: true, relay: { stroke: { id, color, width, points } } };
      }
      if (m?.undo) {
        const gone = s.strokes.pop();
        if (!gone) throw new Nope('Nothing to undo.');
        s.points -= gone.points.length;
        return;
      }
      if (m?.clear) {
        s.strokes = [];
        s.points = 0;
        return;
      }
      throw new Nope('You’re drawing this one.');
    }

    if (s.guessed[by] !== undefined) throw new Nope('You got it. Wait for the next turn.');
    const said = text(m?.guess, 40);
    const g = squash(said);
    if (!g) throw new Nope('Type a guess.');
    const w = squash(s.word);
    if (g === w) {
      const ms = s.seconds * 1000;
      const pts = Math.round(100 - 50 * Math.min(1, (ctx.now() - s.startedAt) / ms));
      s.guessed[by] = pts;
      s.scores[by] = (s.scores[by] || 0) + pts;
      s.artistGain += ARTIST_POINTS;
      s.scores[s.artist] = (s.scores[s.artist] || 0) + ARTIST_POINTS;
      feed(s, { by, kind: 'right' });
      if (guessers(s, ctx).every((p) => s.guessed[p.id] !== undefined)) {
        ctx.clearTimer();
        endTurn(s, ctx);
      }
      return;
    }
    // One letter off, or the word with something extra, is only shown to the person who typed it.
    const close = editDistance(g, w) === 1 || g.includes(w);
    feed(s, { by, text: said, kind: close ? 'close' : 'guess' });
  },
  // The word goes only to the artist and to people who've guessed it, until the turn ends.
  view(s, viewer) {
    const open = !!s.word && (viewer === s.artist || s.guessed[viewer] !== undefined || s.phase === 'reveal' || !!s.result);
    const shown = s.hints.slice(0, s.shown);
    return {
      phase: s.phase, artist: s.artist, lap: s.lap, turns: s.turns, seconds: s.seconds, startedAt: s.startedAt,
      choices: viewer === s.artist ? s.choices : [],
      word: open ? s.word : null,
      mask: s.word ? [...s.word].map((ch, i) => (!isLetter(ch) ? ch : open || shown.includes(i) ? ch : null)) : null,
      strokes: s.strokes,
      guessed: s.guessed, artistGain: s.artistGain, scores: s.scores,
      feed: s.feed.filter((f) => f.kind !== 'close' || f.by === viewer),
    };
  },
  join(s, player) {
    if (!s.order.includes(player.id)) s.order.push(player.id);
    s.scores[player.id] ??= 0;
  },
};
