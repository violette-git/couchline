// Blackjack: the dealer across the top, a seat for each player below, and your controls
// (bet, then hit, stand, or double) under the table.
import { card, tint } from './kit.js';

const BETS = [5, 10, 25, 50];
const toCard = (c) => (c ? { rank: c.slice(0, -1), suit: c.slice(-1) } : null);
const OUTCOME = { win: 'Win', blackjack: 'Blackjack', push: 'Push', lose: 'Lose', bust: 'Bust' };

export default function mount(root, api) {
  const { el } = api;
  // Draws the game; skips the pieces that don’t apply right now.
  const put = (...kids) => root.replaceChildren(...kids.filter(Boolean));
  // Cards already on screen don’t deal in again when the table redraws.
  let seen = new Set();
  let now = new Set();
  const draw = (c, key, width, delay = 0) => {
    const k = `${key}:${c || 'down'}`;
    const node = card(toCard(c), { width });
    if (seen.has(k)) node.classList.add('bj-still');
    else if (delay) node.style.animationDelay = `${delay}s`;
    now.add(k);
    return node;
  };

  const totalText = (t) => (t ? `${t.soft && t.t < 21 ? `${t.t - 10} or ${t.t}` : t.t}` : '');

  return {
    update(game) {
      const s = game.view;
      const over = !!game.result;
      const me = api.me;
      const mySeat = s.seats[me];
      const myTurn = game.turn === me && !over;
      const chips = s.chips[me];

      now = new Set();
      // The dealer. When the dealer plays, new cards come in one after another.
      let fresh = 0;
      const dealerCards = s.dealer.map((c, i) => {
        const isNew = !seen.has(`${s.hand}:d${i}:${c || 'down'}`);
        return draw(c, `${s.hand}:d${i}`, 'clamp(3.2rem, 2.4rem + 3cqw, 4.4rem)', isNew && i >= 1 && s.phase !== 'play' ? 0.45 * fresh++ : 0);
      });
      const dealer = el('div', { class: 'bj-dealer' },
        el('div', { class: 'bj-dealer-head' }, el('span', { class: 'bj-label' }, 'Dealer'), s.dealerTotal ? el('b', { class: 'bj-total' }, totalText(s.dealerTotal)) : null,
          s.dealerTotal?.t > 21 ? el('span', { class: 'bj-out is-bust' }, 'Bust') : null),
        el('div', { class: 'g-hand bj-cards' }, ...(dealerCards.length ? dealerCards : [el('span', { class: 'bj-empty' }, s.phase === 'bet' ? 'Place your bets' : '')])),
        el('p', { class: 'bj-rule' }, 'Dealer stands on all 17s. Blackjack pays 3 to 2.'));

      // A seat per player.
      const seats = el('div', { class: 'bj-seats' }, ...game.players.map((p) => {
        const seat = s.seats[p.id];
        const out = s.chips[p.id] < 5 && !seat;
        const t = s.totals[p.id];
        let tag = null;
        if (seat?.outcome) {
          const net = seat.paid - seat.bet;
          tag = el('span', { class: `bj-out is-${seat.outcome}` }, `${OUTCOME[seat.outcome]}${net > 0 ? ` +${net}` : net < 0 ? ` ${net}` : ''}`);
        } else if (s.phase === 'bet' && p.id in s.bets) {
          tag = el('span', { class: 'bj-out' }, s.bets[p.id] != null ? `Bet ${s.bets[p.id]}` : 'Betting');
        } else if (out) {
          tag = el('span', { class: 'bj-out is-lose' }, 'Out of chips');
        } else if (seat && t?.t === 21 && seat.cards.length === 2) {
          tag = el('span', { class: 'bj-out is-blackjack' }, 'Blackjack');
        } else if (seat && t?.t > 21) {
          tag = el('span', { class: 'bj-out is-bust' }, 'Bust');
        }
        const box = el('section', { class: `bj-seat${game.turn === p.id && !over ? ' is-turn' : ''}${out ? ' is-out' : ''}${over && game.result.winners.includes(p.id) ? ' is-win' : ''}`, 'aria-label': p.name },
          el('header', {},
            el('span', { class: 'dot' }),
            el('span', { class: 'bj-name' }, p.id === me ? 'You' : p.name),
            el('span', { class: 'bj-chips', title: 'Chips' }, String(s.chips[p.id]))),
          el('div', { class: 'g-hand is-fan bj-cards' }, ...(seat?.cards || []).map((c, i) => draw(c, `${s.hand}:${p.id}${i}`, 'clamp(2.6rem, 2.2rem + 1.4cqw, 3.4rem)'))),
          el('footer', {},
            seat ? el('span', { class: 'bj-bet' }, `${seat.bet}${seat.doubled ? ' (doubled)' : ''}`) : null,
            seat ? el('b', { class: 'bj-total' }, totalText(t)) : null,
            tag));
        return tint(box, p.color);
      }));

      // Your controls.
      let controls = null;
      if (api.isPlayer() && !over) {
        if (s.phase === 'bet') {
          if (!(me in s.bets)) controls = el('p', { class: 'g-note' }, 'You’re out of chips, so you’re watching from the rail.');
          else if (s.bets[me] != null) controls = el('p', { class: 'g-note' }, `Your bet: ${s.bets[me]}. Waiting on the others.`);
          else {
            controls = el('div', { class: 'bj-betting' },
              el('p', { class: 'g-note' }, `You have ${chips} chips. Pick your bet.`),
              el('div', { class: 'bj-chip-row', role: 'group', 'aria-label': 'Bet' }, ...BETS.map((b) => el('button', {
                type: 'button', class: `bj-chip bj-chip-${b}`, disabled: b > chips, onclick: () => api.send({ bet: b }), 'aria-label': `Bet ${b}`,
              }, String(b)))));
          }
        } else if (s.phase === 'play') {
          if (myTurn) {
            const canDouble = mySeat.cards.length === 2 && chips >= mySeat.bet;
            controls = el('div', { class: 'g-actions bj-actions' },
              el('button', { type: 'button', class: 'btn btn-primary btn-big', onclick: () => api.send({ hit: true }) }, 'Hit'),
              el('button', { type: 'button', class: 'btn btn-big', onclick: () => api.send({ stand: true }) }, 'Stand'),
              el('button', { type: 'button', class: 'btn btn-quiet btn-big', disabled: !canDouble, onclick: () => api.send({ double: true }) }, 'Double'));
          } else if (mySeat && !mySeat.done) {
            controls = el('p', { class: 'g-note' }, 'Your turn is coming.');
          } else if (mySeat) {
            controls = el('p', { class: 'g-note' }, 'You’re done this hand. Waiting on the others.');
          }
        } else if (s.phase === 'done') {
          const ready = s.ready.includes(me);
          controls = el('div', { class: 'g-actions' },
            el('button', { type: 'button', class: 'btn btn-primary', disabled: ready, onclick: () => api.send({ next: true }) }, ready ? 'Waiting on the others' : 'Next hand'));
        }
      }

      seen = now;
      put(
        el('p', { class: 'g-note bj-head' }, over ? `Final chips after ${s.hands} hands` : `Hand ${s.hand} of ${s.hands}${s.shuffled && s.phase !== 'bet' ? '. Fresh shoe.' : ''}`),
        el('div', { class: 'bj-table' }, dealer, seats),
        controls,
      );

      if (over) return undefined;
      if (s.phase === 'bet') return me in s.bets && s.bets[me] == null ? { text: 'Place your bet', color: 'me' } : { text: 'Waiting for bets' };
      if (s.phase === 'done') return { text: 'Next hand soon' };
      if (myTurn) return { text: s.totals[me]?.t === 21 ? 'Stand on 21?' : 'Hit or stand', color: 'me' };
      return undefined;
    },
  };
}
