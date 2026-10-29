// Small builders for the shared game pieces styled in public/games.css, so every game's
// dice, cards, and keyboards look and behave the same.
import { el, colorOf } from '../ui.js';

// A die showing n (1 to 6). Pass onclick to make it a button (for holding dice).
export function die(n, { held = false, rolling = false, color = null, onclick = null, label = null } = {}) {
  const node = el(onclick ? 'button' : 'span', {
    class: `g-die${held ? ' is-held' : ''}${rolling ? ' is-rolling' : ''}`, 'data-n': String(n), type: onclick ? 'button' : null,
    'aria-label': label || `${n}${held ? ', held' : ''}`, 'aria-pressed': onclick ? String(held) : null, onclick, role: onclick ? null : 'img',
  }, ...Array.from({ length: 9 }, () => el('i')));
  if (color) node.style.setProperty('--c', colorOf(color));
  return node;
}

export const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_NAMES = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

// A playing card like { rank: 'Q', suit: 'H' }, or null for a face-down card.
// Ranks are 'A', '2' to '10', 'J', 'Q', 'K'. Pass onclick to make it a button.
export function card(c, { onclick = null, disabled = false, dim = false, width = null } = {}) {
  const down = !c;
  const node = el(onclick ? 'button' : 'span', {
    class: `g-card${down ? ' is-back' : ''}${c && (c.suit === 'H' || c.suit === 'D') ? ' is-red' : ''}${dim ? ' is-dim' : ''}`,
    type: onclick ? 'button' : null, onclick, disabled: onclick && disabled, role: onclick ? null : 'img',
    'aria-label': down ? 'Face-down card' : `${RANK_NAMES[c.rank] || c.rank} of ${SUIT_NAMES[c.suit]}`,
  }, el('span', { class: 'g-rank' }, down ? '' : c.rank), el('span', { class: 'g-suit' }, down ? '' : SUITS[c.suit]));
  if (width) node.style.setProperty('--w', width);
  return node;
}

// A QWERTY keyboard. states maps a letter to right, close, wrong, or used.
// extra adds wide keys to the last row, like [{ key: 'enter', label: 'Enter' }].
export function keyboard(onKey, { states = {}, disabled = false, extra = [] } = {}) {
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return el('div', { class: 'g-keys', role: 'group', 'aria-label': 'Keyboard' }, ...rows.map((r, i) => el('div', { class: 'g-keys-row' },
    ...(i === 2 ? extra.slice(0, 1) : []).map((k) => el('button', { type: 'button', class: 'g-key is-wide', disabled, onclick: () => onKey(k.key) }, k.label)),
    ...[...r].map((ch) => el('button', {
      type: 'button', class: 'g-key', 'data-state': states[ch] || null, disabled: disabled || states[ch] === 'used', onclick: () => onKey(ch),
    }, ch)),
    ...(i === 2 ? extra.slice(1) : []).map((k) => el('button', { type: 'button', class: 'g-key is-wide', disabled, onclick: () => onKey(k.key) }, k.label)))));
}

// One row per player with a score, the current turn outlined. scores maps id to a number or text.
export function scoreboard(players, scores, { turn = null, me = null } = {}) {
  return el('ol', { class: 'g-scoreboard' }, ...players.map((p) => {
    const li = el('li', { class: p.id === turn ? 'is-turn' : null },
      el('span', { class: 'dot' }),
      el('span', {}, p.id === me ? `${p.name} (you)` : p.name),
      el('b', {}, String(scores[p.id] ?? 0)));
    li.style.setProperty('--c', colorOf(p.color));
    return li;
  }));
}

// A typed-answer box. onSubmit gets the text; the box clears after sending.
export function answerBox(onSubmit, { placeholder = 'Type your answer', button = 'Guess', disabled = false, maxlength = 60 } = {}) {
  const input = el('input', { placeholder, maxlength: String(maxlength), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'send', disabled, 'aria-label': placeholder });
  const form = el('form', { class: 'g-answer' }, input, el('button', { class: 'btn btn-primary', disabled }, button));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    onSubmit(v);
  });
  form.input = input;
  return form;
}

// Sets --c on a node to a person's color, and returns the node.
export function tint(node, color) {
  node.style.setProperty('--c', colorOf(color));
  return node;
}
