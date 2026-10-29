// Dots and Boxes: an SVG board. Every line owns the diamond between its two dots and the
// centers of the boxes beside it, so the tap areas cover the whole board with no gaps.
import { scoreboard } from './kit.js';

const U = 100; // one box
const P = 30; // margin around the dots

export default function mount(root, api) {
  const { el } = api;
  let shownLines = [];
  let shownBoxes = [];

  function send(line) {
    api.send({ line });
  }

  function board(game) {
    const s = game.view;
    const n = s.size;
    const W = n * U + 2 * P;
    const myTurn = game.turn === api.me && !game.result;
    const down = n * (n + 1);
    const at = (r, c) => [P + c * U, P + r * U];
    const color = (id) => api.colorOf(api.player(id)?.color);
    const parts = [];
    // Claimed boxes, under everything else.
    s.boxes.forEach((owner, k) => {
      if (!owner) return;
      const r = Math.floor(k / n), c = k % n;
      const [x, y] = at(r, c);
      const fresh = shownBoxes[k] !== owner;
      const initial = (api.player(owner)?.name || '?').trim().charAt(0).toUpperCase();
      parts.push(`<g class="dx-box${fresh ? ' is-new' : ''}" style="--c:${color(owner)}"><rect x="${x + 7}" y="${y + 7}" width="${U - 14}" height="${U - 14}" rx="8"/><text x="${x + U / 2}" y="${y + U / 2}">${initial}</text></g>`);
    });
    // Lines, each with its diamond of tap area.
    for (let l = 0; l < s.lines.length; l++) {
      let x1, y1, x2, y2, hit, label;
      if (l < down) {
        const r = Math.floor(l / n), c = l % n;
        [x1, y1] = at(r, c); [x2, y2] = at(r, c + 1);
        hit = `${x1},${y1} ${x1 + U / 2},${y1 - U / 2} ${x2},${y2} ${x1 + U / 2},${y1 + U / 2}`;
        label = `Across, row ${r + 1}, between dots ${c + 1} and ${c + 2}`;
      } else {
        const k = l - down, r = Math.floor(k / (n + 1)), c = k % (n + 1);
        [x1, y1] = at(r, c); [x2, y2] = at(r + 1, c);
        hit = `${x1},${y1} ${x1 + U / 2},${y1 + U / 2} ${x2},${y2} ${x1 - U / 2},${y1 + U / 2}`;
        label = `Down, column ${c + 1}, between dots ${r + 1} and ${r + 2}`;
      }
      const owner = s.lines[l];
      const cls = `dx-edge${owner ? ' is-drawn' : ''}${s.last === l ? ' is-last' : ''}${owner && shownLines[l] !== owner ? ' is-new' : ''}`;
      const live = !owner && myTurn;
      parts.push(`<g class="${cls}" data-l="${l}"${owner ? ` style="--c:${color(owner)}"` : ''}${live ? ` role="button" tabindex="0" aria-label="${label}"` : ''}>`
        + `${live ? `<polygon class="dx-hit" points="${hit}"/>` : ''}<line class="dx-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></g>`);
    }
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
      const [x, y] = at(r, c);
      parts.push(`<circle class="dx-dot" cx="${x}" cy="${y}" r="7.5"/>`);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    svg.setAttribute('class', `dx-board${myTurn ? ' is-live' : ''}`);
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', `Board, ${n} by ${n} boxes`);
    svg.style.setProperty('--me', api.colorOf(api.player(api.me)?.color));
    svg.innerHTML = parts.join('');
    if (myTurn) {
      svg.addEventListener('click', (e) => {
        const g = e.target.closest('.dx-edge:not(.is-drawn)');
        if (g) send(Number(g.dataset.l));
      });
      svg.addEventListener('keydown', (e) => {
        const g = e.target.closest?.('.dx-edge:not(.is-drawn)');
        if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); send(Number(g.dataset.l)); }
      });
    }
    shownLines = [...s.lines];
    shownBoxes = [...s.boxes];
    return svg;
  }

  return {
    update(game) {
      const s = game.view;
      const over = !!game.result;
      const left = s.boxes.filter((b) => !b).length;
      root.replaceChildren(el('div', { class: 'dx-wrap' },
        el('div', { class: 'dx-stage' }, board(game)),
        el('div', { class: 'dx-side' },
          scoreboard(game.players, s.scores, { turn: over ? null : game.turn, me: api.me }),
          el('p', { class: 'g-note' }, over ? `All ${s.size * s.size} boxes taken.` : `${left} ${left === 1 ? 'box' : 'boxes'} left`))));
      if (over) return undefined;
      const again = s.claimed.length && s.lines[s.last] === game.turn;
      if (game.turn === api.me) return { text: again ? `${s.claimed.length === 2 ? 'Two boxes' : 'A box'}! Go again` : 'Your turn: draw a line', color: 'me' };
      if (again) return { text: `${api.name(game.turn)} goes again`, color: api.player(game.turn)?.color };
      return undefined;
    },
  };
}
