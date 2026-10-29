// Crazy Eights: everyone else’s hand as a count, the draw pile and the top card in the
// middle, and your hand fanned along the bottom with the cards you can play lifted.
import { card, tint, SUITS } from './kit.js';

const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const toCard = (c) => ({ rank: c.slice(0, -1), suit: c.slice(-1) });
const label = (c) => `${c.slice(0, -1)}${SUITS[c.slice(-1)]}`;
// Your hand sorted by suit (alternating colors), then rank.
const sortHand = (hand) => [...hand].sort((a, b) => 'SHCD'.indexOf(a.slice(-1)) - 'SHCD'.indexOf(b.slice(-1)) || ORDER.indexOf(a.slice(0, -1)) - ORDER.indexOf(b.slice(0, -1)));

export default function mount(root, api) {
  const { el } = api;
  // Draws the game; skips the pieces that don’t apply right now.
  const put = (...kids) => root.replaceChildren(...kids.filter(Boolean));
  let eight = null; // the eight waiting for a suit
  let seen = new Set();
  let game = null;

  function draw() {
    const s = game.view;
    const over = !!game.result;
    const myTurn = s.turn === api.me && !over;
    if (!myTurn) eight = null;

    const others = el('ul', { class: 'c8-others', 'aria-label': 'Players' }, ...game.players.filter((p) => p.id !== api.me).map((p) => tint(el('li', { class: `${s.turn === p.id ? 'is-turn' : ''}${over && game.result.winners.includes(p.id) ? ' is-win' : ''}` },
      el('span', { class: 'c8-backs', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(s.counts[p.id], 5) }, () => el('i'))),
      el('span', { class: 'c8-who' }, p.name),
      el('b', { 'aria-label': `${s.counts[p.id]} cards` }, String(s.counts[p.id]))), p.color)));

    // canPass without having drawn means there’s nothing anywhere to draw.
    const canDraw = myTurn && !s.drew && !s.canPass;
    const pile = el('button', {
      type: 'button', class: 'c8-pile', disabled: !canDraw, onclick: () => api.send({ draw: true }), 'aria-label': `Draw a card. ${s.drawLeft} left.`,
    }, card(null), el('span', { class: 'c8-count' }, String(s.drawLeft)));
    const topNode = card(toCard(s.top), { width: 'clamp(4.6rem, 3.6rem + 4cqw, 6rem)' });
    if (seen.has(`top:${s.top}`)) topNode.classList.add('c8-still');
    const suitChanged = s.suit !== s.top.slice(-1);
    const middle = el('div', { class: 'c8-middle' },
      el('div', { class: 'c8-stack' }, pile, el('span', { class: 'c8-cap' }, 'Draw')),
      el('div', { class: 'c8-stack' }, topNode,
        el('span', { class: `c8-suit${suitChanged ? ' is-called' : ''}${s.suit === 'H' || s.suit === 'D' ? ' is-red' : ''}`, 'aria-label': `Play on ${SUIT_NAMES[s.suit]}` }, SUITS[s.suit], el('small', {}, suitChanged ? ` ${SUIT_NAMES[s.suit]}` : ''))));

    // What just happened.
    let note = '';
    const l = s.last;
    if (l) {
      const who = api.name(l.by);
      if (l.play) note = l.play.startsWith('8') ? `${who} played ${label(l.play)} and picked ${SUIT_NAMES[l.suit]}.` : `${who} played ${label(l.play)}.`;
      else if (l.drew) note = `${who} drew a card.`;
      else if (l.pass) note = `${who} passed.`;
    }

    // Your hand.
    let handRow = null;
    let actions = null;
    if (s.hand) {
      const playable = new Set(myTurn ? s.hand.filter((c, i) => s.playable[i]) : []);
      const sorted = sortHand(s.hand);
      handRow = el('div', { class: `g-hand c8-hand${myTurn ? ' is-turn' : ''}`, role: 'group', 'aria-label': 'Your hand' }, ...sorted.map((c) => {
        const ok = playable.has(c);
        const node = card(toCard(c), {
          onclick: myTurn ? () => {
            if (!ok) return;
            if (c.startsWith('8')) { eight = c; draw(); return; }
            api.send({ play: c });
          } : null,
          disabled: myTurn && !ok, dim: myTurn && !ok,
        });
        if (ok) node.classList.add('is-playable');
        if (c === s.drew) node.classList.add('is-drawn');
        if (c === eight) node.classList.add('is-chosen');
        if (seen.has(`h:${c}`)) node.classList.add('c8-still');
        return node;
      }));
      handRow.style.setProperty('--n', String(sorted.length));
      if (eight) {
        actions = el('div', { class: 'c8-pick' },
          el('p', { class: 'g-note' }, 'Your eight is wild. Pick the next suit.'),
          el('div', { class: 'c8-suits' }, ...['S', 'H', 'D', 'C'].map((su) => el('button', {
            type: 'button', class: `c8-suit-btn${su === 'H' || su === 'D' ? ' is-red' : ''}`, 'aria-label': SUIT_NAMES[su],
            onclick: () => { const c = eight; eight = null; api.send({ play: c, suit: su }); },
          }, SUITS[su]))),
          el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { eight = null; draw(); } }, 'Cancel'));
      } else if (myTurn && s.canPass) {
        actions = el('div', { class: 'g-actions' },
          el('p', { class: 'g-note' }, s.drew ? (playable.size ? 'You can play the card you drew, or pass.' : 'No luck. Pass to end your turn.') : 'Nothing left to draw.'),
          el('button', { type: 'button', class: 'btn', onclick: () => api.send({ pass: true }) }, 'Pass'));
      } else if (myTurn) {
        actions = el('p', { class: 'g-note' }, playable.size ? 'Play a lifted card, or draw.' : 'Nothing fits. Draw a card.');
      }
    }

    // At the end, everyone’s leftover cards.
    const leftovers = over && s.hands ? el('div', { class: 'c8-left' }, ...game.players.filter((p) => p.id !== api.me && s.hands[p.id].length).map((p) => tint(el('div', { class: 'c8-left-row' },
      el('span', { class: 'c8-who' }, api.name(p.id)),
      el('span', { class: 'c8-mini' }, ...sortHand(s.hands[p.id]).map((c) => el('span', { class: c.endsWith('H') || c.endsWith('D') ? 'is-red' : null }, label(c))))), p.color))) : null;

    seen = new Set([`top:${s.top}`, ...(s.hand || []).map((c) => `h:${c}`)]);
    put(
      others,
      middle,
      el('p', { class: 'g-note c8-log', 'aria-live': 'polite' }, note),
      handRow,
      actions,
      leftovers,
    );
    if (over) return undefined;
    if (myTurn) return { text: eight ? 'Pick a suit' : s.drew ? 'Play it or pass' : 'Your turn', color: 'me' };
    return undefined;
  }

  return {
    update(g) {
      game = g;
      return draw();
    },
  };
}
