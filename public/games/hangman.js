// Hangman: the drawing, the word so far, a keyboard for letters, and a box to guess it all.
// Whoever chooses the word also gives its topic, which guessers see above the word.
import { keyboard, answerBox } from './kit.js';

// One tap fills the topic; anything typed works too.
const TOPICS = ['Movies and TV', 'Animals', 'Food', 'Places', 'Famous people', 'Things', 'Inside joke'];

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

  // The word and its topic, kept between updates so typing isn't interrupted.
  function chooser() {
    const word = el('input', { class: 'hm-input', placeholder: 'Your secret word or phrase', maxlength: '40', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your secret word or phrase' });
    const topic = el('input', { class: 'hm-input', placeholder: 'Topic, like “90s movie” (optional)', maxlength: '30', autocomplete: 'off', 'aria-label': 'Topic' });
    const chips = el('div', { class: 'hm-topics', role: 'group', 'aria-label': 'Pick a topic' }, ...TOPICS.map((t) => el('button', {
      type: 'button', class: 'chip', 'aria-pressed': 'false',
      onclick: () => { topic.value = t; mark(); },
    }, t)));
    const mark = () => { for (const c of chips.children) c.setAttribute('aria-pressed', String(c.textContent === topic.value.trim())); };
    topic.addEventListener('input', mark);
    const form = el('form', { class: 'hm-choose' },
      el('label', { class: 'hm-field' }, el('span', {}, 'Word'), word),
      el('label', { class: 'hm-field' }, el('span', {}, 'Topic'), topic),
      chips,
      el('button', { class: 'btn btn-primary' }, 'Use it'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!word.value.trim()) return word.focus();
      api.send({ word: word.value, topic: topic.value });
    });
    form.word = word;
    return form;
  }

  return {
    update(game) {
      const s = game.view;
      const setter = s.setter ? api.player(s.setter) : null;
      if (s.phase === 'choose') {
        if (s.setter === api.me) {
          const first = !chooseBox;
          chooseBox ||= chooser();
          root.replaceChildren(
            el('p', { class: 'g-big' }, 'Pick a word'),
            el('p', { class: 'g-note' }, 'Only you see the word. Letters, spaces, apostrophes, and hyphens. Everyone sees the topic, as a clue.'),
            chooseBox);
          if (first) chooseBox.word.focus();
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
      root.replaceChildren(...[
        el('div', { class: 'hm-top' },
          drawing(s.wrong, over && !game.result.winners?.length),
          el('div', { class: 'hm-side' },
            el('p', { class: 'hm-left' }, el('b', {}, String(MAX_WRONG - s.wrong)), ` ${MAX_WRONG - s.wrong === 1 ? 'miss' : 'misses'} left`),
            s.misses.length ? el('p', { class: 'hm-misses', 'aria-label': 'Wrong letters' }, ...s.misses.map((l) => el('span', {}, l.toUpperCase()))) : null,
            setter ? el('p', { class: 'g-note' }, `${setter.id === api.me ? 'You' : setter.name} picked this one.`) : null,
            el('p', { class: 'g-note hm-log', 'aria-live': 'polite' }, lastLine))),
        s.topic ? el('p', { class: 'hm-topic' }, el('span', {}, 'Topic'), s.topic) : null,
        el('div', { class: 'hm-word', 'aria-label': 'The word so far' }, ...words.map((w) => el('span', { class: 'hm-w' }, ...w))),
        canGuess ? keyboard((l) => api.send({ letter: l }), { states, disabled: !canGuess }) : null,
        canGuess ? answerBox((word) => api.send({ word }), { placeholder: 'Know it? Guess the whole thing', button: 'Guess', maxlength: 40 }) : null,
      ].filter(Boolean));
      if (over) return undefined;
      if (s.setter === api.me) return { text: 'They’re guessing your word' };
      return canGuess ? { text: 'Guess a letter', color: 'me' } : { text: 'Guessing together' };
    },
  };
}
