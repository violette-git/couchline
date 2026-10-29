// Crazy Eights: match the top card’s suit or rank, or play an eight and name the suit. Can’t
// (or won’t)? Draw one; play it if it fits, otherwise pass. First to empty their hand wins.
// Cards are strings like '10H' or 'QS'. Hands and the draw pile stay on the server.
import { Nope, int, nextPlayer, shuffle } from './util.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];
const rankOf = (c) => c.slice(0, -1);
const suitOf = (c) => c.slice(-1);
const top = (s) => s.discard.at(-1);

export const fits = (s, c) => rankOf(c) === '8' || suitOf(c) === s.suit || rankOf(c) === rankOf(top(s));

// Takes the top of the draw pile, turning the discards (all but the top card) over when it runs out.
function drawOne(s, ctx) {
  if (!s.draw.length && s.discard.length > 1) {
    s.draw = shuffle(s.discard.slice(0, -1), ctx.rng);
    s.discard = s.discard.slice(-1);
    ctx.say('The discards were shuffled into a new draw pile.');
  }
  return s.draw.pop() || null;
}

function endTurn(s, by, ctx) {
  s.drew = null;
  s.turn = nextPlayer(ctx.players, by);
}

export default {
  setup({ players, rng }) {
    let deck = shuffle(SUITS.flatMap((su) => RANKS.map((r) => r + su)), rng);
    const per = players.length >= 5 ? 5 : 7;
    const hands = {};
    for (const p of players) hands[p.id] = deck.splice(0, per);
    // An eight can’t start the pile: shuffle it back in and flip again.
    while (rankOf(deck[0]) === '8') deck = shuffle(deck, rng);
    const first = deck.shift();
    return {
      hands, draw: deck, discard: [first], suit: suitOf(first),
      turn: players[0].id, drew: null, passes: 0, last: null, result: null,
    };
  },
  move(s, by, m, ctx) {
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const hand = s.hands[by];
    if (m?.play != null) {
      const i = typeof m.play === 'string' ? hand.indexOf(m.play) : int(m.play, 0, hand.length - 1);
      if (i == null || i < 0) throw new Nope('Pick a card from your hand.');
      const c = hand[i];
      if (s.drew && c !== s.drew) throw new Nope('After drawing you can only play the card you drew.');
      if (!fits(s, c)) throw new Nope('Match the suit or the rank, or play an eight.');
      let suit = suitOf(c);
      if (rankOf(c) === '8') {
        if (!SUITS.includes(m.suit)) throw new Nope('Name a suit for your eight.');
        suit = m.suit;
      }
      hand.splice(i, 1);
      s.discard.push(c);
      s.suit = suit;
      s.passes = 0;
      s.last = { by, play: c, suit };
      if (!hand.length) {
        s.result = { winners: [by] };
        s.turn = null;
        return;
      }
      endTurn(s, by, ctx);
      return;
    }
    if (m?.draw) {
      if (s.drew) throw new Nope('You’ve drawn. Play that card or pass.');
      const c = drawOne(s, ctx);
      if (!c) throw new Nope('There’s nothing left to draw. Pass instead.');
      hand.push(c);
      s.drew = c;
      s.last = { by, drew: true };
      return;
    }
    if (m?.pass) {
      const empty = !s.draw.length && s.discard.length <= 1;
      if (!s.drew && !empty) throw new Nope('Draw a card first.');
      s.passes = s.drew ? 0 : s.passes + 1;
      s.last = { by, pass: true };
      // Nobody can draw and everyone has passed in a row: the game is stuck, so fewest cards wins.
      if (s.passes >= ctx.players.length) {
        const least = Math.min(...ctx.players.map((p) => s.hands[p.id].length));
        s.result = { winners: ctx.players.filter((p) => s.hands[p.id].length === least).map((p) => p.id), text: 'No one can move. Fewest cards wins.' };
        s.turn = null;
        return;
      }
      endTurn(s, by, ctx);
      return;
    }
    throw new Nope('Play a card, or draw.');
  },
  // Your own hand; everyone else’s is just a count. At the end every hand is shown.
  view(s, viewer, players) {
    const mine = s.hands[viewer] || null;
    const myTurn = s.turn === viewer && !s.result;
    return {
      hand: mine,
      counts: Object.fromEntries(players.map((p) => [p.id, s.hands[p.id].length])),
      hands: s.result ? s.hands : null,
      drawLeft: s.draw.length,
      top: top(s),
      suit: s.suit,
      drew: s.turn === viewer ? s.drew : null,
      someoneDrew: !!s.drew,
      canPass: myTurn && (!!s.drew || (!s.draw.length && s.discard.length <= 1)),
      playable: myTurn ? mine.map((c) => fits(s, c) && (!s.drew || c === s.drew)) : null,
      last: s.last,
      turn: s.turn,
      result: s.result,
    };
  },
};
