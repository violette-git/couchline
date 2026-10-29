// Hangman: the drawing, the word so far, a keyboard for letters, and a box to guess it all.
import { keyboard, answerBox } from './kit.js';

const MAX_WRONG = 6;
// The figure, one part per wrong guess.
const PARTS = [
  '<circle cx="140" cy="62" r="17"/>',
  '<path d="M140 79v52"/>',
  '<path d="M140 92l-22 20"/>',
  '<path d="M140 92l22 20"/>',
  '<path d="M140 131l-18 30"/>',
  '<path d="M140 131l18 30"/>',
];

function drawing(wrong, lost) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 200 190');
  s.setAttribute('class', `hm-drawing${lost ? ' is-lost' : ''}`);
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', `${wrong} of ${MAX_WRONG} wrong guesses`);
  s.innerHTML = `<path class="hm-gallows" d="M30 180h110M60 180V18h80v27"/>${PARTS.slice(0, wrong).map((p, i) => `<g class="hm-part${i === wrong - 1 ? ' is-new' : ''}">${p}</g>`).join('')}`;
  return s;
}

export default function mount(root, api) {
  const { el } = api;
  let chooseBox = null;

  return {
    update(game) {
      const s = game.view;
      const setter = s.setter ? api.player(s.setter) : null;
      if (s.phase === 'choose') {
        if (s.setter === api.me) {
          chooseBox ||= answerBox((word) => api.send({ word }), { placeholder: 'Your secret word or phrase', button: 'Use it', maxlength: 40 });
          root.replaceChildren(
            el('p', { class: 'g-big' }, 'Pick a word'),
            el('p', { class: 'g-note' }, 'Only you see it. Letters, spaces, apostrophes, and hyphens.'),
            chooseBox);
          chooseBox.input.focus();
          return { text: 'Choose the word', color: 'me' };
        }
        root.replaceChildren(el('p', { class: 'g-big hm-wait' }, `${setter?.name || 'Someone'} is picking a word`));
        return { text: `${setter?.name || 'Someone'} is choosing`, color: setter?.color };
      }
      chooseBox = null;
      const over = !!game.result;
      const canGuess = api.isPlayer() && !over && s.setter !== api.me;
      const states = {};
      for (const l of s.guessed) states[l] = s.misses.includes(l) ? 'wrong' : 'right';
      // The word: one tile per letter, words kept together so they wrap as words.
      const words = [];
      let cur = [];
      s.mask.forEach((ch, i) => {
        if (ch === ' ') { words.push(cur); cur = []; return; }
        const open = ch != null;
        const missed = over && open && /[a-z]/i.test(ch) && !s.guessed.includes(ch.toLowerCase());
        cur.push(el('span', { class: `hm-slot${open ? ' is-open' : ''}${missed ? ' is-missed' : ''}${/[a-z]/i.test(ch || 'a') ? '' : ' is-mark'}`, 'data-i': String(i) }, open ? ch.toUpperCase() : ''));
      });
      words.push(cur);
      const last = s.log.at(-1);
      const lastLine = last ? `${api.name(last.by)} ${last.letter ? `tried ${last.letter.toUpperCase()}` : `guessed “${last.word}”`}: ${last.right ? 'yes!' : 'no.'}` : '';
      root.replaceChildren(
        el('div', { class: 'hm-top' },
          drawing(s.wrong, over && !game.result.winners?.length),
          el('div', { class: 'hm-side' },
            el('p', { class: 'hm-left' }, el('b', {}, String(MAX_WRONG - s.wrong)), ` ${MAX_WRONG - s.wrong === 1 ? 'miss' : 'misses'} left`),
            s.misses.length ? el('p', { class: 'hm-misses', 'aria-label': 'Wrong letters' }, ...s.misses.map((l) => el('span', {}, l.toUpperCase()))) : null,
            setter ? el('p', { class: 'g-note' }, `${setter.id === api.me ? 'You' : setter.name} picked this one.`) : null,
            el('p', { class: 'g-note hm-log', 'aria-live': 'polite' }, lastLine))),
        el('div', { class: 'hm-word', 'aria-label': 'The word so far' }, ...words.map((w) => el('span', { class: 'hm-w' }, ...w))),
        canGuess ? keyboard((l) => api.send({ letter: l }), { states, disabled: !canGuess }) : null,
        canGuess ? answerBox((word) => api.send({ word }), { placeholder: 'Know it? Guess the whole thing', button: 'Guess', maxlength: 40 }) : null,
      );
      if (over) return undefined;
      if (s.setter === api.me) return { text: 'They’re guessing your word' };
      return canGuess ? { text: 'Guess a letter', color: 'me' } : { text: 'Guessing together' };
    },
  };
}
