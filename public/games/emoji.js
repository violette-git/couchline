// Emoji Movies: the emoji clue, a box to type the title, who has it so far, and the scores.
import { answerBox, scoreboard, tint } from './kit.js';

export default function mount(root, api) {
  const { el } = api;
  let game = null;
  let shown = '';
  let gotSeen = 0;

  const head = el('p', { class: 'em-head' });
  const clue = el('p', { class: 'em-clue', role: 'img' });
  const hintEl = el('div', { class: 'em-hint', 'aria-live': 'polite' });
  const titleEl = el('p', { class: 'em-title', 'aria-live': 'polite' });
  const box = answerBox((answer) => {
    if (game?.view.phase !== 'guess') return;
    api.send({ answer });
  }, { placeholder: 'Name the movie', button: 'Guess', maxlength: 60 });
  const wrong = el('p', { class: 'em-wrong', 'aria-label': 'Your wrong guesses' });
  const got = el('ul', { class: 'em-got', 'aria-label': 'Who has it' });
  const scores = el('div', { class: 'em-scores' });
  root.append(el('div', { class: 'em-wrap' }, head, clue, hintEl, titleEl, box, wrong, got, scores));

  return {
    update(g) {
      game = g;
      const s = g.view;
      const mine = s.got.includes(api.me);
      const playing = api.isPlayer() && !g.result;
      head.textContent = `Movie ${s.n} of ${s.total}`;
      const key = `${g.round}:${s.n}`;
      if (key !== shown) {
        shown = key;
        gotSeen = 0;
        clue.setAttribute('aria-label', s.emoji.join(' '));
        clue.replaceChildren(...s.emoji.map((e, i) => { const n = el('span', {}, e); n.style.setProperty('--i', String(i)); return n; }));
      }
      hintEl.replaceChildren(...(s.hint || []).map((w) => el('span', { class: 'em-word' },
        el('b', {}, w.first.toUpperCase()), ...Array.from({ length: Math.max(0, w.len - 1) }, () => el('i')))));
      hintEl.hidden = !s.hint;
      if (s.title) {
        titleEl.hidden = false;
        titleEl.className = `em-title${s.phase === 'reveal' ? ' is-reveal' : ''}`;
        titleEl.replaceChildren(...[mine ? el('span', { class: 'em-you' }, `You got it. +${s.gained[api.me]}`) : null, el('span', {}, s.title)].filter(Boolean));
      } else titleEl.hidden = true;
      box.hidden = !playing || mine || s.phase !== 'guess';
      wrong.replaceChildren(...(box.hidden ? [] : s.wrong.map((w) => el('span', {}, w))));
      got.replaceChildren(...s.got.map((id, i) => {
        const p = api.player(id);
        return tint(el('li', { class: i >= gotSeen ? 'is-new' : null }, el('span', { class: 'dot' }), `${api.name(id)} +${s.gained[id]}`), p?.color);
      }));
      gotSeen = s.got.length;
      if (s.phase === 'reveal' && !s.got.length) got.replaceChildren(el('li', { class: 'is-none' }, 'Nobody got this one'));
      scores.replaceChildren(scoreboard([...g.players].sort((a, b) => (s.scores[b.id] || 0) - (s.scores[a.id] || 0)), s.scores, { me: api.me }));
      if (g.result) return undefined;
      if (s.phase === 'reveal') return { text: s.n < s.total ? 'Next movie coming up' : 'That was the last one' };
      if (!playing) return { text: 'Watching' };
      if (mine) return { text: 'You got it. Waiting on the others' };
      return { text: s.hint ? 'Here’s a hint' : 'Name that movie', color: 'me' };
    },
  };
}
