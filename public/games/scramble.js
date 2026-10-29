// Word Scramble: the mixed up letters, a box to type the word, and the scores. Shuffle mixes
// the letters again on this screen only, which can help you see the word.
import { answerBox, scoreboard } from './kit.js';

export default function mount(root, api) {
  const { el } = api;
  let game = null;
  let roundKey = '';
  let letters = [];

  const head = el('p', { class: 'sc-head' });
  const tiles = el('div', { class: 'sc-tiles', 'aria-live': 'polite' });
  const line = el('p', { class: 'sc-line' });
  const shuffleBtn = el('button', { type: 'button', class: 'btn btn-quiet btn-small sc-shuffle', onclick: () => mix() }, 'Shuffle');
  const box = answerBox((answer) => {
    if (game?.view.phase !== 'guess') return;
    api.send({ answer });
  }, { placeholder: 'Type the word', button: 'Guess', maxlength: 30 });
  const wrong = el('p', { class: 'sc-wrong', 'aria-label': 'Your wrong guesses' });
  const scores = el('div', { class: 'sc-scores' });
  const play = el('div', { class: 'sc-play' }, el('div', { class: 'g-row' }, box, shuffleBtn), wrong);
  root.append(el('div', { class: 'sc-wrap' }, head, tiles, line, play, scores));

  function drawTiles(word, state, pop) {
    tiles.replaceChildren(...[...word].map((ch, i) => {
      const t = el('span', { class: `g-letter sc-tile${pop ? ' is-pop' : ''}`, 'data-state': state }, ch);
      t.style.setProperty('--i', String(i));
      return t;
    }));
  }

  function mix() {
    if (game?.view.phase !== 'guess') return;
    const a = [...letters];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    letters = a;
    drawTiles(letters.join(''), null, true);
    box.input.focus();
  }

  return {
    update(g) {
      game = g;
      const s = g.view;
      const key = `${s.round}:${s.scrambled}`;
      const playing = api.isPlayer() && !g.result;
      head.textContent = `Word ${Math.min(s.round + 1, s.total)} of ${s.total}`;
      if (s.phase === 'guess') {
        if (key !== roundKey) { roundKey = key; letters = [...s.scrambled]; drawTiles(s.scrambled, null, true); }
        line.textContent = `${s.length} letters`;
        line.className = 'sc-line';
      } else {
        roundKey = '';
        drawTiles(s.reveal || '', s.winner ? 'right' : 'wrong', false);
        const who = s.winner ? api.player(s.winner) : null;
        line.textContent = who ? `${s.winner === api.me ? 'You got it!' : `${who.name} got it.`}` : 'Nobody got it.';
        line.className = `sc-line${who ? ' is-win' : ''}`;
        line.style.setProperty('--c', who ? api.colorOf(who.color) : 'var(--muted)');
      }
      play.hidden = !playing;
      shuffleBtn.disabled = s.phase !== 'guess';
      wrong.replaceChildren(...s.wrong.map((w) => el('span', {}, w)));
      scores.replaceChildren(scoreboard([...g.players].sort((a, b) => (s.scores[b.id] || 0) - (s.scores[a.id] || 0)), s.scores, { me: api.me }));
      if (g.result) return undefined;
      if (s.phase === 'reveal') return { text: s.round + 1 < s.total ? 'Next word coming up' : 'That’s the last one' };
      return playing ? { text: 'Unscramble it', color: 'me' } : { text: 'Watching' };
    },
  };
}
