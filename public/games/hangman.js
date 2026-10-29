// Hangman: the drawing, the word so far, a keyboard for letters, and a box to guess it all.
// Whoever chooses the word also gives its topic, which guessers see above the word, and can
// leave a hint that stays hidden until someone opens it.
import { keyboard, answerBox } from './kit.js';

// One tap fills the topic; anything typed works too.
const TOPICS = ['Movies and TV', 'Animals', 'Food', 'Places', 'Famous people', 'Things', 'Inside joke'];

// The figure, one part per wrong guess: head, body, arms, legs, then eyes and a frown.
const PARTS = [
  '<circle cx="140" cy="62" r="17"/>',
  '<path d="M140 79v52"/>',
  '<path d="M140 92l-22 20"/>',
  '<path d="M140 92l22 20"/>',
  '<path d="M140 131l-18 30"/>',
  '<path d="M140 131l18 30"/>',
  '<path class="hm-face" d="M133 57l4 4M137 57l-4 4M143 57l4 4M147 57l-4 4"/>',
  '<path class="hm-face" d="M133 71q7-6 14 0"/>',
];

function drawing(wrong, max, lost) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 200 190');
  s.setAttribute('class', `hm-drawing${lost ? ' is-lost' : ''}`);
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', `${wrong} of ${max} wrong guesses`);
  s.innerHTML = `<path class="hm-gallows" d="M30 180h110M60 180V18h80v27"/>${PARTS.slice(0, wrong).map((p, i) => `<g class="hm-part${i === wrong - 1 ? ' is-new' : ''}">${p}</g>`).join('')}`;
  return s;
}

export default function mount(root, api) {
  const { el } = api;
  let chooseBox = null;
  let seen = null; // letters already found at the last update, so only new ones pop

  // The word and its topic, kept between updates so typing isn't interrupted.
  function chooser() {
    const word = el('input', { class: 'hm-input', placeholder: 'Your secret word or phrase', maxlength: '40', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your secret word or phrase' });
    const topic = el('input', { class: 'hm-input', placeholder: 'Topic, like “90s movie” (optional)', autocomplete: 'off', 'aria-label': 'Topic' });
    const hint = el('input', { class: 'hm-input', placeholder: 'A hint for when they’re stuck (optional)', autocomplete: 'off', 'aria-label': 'Hint' });
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
      el('label', { class: 'hm-field' }, el('span', {}, 'Hint'), hint),
      el('button', { class: 'btn btn-primary' }, 'Use it'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!word.value.trim()) return word.focus();
      api.send({ word: word.value, topic: topic.value, hint: hint.value });
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
            el('p', { class: 'g-note' }, 'Only you see the word. Letters, spaces, apostrophes, and hyphens. Everyone sees the topic. The hint stays hidden until someone opens it.'),
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
      // The word: one tile per letter, words kept together so they wrap as words. The chooser
      // sees every letter: the ones found so far in the color of whoever found them, the rest dim.
      const isChooser = s.setter === api.me && !over;
      const found = s.found || {};
      const fresh = (l) => seen && found[l] && !seen.has(l);
      const words = [];
      let cur = [];
      s.mask.forEach((ch, i) => {
        if (ch === ' ') { words.push(cur); cur = []; return; }
        const open = ch != null;
        const letter = /[a-z]/i.test(ch || '') ? ch.toLowerCase() : null;
        const missed = over && letter && !s.guessed.includes(letter);
        const by = letter && found[letter] ? api.player(found[letter]) : null;
        const slot = el('span', {
          class: `hm-slot${open ? ' is-open' : ''}${missed ? ' is-missed' : ''}${letter || !open ? '' : ' is-mark'}${isChooser && letter ? (by ? ' is-found' : ' is-waiting') : ''}${fresh(letter) ? ' is-new' : ''}`,
          'data-i': String(i), title: isChooser && by ? `Found by ${api.name(by.id)}` : null,
        }, open ? ch.toUpperCase() : '');
        if (isChooser && by) slot.style.setProperty('--c', api.colorOf(by.color));
        cur.push(slot);
      });
      words.push(cur);
      seen = new Set(Object.keys(found));
      const last = s.log.at(-1);
      let lastLine = '';
      if (last?.hint) lastLine = `${api.name(last.by)} opened the hint.`;
      else if (last) lastLine = `${api.name(last.by)} ${last.letter ? `tried ${last.letter.toUpperCase()}` : `guessed “${last.word}”`}: ${last.right ? 'yes!' : 'no.'}`;
      const left = s.max - s.wrong;
      root.replaceChildren(...[
        el('div', { class: 'hm-top' },
          drawing(s.wrong, s.max, over && !game.result.winners?.length),
          el('div', { class: 'hm-side' },
            el('p', { class: 'hm-left' }, el('b', {}, String(left)), ` ${left === 1 ? 'miss' : 'misses'} left`),
            s.misses.length ? el('p', { class: 'hm-misses', 'aria-label': 'Wrong letters' }, ...s.misses.map((l) => el('span', {}, l.toUpperCase()))) : null,
            setter ? el('p', { class: 'g-note' }, `${setter.id === api.me ? 'You' : setter.name} picked this one.`) : null,
            el('p', { class: 'g-note hm-log', 'aria-live': 'polite' }, lastLine))),
        s.topic ? el('p', { class: 'hm-topic' }, el('span', {}, 'Topic'), s.topic) : null,
        s.hint ? el('p', { class: 'hm-topic hm-hint' }, el('span', {}, s.hintShown ? 'Hint' : 'Your hint'), s.hint) : null,
        canGuess && s.hintReady ? el('button', { type: 'button', class: 'btn btn-quiet btn-small hm-hint-btn', onclick: () => api.send({ hint: true }) },
          s.setter ? 'Show the hint' : 'Hint: show a letter') : null,
        el('div', { class: 'hm-word', 'aria-label': 'The word so far' }, ...words.map((w) => el('span', { class: 'hm-w' }, ...w))),
        isChooser ? el('p', { class: 'g-note' }, 'Found letters are in the color of whoever found them. Dim ones are still hidden from everyone.') : null,
        canGuess ? keyboard((l) => api.send({ letter: l }), { states, disabled: !canGuess }) : null,
        canGuess ? answerBox((word) => api.send({ word }), { placeholder: 'Know it? Guess the whole thing', button: 'Guess', maxlength: 40 }) : null,
      ].filter(Boolean));
      if (over) return undefined;
      if (s.setter === api.me) return { text: 'They’re guessing your word' };
      return canGuess ? { text: 'Guess a letter', color: 'me' } : { text: 'Guessing together' };
    },
  };
}
