// Yahtzee: the dice on top (tap to hold), a shared scorecard below with a column per
// player. On your turn, the boxes you can fill show what the dice are worth there.
import { die, tint } from './kit.js';

const ROWS = [
  ['ones', 'Ones'], ['twos', 'Twos'], ['threes', 'Threes'], ['fours', 'Fours'], ['fives', 'Fives'], ['sixes', 'Sixes'],
  ['$upperBonus', 'Bonus'],
  ['threeKind', '3 of a kind'], ['fourKind', '4 of a kind'], ['fullHouse', 'Full house'], ['smallStraight', 'Sm. straight'],
  ['largeStraight', 'Lg. straight'], ['yacht', 'Yahtzee'], ['chance', 'Chance'],
  ['$yachtBonus', 'Yahtzee bonus'], ['$total', 'Total'],
];
const HINTS = {
  ones: 'Count of ones', twos: 'Twos times 2', threes: 'Threes times 3', fours: 'Fours times 4', fives: 'Fives times 5', sixes: 'Sixes times 6',
  threeKind: 'Sum of all dice', fourKind: 'Sum of all dice', fullHouse: '25', smallStraight: '30', largeStraight: '40', yacht: '50', chance: 'Sum of all dice',
};

export default function mount(root, api) {
  const { el } = api;
  // Draws the game; skips the pieces that don’t apply right now.
  const put = (...kids) => root.replaceChildren(...kids.filter(Boolean));
  let seenRoll = null;

  return {
    update(game) {
      const s = game.view;
      const over = !!game.result;
      const myTurn = game.turn === api.me && !over;
      const roller = game.turn ? api.player(game.turn) : null;
      const rolled = seenRoll != null && s.rollNo !== seenRoll;
      seenRoll = s.rollNo;
      const canHold = myTurn && s.rolls > 0 && s.rolls < 3;
      const idle = !s.rolls;

      const dice = el('div', { class: `yc-dice${idle ? ' is-idle' : ''}`, role: 'group', 'aria-label': 'Dice' }, ...s.dice.map((n, i) => die(n, {
        held: !idle && s.held[i], rolling: rolled && !s.held[i], color: roller?.color,
        onclick: canHold ? () => api.send({ toggle: i }) : null,
        label: `${n}${!idle && s.held[i] ? ', held' : ''}`,
      })));
      if (canHold) dice.classList.add('is-holdable');

      const left = 3 - s.rolls;
      const controls = api.isPlayer() && !over ? el('div', { class: 'g-actions yc-controls' },
        el('button', { type: 'button', class: `btn btn-big${myTurn ? ' btn-primary' : ''}`, disabled: !myTurn || !left || s.held.every(Boolean) && s.rolls > 0, onclick: () => api.send({ roll: true }) },
          !myTurn ? 'Roll' : s.rolls === 0 ? 'Roll' : left ? `Roll again (${left} left)` : 'No rolls left')) : null;

      // The scorecard, a column per player.
      const ids = game.players.map((p) => p.id);
      const head = el('tr', {}, el('th', { scope: 'col', class: 'yc-box' }, el('span', { class: 'sr' }, 'Box')), ...game.players.map((p) => tint(el('th', {
        scope: 'col', class: p.id === game.turn && !over ? 'is-turn' : null, title: p.name,
      }, el('span', { class: 'dot' }), el('span', { class: 'yc-name' }, p.id === api.me ? 'You' : p.name)), p.color)));
      const rows = ROWS.map(([key, label]) => {
        const sum = key.startsWith('$');
        const tr = el('tr', { class: sum ? `yc-sum yc-${key.slice(1)}` : null },
          el('th', { scope: 'row', class: 'yc-box', title: HINTS[key] || null }, label));
        for (const id of ids) {
          const t = s.totals[id];
          let cell;
          if (key === '$upperBonus') cell = el('td', {}, t.upperBonus ? '35' : el('span', { class: 'yc-to' }, `${t.upper}/63`));
          else if (key === '$yachtBonus') cell = el('td', {}, t.yachtBonus ? String(t.yachtBonus) : '');
          else if (key === '$total') cell = el('td', {}, String(t.total));
          else {
            const v = s.cards[id][key];
            const fresh = s.last && s.last.by === id && s.last.box === key;
            if (v != null) cell = el('td', { class: fresh ? 'is-fresh' : null }, String(v));
            else if (id === game.turn && s.can && key in s.can && myTurn) {
              cell = el('td', {}, el('button', {
                type: 'button', class: `yc-pick${s.can[key] ? '' : ' is-zero'}`, onclick: () => api.send({ score: key }),
                'aria-label': `Score ${s.can[key]} in ${label}`,
              }, String(s.can[key])));
            } else if (id === game.turn && s.can && key in s.can) {
              cell = el('td', { class: 'yc-could' }, String(s.can[key]));
            } else cell = el('td', { class: 'yc-open' });
          }
          if (id === game.turn && !over) cell.classList.add('is-turn');
          tr.append(tint(cell, api.player(id)?.color));
        }
        return tr;
      });
      const table = el('div', { class: 'yc-card-wrap' }, el('table', { class: 'yc-card' }, el('thead', {}, head), el('tbody', {}, ...rows)));

      const turnNo = game.turn ? Object.values(s.cards[game.turn]).filter((v) => v != null).length + 1 : null;
      let note = '';
      if (s.last && (!s.rolls || !myTurn)) {
        const row = ROWS.find(([k]) => k === s.last.box);
        note = `${api.name(s.last.by)} scored ${s.last.points} in ${row[1]}${s.last.bonus ? ', plus a 100 Yahtzee bonus' : ''}.`;
      }
      put(
        el('div', { class: 'yc-top' },
          el('p', { class: 'g-note' }, over ? 'Final scores' : `Turn ${turnNo} of 13`),
          dice,
          canHold ? el('p', { class: 'g-note yc-hint' }, 'Tap dice to hold them, then roll again or pick a box.') : null,
          controls,
          note ? el('p', { class: 'g-note yc-log', 'aria-live': 'polite' }, note) : null),
        table,
      );
      if (over) return undefined;
      if (myTurn) return { text: s.rolls === 0 ? 'Roll the dice' : left ? 'Roll again or score' : 'Pick a box to score', color: 'me' };
      return undefined;
    },
  };
}
