// Yahtzee: five dice, up to three rolls a turn, thirteen boxes to fill. Scored like the
// classic: 35 more for 63 or more up top, and each extra Yahtzee after a scored 50 is worth 100.
// Extra Yahtzees also act as jokers, with the official forced rules: score the matching top box
// if it’s open; if not, any open bottom box at full value (a straight or full house counts);
// failing that, a zero in an open top box.
import { Nope, int, nextPlayer, topScorers } from './util.js';

export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER = ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht', 'chance'];
export const BOXES = [...UPPER, ...LOWER];

const sum = (dice) => dice.reduce((a, b) => a + b, 0);
const counts = (dice) => [1, 2, 3, 4, 5, 6].map((f) => dice.filter((d) => d === f).length);
const runOf = (dice, len) => {
  const has = new Set(dice);
  for (let start = 1; start + len - 1 <= 6; start++) if (Array.from({ length: len }, (_, i) => start + i).every((f) => has.has(f))) return true;
  return false;
};

// What the dice are worth in a box, ignoring whether it’s allowed.
export function points(box, dice, joker = false) {
  const c = counts(dice);
  const u = UPPER.indexOf(box);
  if (u >= 0) return c[u] * (u + 1);
  switch (box) {
    case 'threeKind': return c.some((n) => n >= 3) ? sum(dice) : 0;
    case 'fourKind': return c.some((n) => n >= 4) ? sum(dice) : 0;
    case 'fullHouse': return joker || (c.includes(3) && c.includes(2)) ? 25 : 0;
    case 'smallStraight': return joker || runOf(dice, 4) ? 30 : 0;
    case 'largeStraight': return joker || runOf(dice, 5) ? 40 : 0;
    case 'yacht': return c.includes(5) ? 50 : 0;
    case 'chance': return sum(dice);
    default: return 0;
  }
}

// The boxes this player may score now, with what each is worth.
export function choices(card, dice) {
  const open = BOXES.filter((b) => card[b] == null);
  const isYahtzee = counts(dice).includes(5);
  if (!isYahtzee || card.yacht == null) return Object.fromEntries(open.map((b) => [b, points(b, dice)]));
  const top = UPPER[dice[0] - 1];
  if (card[top] == null) return { [top]: points(top, dice) };
  const low = open.filter((b) => LOWER.includes(b));
  const allowed = low.length ? low : open;
  return Object.fromEntries(allowed.map((b) => [b, points(b, dice, true)]));
}

export function totals(card, bonus = 0) {
  const upper = sum(UPPER.map((b) => card[b] || 0));
  const upperBonus = upper >= 63 ? 35 : 0;
  const lower = sum(LOWER.map((b) => card[b] || 0));
  return { upper, upperBonus, lower, yachtBonus: bonus, total: upper + upperBonus + lower + bonus };
}

export default {
  setup({ players }) {
    return {
      cards: Object.fromEntries(players.map((p) => [p.id, Object.fromEntries(BOXES.map((b) => [b, null]))])),
      bonus: Object.fromEntries(players.map((p) => [p.id, 0])),
      dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false], rolls: 0, rollNo: 0,
      turn: players[0].id, last: null, result: null,
    };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    if ((Array.isArray(m?.hold) || m?.toggle != null) && !(m.roll && !s.rolls)) {
      if (!s.rolls) throw new Nope('Roll first, then hold the dice you want to keep.');
      if (Array.isArray(m.hold)) {
        if (m.hold.length !== 5) throw new Nope('Pick which dice to hold.');
        s.held = m.hold.map((h) => h === true);
      } else {
        const i = int(m.toggle, 0, 4);
        if (i == null) throw new Nope('Pick a die.');
        s.held[i] = !s.held[i];
      }
      if (!m.roll) return;
    }
    if (m?.roll) {
      if (s.rolls >= 3) throw new Nope('That was your third roll. Pick a box to score.');
      if (!s.rolls) s.held = [false, false, false, false, false];
      if (s.held.every(Boolean)) throw new Nope('You’re holding every die. Let one go, or score.');
      s.dice = s.dice.map((d, i) => (s.held[i] ? d : 1 + Math.floor(ctx.rng() * 6)));
      s.rolls++;
      s.rollNo++;
      return;
    }
    if (typeof m?.score === 'string') {
      if (!s.rolls) throw new Nope('Roll the dice first.');
      const card = s.cards[by];
      if (!BOXES.includes(m.score)) throw new Nope('Pick a box on your card.');
      if (card[m.score] != null) throw new Nope('That box is already filled.');
      const can = choices(card, s.dice);
      if (!(m.score in can)) throw new Nope('With a Yahtzee you have to use the joker rules. Pick a highlighted box.');
      // A Yahtzee after a scored 50 earns the bonus, whichever box it goes in.
      const extra = counts(s.dice).includes(5) && card.yacht === 50;
      if (extra) s.bonus[by] += 100;
      card[m.score] = can[m.score];
      s.last = { by, box: m.score, points: can[m.score], dice: [...s.dice], bonus: extra };
      s.rolls = 0;
      s.held = [false, false, false, false, false];
      if (ctx.players.every((p) => BOXES.every((b) => s.cards[p.id][b] != null))) {
        const scores = Object.fromEntries(ctx.players.map((p) => [p.id, totals(s.cards[p.id], s.bonus[p.id]).total]));
        const top = topScorers(scores);
        s.turn = null;
        s.result = ctx.players.length === 1
          ? { winners: top, text: `Final score: ${scores[top[0]]}` }
          : { winners: top, text: `${top.map((id) => ctx.players.find((p) => p.id === id).name).join(' and ')} ${top.length > 1 ? 'tie' : 'wins'} with ${scores[top[0]]}` };
      } else {
        s.turn = nextPlayer(ctx.players, by);
      }
      return;
    }
    throw new Nope('Roll, or pick a box to score.');
  },
  // Nothing is secret; this adds each card’s totals and what the dice are worth right now.
  view(s, viewer, players) {
    return {
      ...s,
      totals: Object.fromEntries(players.map((p) => [p.id, totals(s.cards[p.id], s.bonus[p.id])])),
      can: s.turn && s.rolls ? choices(s.cards[s.turn], s.dice) : null,
    };
  },
};
