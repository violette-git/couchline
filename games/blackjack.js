// Blackjack: everyone against the dealer, 100 chips each. Each hand: everyone bets at once,
// two cards each from a two-deck shoe, players act in seat order, then the dealer draws to 17
// (standing on soft 17) and bets are paid. Splitting isn’t offered, to keep turns quick.
// Cards are strings like '10H' or 'QS'. The shoe and the dealer’s hole card never leave the server.
import { Nope, int, shuffle } from './util.js';

export const BETS = [5, 10, 25, 50];
const MIN = BETS[0];
const BET_MS = 20000;
const TURN_MS = 30000;
const SHOW_MS = 8000; // results before the next hand, unless everyone taps Next
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];

const rankOf = (c) => c.slice(0, -1);
const freshShoe = (rng) => shuffle([0, 1].flatMap(() => SUITS.flatMap((s) => RANKS.map((r) => r + s))), rng);

// The best total, and whether an ace is still counting as 11.
export function total(cards) {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 'A') { aces++; t += 11; } else t += ['J', 'Q', 'K'].includes(r) ? 10 : Number(r);
  }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const natural = (cards) => cards.length === 2 && total(cards).t === 21;

const inHand = (s) => Object.keys(s.seats);
const canPlay = (s, id) => s.chips[id] >= MIN;

function draw(s, ctx) {
  if (!s.shoe.length) s.shoe = freshShoe(ctx.rng);
  return s.shoe.pop();
}

// A new hand: everyone who still has chips bets at once.
function betting(s, ctx) {
  const players = ctx.players.filter((p) => canPlay(s, p.id));
  if (!players.length) return finish(s, ctx);
  s.phase = 'bet';
  s.seats = {};
  s.dealer = [];
  s.bets = Object.fromEntries(players.map((p) => [p.id, null]));
  s.ready = [];
  s.turn = null;
  s.deadline = ctx.now() + BET_MS;
  ctx.timer(BET_MS, (st, c) => {
    for (const id of Object.keys(st.bets)) if (st.bets[id] == null) st.bets[id] = MIN;
    deal(st, c);
  });
}

function deal(s, ctx) {
  ctx.clearTimer();
  if (s.shoe.length < 26) { s.shoe = freshShoe(ctx.rng); s.shuffled = true; } else s.shuffled = false;
  s.seats = {};
  for (const [id, bet] of Object.entries(s.bets)) {
    s.chips[id] -= bet;
    s.seats[id] = { cards: [], bet, doubled: false, done: false, outcome: null, paid: 0 };
  }
  s.dealer = [];
  for (let round = 0; round < 2; round++) {
    for (const id of inHand(s)) s.seats[id].cards.push(draw(s, ctx));
    s.dealer.push(draw(s, ctx));
  }
  for (const id of inHand(s)) if (natural(s.seats[id].cards)) s.seats[id].done = true;
  s.phase = 'play';
  // The dealer checks for blackjack under an ace or a ten card, as in most casinos.
  if (natural(s.dealer)) return settle(s, ctx);
  nextTurn(s, ctx);
}

function nextTurn(s, ctx) {
  const id = ctx.players.map((p) => p.id).find((x) => s.seats[x] && !s.seats[x].done);
  if (!id) return settle(s, ctx);
  s.turn = id;
  s.deadline = ctx.now() + TURN_MS;
  ctx.timer(TURN_MS, (st, c) => {
    st.seats[st.turn].done = true;
    nextTurn(st, c);
  });
}

// The dealer reveals and draws, then every bet is paid.
function settle(s, ctx) {
  ctx.clearTimer();
  s.turn = null;
  const dealerBj = natural(s.dealer);
  const anyLive = inHand(s).some((id) => total(s.seats[id].cards).t <= 21 && !natural(s.seats[id].cards));
  if (!dealerBj && anyLive) while (total(s.dealer).t < 17) s.dealer.push(draw(s, ctx));
  const d = total(s.dealer).t;
  for (const id of inHand(s)) {
    const seat = s.seats[id];
    const mine = total(seat.cards).t;
    const bj = natural(seat.cards);
    let back = 0;
    if (mine > 21) seat.outcome = 'bust';
    else if (bj && dealerBj) { seat.outcome = 'push'; back = seat.bet; }
    else if (bj) { seat.outcome = 'blackjack'; back = seat.bet + Math.floor(seat.bet * 1.5); }
    else if (dealerBj) seat.outcome = 'lose';
    else if (d > 21 || mine > d) { seat.outcome = 'win'; back = seat.bet * 2; }
    else if (mine === d) { seat.outcome = 'push'; back = seat.bet; }
    else seat.outcome = 'lose';
    seat.paid = back;
    seat.done = true;
    s.chips[id] += back;
  }
  if (s.hand >= s.hands || !ctx.players.some((p) => canPlay(s, p.id))) return finish(s, ctx);
  s.phase = 'done';
  s.ready = [];
  s.deadline = ctx.now() + SHOW_MS;
  ctx.timer(SHOW_MS, nextHand);
}

