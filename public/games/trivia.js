// Trivia: the question, four big answers, and a running scoreboard. Picks stay hidden until
// the reveal, then everyone's dots show on the answers they chose.
import { scoreboard, tint } from './kit.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const ASK_MS = 20000;

export default function mount(root, api) {
  const { el } = api;
  let lastKey = '';

  return {
    update(game) {
      const s = game.view;
      const q = s.question;
      const reveal = s.phase === 'reveal';
      const mine = s.answers[api.me];
      const answered = mine !== undefined;
      const canAnswer = api.isPlayer() && !game.result && !reveal && !answered;
      const key = `${game.round}:${s.n}:${s.phase}`;
      const fresh = key !== lastKey && s.phase === 'ask';
      lastKey = key;
      const pickers = (i) => game.players.filter((p) => s.answers[p.id] === i);

      const choices = el('div', { class: 'g-choices tv-choices' }, ...q.choices.map((c, i) => {
        const right = reveal && i === s.answer;
        const cls = ['g-choice', 'tv-choice'];
        if (mine === i) cls.push('is-picked');
        if (reveal) cls.push(right ? 'is-right' : 'is-wrong');
        return el('button', {
          type: 'button', class: cls.join(' '), disabled: !canAnswer, 'aria-pressed': mine === i ? 'true' : null,
          onclick: () => api.send({ choice: i }),
        },
        el('span', { class: 'tv-key' }, LETTERS[i]),
        el('span', { class: 'tv-text' }, c),
        reveal ? el('span', { class: 'tv-pickers' }, ...pickers(i).map((p) => tint(el('span', { class: 'tv-picker' }, el('span', { class: 'dot' }), p.id === api.me ? 'You' : p.name), p.color))) : null);
      }));

      // A bar that drains over the 20 seconds, started from where the shared clock says we are.
      let clock = null;
      if (!reveal && !game.result && game.deadline) {
        const left = Math.max(0, game.deadline - api.now());
        clock = el('div', { class: 'tv-clock', 'aria-hidden': 'true' }, el('i'));
        clock.firstChild.style.animationDelay = `${-(ASK_MS - left) / 1000}s`;
      }

      const inCount = Object.keys(s.answers).filter((id) => game.players.some((p) => p.id === id)).length;
      let line;
      if (reveal) {
        const got = s.gained[api.me];
        line = !api.isPlayer() ? el('p', { class: 'tv-line' }, `The answer: ${q.choices[s.answer]}`)
          : !answered ? el('p', { class: 'tv-line' }, 'Time ran out.')
            : got ? el('p', { class: 'tv-line is-right' }, 'Right! ', el('b', {}, `+${got}`))
              : el('p', { class: 'tv-line is-wrong' }, 'Not this time.');
      } else {
        line = el('p', { class: 'tv-line' }, `${inCount} of ${game.players.length} answered`,
          el('span', { class: 'g-who tv-in' }, ...game.players.filter((p) => s.answers[p.id] !== undefined).map((p) => tint(el('span', { class: 'dot', title: p.name }), p.color))));
      }

      const order = [...game.players].sort((a, b) => (s.scores[b.id] || 0) - (s.scores[a.id] || 0));
      root.replaceChildren(el('div', { class: 'tv-wrap' },
        el('div', { class: 'tv-head' },
          el('span', { class: 'tv-n' }, `Question ${s.n} of ${s.total}`),
          el('span', { class: 'tv-cat' }, q.cat)),
        el('p', { class: `tv-q${fresh ? ' is-new' : ''}` }, q.q),
        clock,
        choices,
        line,
        el('div', { class: 'tv-scores' }, scoreboard(order, s.scores, { me: api.me }))));

      if (game.result) return undefined;
      if (reveal) return { text: s.n < s.total ? 'Next question coming up' : 'That was the last one' };
      if (!api.isPlayer()) return { text: 'Watching' };
      if (!answered) return { text: 'Pick an answer', color: 'me' };
      const waiting = game.players.length - inCount;
      return { text: waiting ? `Waiting on ${waiting === 1 ? '1 more' : `${waiting} more`}` : 'Revealing' };
    },
  };
}
