// Would You Rather: two big sides to pick from. Picks stay hidden until the reveal, then each
// side shows who chose it, in their colors, and how the room split.
import { scoreboard, tint } from './kit.js';

export default function mount(root, api) {
  const { el } = api;
  let lastKey = '';

  return {
    update(game) {
      const s = game.view;
      const reveal = s.phase === 'reveal';
      const mine = s.picks[api.me];
      const canPick = api.isPlayer() && !game.result && !reveal && !mine;
      const key = `${game.round}:${s.n}`;
      const fresh = key !== lastKey;
      lastKey = key;
      const by = (side) => game.players.filter((p) => s.picks[p.id] === side);
      const a = by('a').length, b = by('b').length, total = a + b;
      const win = a === b ? null : a > b ? 'a' : 'b';

      const side = (id, label) => {
        const people = by(id);
        const pct = total ? Math.round((people.length / total) * 100) : 0;
        const cls = ['wy-side', `is-${id}`];
        if (mine === id) cls.push('is-picked');
        if (reveal) cls.push(!total ? 'is-even' : win === id ? 'is-win' : win ? 'is-lose' : 'is-even');
        if (fresh) cls.push('is-new');
        const node = el('button', { type: 'button', class: cls.join(' '), disabled: !canPick, 'aria-pressed': mine === id ? 'true' : null, onclick: () => api.send({ pick: id }) },
          el('span', { class: 'wy-letter' }, id.toUpperCase()),
          el('span', { class: 'wy-text' }, label),
          reveal ? el('span', { class: 'wy-result' },
            el('b', { class: 'wy-pct' }, `${pct}%`),
            el('span', { class: 'wy-people' }, ...people.map((p) => tint(el('span', { class: 'wy-person' }, el('span', { class: 'dot' }), p.id === api.me ? 'You' : p.name), p.color))))
            : mine === id ? el('span', { class: 'wy-mine' }, 'Your pick') : null);
        if (reveal) node.style.setProperty('--pct', `${pct}%`);
        return node;
      };

      let line;
      if (reveal) {
        const got = s.gained[api.me];
        const split = !total ? 'Nobody picked.' : !win ? 'A perfect split. Everyone scores.' : `${win === 'a' ? a : b} to ${win === 'a' ? b : a}.`;
        line = el('p', { class: `wy-line${got ? ' is-got' : ''}` }, split, api.isPlayer() && mine ? el('b', {}, got ? ' +1 for you' : ' You’re in the minority this time.') : null);
      } else {
        const done = game.players.filter((p) => s.picks[p.id]);
        line = el('p', { class: 'wy-line' }, `${done.length} of ${game.players.length} picked`,
          el('span', { class: 'g-who' }, ...done.map((p) => tint(el('span', { class: 'dot', title: p.name }), p.color))));
      }

      const order = [...game.players].sort((x, y) => (s.scores[y.id] || 0) - (s.scores[x.id] || 0));
      root.replaceChildren(el('div', { class: 'wy-wrap' },
        el('p', { class: 'wy-head' }, `${s.n} of ${s.total}`),
        el('h3', { class: 'wy-ask' }, 'Would you rather'),
        el('div', { class: 'wy-sides' }, side('a', s.prompt[0]), el('span', { class: 'wy-or', 'aria-hidden': 'true' }, 'or'), side('b', s.prompt[1])),
        line,
        el('div', { class: 'wy-scores' }, scoreboard(order, s.scores, { me: api.me }))));

      if (game.result) return undefined;
      if (reveal) return { text: s.n < s.total ? 'Next one coming up' : 'That was the last one' };
      if (!api.isPlayer()) return { text: 'Watching' };
      if (!mine) return { text: 'Pick a side', color: 'me' };
      const left = game.players.filter((p) => !s.picks[p.id]).length;
      return { text: left ? `Waiting on ${left} more` : 'Revealing' };
    },
  };
}