function nextHand(s, ctx) {
  s.hand++;
  betting(s, ctx);
}

function finish(s, ctx) {
  ctx.clearTimer();
  s.phase = 'over';
  s.turn = null;
  s.deadline = null;
  const best = Math.max(...ctx.players.map((p) => s.chips[p.id]));
  const winners = ctx.players.filter((p) => s.chips[p.id] === best).map((p) => p.id);
  const names = winners.map((id) => ctx.players.find((p) => p.id === id).name);
  s.result = ctx.players.length === 1
    ? { winners, text: best > 100 ? `You finished with ${best} chips, up ${best - 100}` : `You finished with ${best} chips` }
    : { winners, text: `${names.join(' and ')} ${winners.length > 1 ? 'tie' : 'wins'} with ${best} chips` };
}

export default {
  setup({ players, options, rng }, ctx) {
    const s = {
      hands: options.hands, hand: 1, phase: 'bet', shoe: freshShoe(rng), shuffled: false,
      chips: Object.fromEntries(players.map((p) => [p.id, 100])),
      bets: {}, seats: {}, dealer: [], ready: [], turn: null, deadline: null, result: null,
    };
    betting(s, ctx);
    return s;
  },
  move(s, by, m, ctx) {
    if (s.phase === 'bet') {
      if (!(by in s.bets)) throw new Nope('You’re out of chips, so you’re sitting this one out.');
      if (s.bets[by] != null) throw new Nope('Your bet is in. Waiting on the others.');
      const bet = int(m?.bet, 1, 1000);
      if (!BETS.includes(bet)) throw new Nope('Bet 5, 10, 25, or 50.');
      if (bet > s.chips[by]) throw new Nope('You don’t have that many chips.');
      s.bets[by] = bet;
      if (Object.values(s.bets).every((b) => b != null)) deal(s, ctx);
      return;
    }
    if (s.phase === 'done') {
      if (!m?.next) throw new Nope('The next hand is coming up.');
      if (!s.ready.includes(by)) s.ready.push(by);
      // Everyone still in the game has seen enough: deal the next hand now.
      if (ctx.players.filter((p) => canPlay(s, p.id)).every((p) => s.ready.includes(p.id))) nextHand(s, ctx);
      return;
    }
    if (s.phase !== 'play') throw new Nope('Wait for the next hand.');
    if (s.turn !== by) throw new Nope(s.seats[by] ? 'It’s not your turn.' : 'You’re sitting this hand out.');
    const seat = s.seats[by];
    if (m?.hit) {
      seat.cards.push(draw(s, ctx));
      if (total(seat.cards).t >= 21) seat.done = true;
    } else if (m?.stand) {
      seat.done = true;
    } else if (m?.double) {
      if (seat.cards.length !== 2) throw new Nope('You can only double down on your first two cards.');
      if (s.chips[by] < seat.bet) throw new Nope('You don’t have enough chips to double.');
      s.chips[by] -= seat.bet;
      seat.bet *= 2;
      seat.doubled = true;
      seat.cards.push(draw(s, ctx));
      seat.done = true;
    } else {
      throw new Nope('Hit, stand, or double down.');
    }
    if (seat.done) nextTurn(s, ctx);
  },
  // The shoe stays on the server, and the hole card stays face down until the dealer plays.
  view(s) {
    const { shoe, ...rest } = s;
    const hidden = s.phase === 'play';
    return {
      ...rest,
      shoeLeft: shoe.length,
      dealer: s.dealer.map((c, i) => (hidden && i === 1 ? null : c)),
      dealerTotal: s.dealer.length ? (hidden ? total([s.dealer[0]]) : total(s.dealer)) : null,
      totals: Object.fromEntries(Object.entries(s.seats).map(([id, seat]) => [id, total(seat.cards)])),
    };
  },
};
