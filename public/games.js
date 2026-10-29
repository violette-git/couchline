// Games: the Games tab (every game, searchable, and wins so far) and the game itself, which
// takes over the stage for everyone while it's open. Rooms made for games open to a picker
// on the stage instead of an empty video spot, and come back to it when a game closes. The server referees; this page shows
// the lobby, the board each game draws, and what happens when it ends.
// Each game draws itself from public/games/<id>.js (and <id>.css), loaded the first time it's
// played. See games/README.md for how a game is put together.
import { $, el, colorOf, toast } from './ui.js';
import { CATALOG, CATEGORIES, GAME } from './games/catalog.js';
import { sound } from './sound.js';

const icon = (meta, cls = 'g-icon') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = meta.icon;
  return svg;
};
const players = (m) => (m.min === m.max ? `${m.min} players` : m.min === 1 ? `1 to ${m.max} players` : `${m.min} to ${m.max} players`);
const fit = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// The landing page's list of games, by kind.
export function renderShelf(box) {
  box.replaceChildren(...CATEGORIES.map((c) => el('div', { class: 'g-shelf-group' },
    el('h3', {}, c.label),
    el('ul', {}, ...CATALOG.filter((g) => g.category === c.id).map((g) => el('li', {}, icon(g), g.name))))));
}

export function initGames({ socket, clientId, getRoom, now }) {
  let game = null; // what the server last sent about the open game
  let mounted = null; // { type, gameId, ui, root }
  let loading = null;
  let filter = 'all';
  let showRules = false;
  let timerRaf = null;

  const ask = (event, data = {}) => new Promise((res) => socket.emit(event, data, (r) => {
    if (r?.error) { toast({ text: r.error }); sound.play('nope'); }
    res(r || {});
  }));
  const isPlayer = () => !!game?.players.some((p) => p.id === clientId);
  const person = (id) => game?.players.find((p) => p.id === id) || game?.seats.find((p) => p.id === id) || getRoom()?.members.find((m) => m.id === id) || null;

  // What a game's drawing code gets to work with.
  const api = {
    me: clientId,
    el,
    colorOf,
    toast: (text) => toast({ text }),
    now,
    send: (move) => ask('game:move', { move }),
    player: person,
    name: (id) => (id === clientId ? 'You' : person(id)?.name || 'Someone'),
    isPlayer,
    game: () => game,
  };

  // ---------- the Games tab ----------
  $('#gameFilters').append(...[{ id: 'all', label: 'All' }, ...CATEGORIES].map((c) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(c.id === filter), 'data-filter': c.id,
    onclick: () => { filter = c.id; renderList(); },
  }, c.label)));
  $('#gameSearch').addEventListener('input', () => renderList());

  const tiles = (list) => list.map((g) => el('li', {},
    el('button', { type: 'button', class: `g-tile${g.id === game?.type ? ' is-open' : ''}`, onclick: () => open(g.id) },
      icon(g),
      el('span', { class: 'g-tile-name' }, g.name),
      el('span', { class: 'g-tile-blurb' }, g.blurb),
      el('span', { class: 'g-tile-meta' }, `${players(g)}${g.coop ? ', together' : ''}`))));

  function renderList() {
    const q = fit($('#gameSearch').value);
    for (const b of $('#gameFilters').children) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    const list = CATALOG.filter((g) => (filter === 'all' || g.category === filter)
      && (!q || [g.name, ...g.aka, g.blurb].some((s) => fit(s).includes(q))));
    $('#gameGrid').replaceChildren(...tiles(list));
    $('#gameNone').hidden = !!list.length;
  }

  // The picker on the stage, for rooms made for games: every game, by kind.
  $('#gamePickList').append(...CATEGORIES.map((c) => el('section', { class: 'game-pick-group' },
    el('h3', {}, c.label),
    el('ul', { class: 'g-grid' }, ...tiles(CATALOG.filter((g) => g.category === c.id))))));
  const gamesRoom = () => getRoom()?.mode === 'games';

  async function open(type) {
    if (game?.type === type && !game.result) { toStage(); return; }
    const r = await ask('game:open', { type });
    if (r.ok) toStage();
  }
  // On a phone the panel is below the stage, so bring the game into view.
  function toStage() {
    if (matchMedia('(max-width: 979px)').matches) $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const showTab = () => $('#tabGamesBtn').click();
  // "Pick another game": in a games room, back to the picker on the stage for everyone.
  const another = () => (gamesRoom() ? ask('game:close') : showTab());
  $('#emptyPlay').addEventListener('click', () => { showTab(); $('#tabGames').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });

  let wasGamesRoom = false;
  function renderTabExtras(room) {
    // A games room shows the picker on the stage when nothing is on, with the chat beside it.
    const picking = room.mode === 'games' && !room.games?.open && !room.current;
    $('#gamePick').hidden = !picking;
    $('#stage').classList.toggle('is-picking', picking);
    if (room.mode === 'games' && !wasGamesRoom) $('#tabChatBtn').click();
    wasGamesRoom = room.mode === 'games';
    $('#gamesHint').textContent = room.mode === 'games'
      ? 'Pick a game and it opens for everyone, right on the main screen.'
      : 'Pick a game and it opens for everyone, right where the video plays. The video pauses, or tap Video in the game to keep it on in a window you can move around.';

    const on = room.games?.open;
    const card = $('#gameNowCard');
    card.hidden = !on;
    if (on) {
      const meta = GAME[on.type];
      $('#gameNowText').textContent = on.phase === 'lobby' ? `${meta.name} is waiting for players.` : on.over ? `${meta.name} just finished.` : `${meta.name} is on.`;
    }
    const scores = room.games?.scores || [];
    $('#gameScores').hidden = !scores.length;
    $('#gameScoreList').replaceChildren(...scores.slice(0, 8).map((s) => {
      const li = el('li', {}, el('span', { class: 'dot' }), el('span', { class: 'who' }, s.name), el('b', {}, String(s.wins)));
      li.style.setProperty('--c', colorOf(s.color));
      return li;
    }));
  }

  // ---------- the stage ----------
  const wrap = $('#gameWrap');
  const body = $('#gameBody');

  function seatChip(p, extra = {}) {
    const chip = el('li', { class: `g-player${extra.turn ? ' is-turn' : ''}${p.here === false ? ' is-gone' : ''}` },
      el('span', { class: 'dot' }),
      el('span', { class: 'who' }, p.id === clientId ? `${p.name} (you)` : p.name),
      p.here === false ? el('span', { class: 'tag' }, 'away') : null);
    chip.style.setProperty('--c', colorOf(p.color));
    return chip;
  }

  function renderBar() {
    const meta = GAME[game.type];
    $('#gameName').replaceChildren(icon(meta, 'g-icon g-icon-sm'), el('span', {}, meta.name));
    const list = game.phase === 'play' ? game.players : [];
    $('#gamePlayers').replaceChildren(...list.map((p) => seatChip(p, { turn: !game.result && game.turn === p.id })));
    $('#gameRules').hidden = !showRules || game.phase === 'lobby';
    $('#gameRules').textContent = meta.rules;
    $('#gameRulesBtn').hidden = game.phase === 'lobby';
    $('#gameRulesBtn').setAttribute('aria-expanded', String(showRules));
    const over = game.phase === 'play' && !!game.result;
    $('#gameJoin').hidden = !(game.phase === 'play' && meta.lateJoin && !over && !isPlayer() && game.players.length < meta.max);
    const ending = game.phase === 'play' && !over;
    $('#gameEnd').textContent = ending ? 'End game' : 'Close';
    $('#gameEnd').hidden = ending && !isPlayer() && game.players.some((p) => p.here);
  }

  // "color" is a person color, or "me" for something this person needs to do.
  function setStatus(text, color = null) {
    const s = $('#gameStatus');
    s.textContent = text || '';
    s.style.setProperty('--c', color === 'me' ? 'var(--paper)' : colorOf(color));
    s.classList.toggle('is-me', color === 'me');
  }

  function defaultStatus() {
    if (game.result) return { text: '' };
    if (!game.turn) return { text: isPlayer() ? '' : 'Watching' };
    if (game.turn === clientId) return { text: 'Your turn', color: 'me' };
    return { text: `${api.name(game.turn)}’s turn`, color: person(game.turn)?.color };
  }

  // Seats, options, and Start.
  function renderLobby() {
    const meta = GAME[game.type];
    const seated = game.seats.some((p) => p.id === clientId);
    const full = game.seats.length >= meta.max;
    const enough = game.seats.length >= meta.min;
    const shown = (meta.options || []).filter((o) => Object.entries(o.when || {}).every(([k, v]) => game.options[k] === v));
    const options = shown.map((o) => el('div', { class: 'g-option' },
      el('span', { class: 'g-option-label' }, o.label),
      el('div', { class: 'seg', role: 'group', 'aria-label': o.label }, ...o.choices.map((c) => el('button', {
        type: 'button', 'aria-pressed': String(game.options[o.key] === c.value), disabled: !seated,
        onclick: () => ask('game:option', { key: o.key, value: c.value }),
      }, c.label)))));
    const need = meta.min - game.seats.length;
    let hint = '';
    if (!seated && full) hint = `The ${meta.max === 2 ? 'two seats are' : 'seats are all'} taken. You can watch.`;
    else if (!seated) hint = 'Take a seat to play.';
    else if (need > 0) hint = `Waiting for ${need} more ${need === 1 ? 'player' : 'players'}. Anyone in the room can tap Join.`;
    else hint = meta.min === meta.max || full ? 'Ready when you are.' : 'Ready when you are. Others can still join.';
    const seats = game.seats.map((p) => seatChip(p));
    for (let i = game.seats.length; i < Math.max(meta.min, 2) && i < meta.max; i++) seats.push(el('li', { class: 'g-player is-empty' }, el('span', { class: 'dot' }), el('span', { class: 'who' }, 'Open seat')));
    body.replaceChildren(el('div', { class: 'g-lobby' },
      el('div', { class: 'g-lobby-head' },
        icon(meta, 'g-icon g-icon-lg'),
        el('div', {},
          el('p', { class: 'g-lobby-cat' }, `${CATEGORIES.find((c) => c.id === meta.category).label}. ${players(meta)}${meta.coop ? ', playing together' : ''}`),
          el('h2', { class: 'g-lobby-name' }, meta.name))),
      el('p', { class: 'g-lobby-rules' }, meta.rules),
      el('ul', { class: 'g-seats', 'aria-label': 'Players' }, ...seats),
      options.length ? el('div', { class: 'g-options' }, ...options) : null,
      el('p', { class: 'note' }, hint),
      el('div', { class: 'g-lobby-actions' },
        seated
          ? el('button', { class: 'btn btn-primary', disabled: !enough, onclick: () => ask('game:start') }, 'Start')
          : el('button', { class: 'btn btn-primary', disabled: full, onclick: () => ask('game:seat', { on: true }) }, 'Join'),
        seated ? el('button', { class: 'btn btn-quiet', onclick: () => ask('game:seat', { on: false }) }, 'Leave seat') : null,
        el('button', { class: 'btn btn-quiet', onclick: another }, 'Pick another game'))));
  }

  function renderResult() {
    const foot = $('#gameFoot');
    const over = game.phase === 'play' && game.result;
    foot.hidden = !over;
    if (!over) return;
    const meta = GAME[game.type];
    const winners = game.result.winners || [];
    const mine = winners.includes(clientId);
    const lone = winners.length === 1 ? person(winners[0]) : null;
    const line = el('p', { class: `g-result${mine && !meta.coop ? ' is-mine' : ''}` }, game.result.text);
    line.style.setProperty('--c', meta.coop ? (winners.length ? 'var(--mint)' : 'var(--muted)') : lone ? colorOf(lone.color) : 'var(--paper)');
    foot.replaceChildren(line, el('div', { class: 'g-foot-actions' },
      isPlayer() ? el('button', { class: 'btn btn-primary btn-small', onclick: () => ask('game:again') }, 'Play again') : null,
      isPlayer() ? el('button', { class: 'btn btn-small', onclick: () => ask('game:lobby') }, 'Change players') : null,
      el('button', { class: 'btn btn-quiet btn-small', onclick: another }, 'Another game')));
  }

  // The time left in a timed round, counted on the shared clock.
  function runTimer() {
    cancelAnimationFrame(timerRaf);
    const pill = $('#gameTimer');
    const step = () => {
      const dl = game?.phase === 'play' && !game.result ? game.deadline : null;
      pill.hidden = !dl;
      if (!dl) return;
      const left = Math.max(0, Math.ceil((dl - now()) / 1000));
      const t = String(left);
      if (pill.textContent !== t) {
        if (pill.textContent && left <= 3 && left > 0) sound.play('tick');
        pill.textContent = t;
      }
      pill.classList.toggle('is-low', left <= 5);
      timerRaf = requestAnimationFrame(step);
    };
    step();
  }

  async function renderPlay() {
    const type = game.type;
    if (mounted?.gameId !== game.id || mounted.type !== type || mounted.round !== game.round) {
      mounted?.ui.destroy?.();
      mounted = null;
      const ticket = (loading = {});
      let mod;
      try {
        loadCss(type);
        mod = await import(`./games/${type}.js`);
      } catch (err) {
        console.error(err);
        body.replaceChildren(el('p', { class: 'note' }, 'This game didn’t load. Reload the page and try again.'));
        return;
      }
      if (loading !== ticket || game?.type !== type || game.phase !== 'play') return;
      const root = el('div', { class: `g-play g-${type}` });
      body.replaceChildren(root);
      mounted = { type, gameId: game.id, round: game.round, root, ui: mod.default(root, api) };
    }
    // A game can say what's going on (a string, or { text, color }); otherwise it's whose turn it is.
    let status = mounted.ui.update(game);
    if (typeof status === 'string') status = { text: status, color: game.turn === clientId ? 'me' : null };
    status ||= defaultStatus();
    setStatus(status.text, status.color);
  }

  function loadCss(type) {
    if (document.querySelector(`link[data-game="${type}"]`)) return;
    document.head.append(el('link', { rel: 'stylesheet', href: `/games/${type}.css`, 'data-game': type }));
  }

  function render() {
    const on = !!game;
    wrap.hidden = !on;
    $('#stage').classList.toggle('is-gaming', on);
    if (!on) {
      mounted?.ui.destroy?.();
      mounted = null;
      loading = null;
      body.replaceChildren();
      cancelAnimationFrame(timerRaf);
      return;
    }
    wrap.dataset.game = game.type;
    renderBar();
    renderResult();
    if (game.phase === 'lobby') {
      mounted?.ui.destroy?.();
      mounted = null;
      loading = null;
      setStatus('');
      renderLobby();
    } else {
      renderPlay();
    }
    runTimer();
  }

  $('#gameRulesBtn').addEventListener('click', () => { showRules = !showRules; render(); });

  // ---------- sounds ----------
  // A tap for every button press in a game (and typing on a computer keyboard during one).
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled && b.id !== 'gameSound') sound.play('tap');
  });
  document.addEventListener('keydown', (e) => {
    if (game?.phase !== 'play' || game.result || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, button')) return;
    if (/^[a-z]$/i.test(e.key) || e.key === 'Enter' || e.key === 'Backspace') sound.play('tap');
  });
  function renderSoundBtn() {
    const b = $('#gameSound');
    const off = sound.isMuted('games');
    b.setAttribute('aria-pressed', String(!off));
    b.setAttribute('aria-label', off ? 'Turn game sounds on' : 'Turn game sounds off');
    b.title = off ? 'Game sounds off' : 'Game sounds on';
    b.classList.toggle('is-muted', off);
  }
  $('#gameSound').addEventListener('click', () => { sound.setMuted('games', !sound.isMuted('games')); renderSoundBtn(); });
  renderSoundBtn();
  // The moments that get their own sound: a game starting, your turn coming round, and the end.
  function cue(was, now) {
    if (!now || now.phase !== 'play') return;
    const fresh = was?.id !== now.id || was?.round !== now.round || was?.phase !== 'play';
    if (fresh) { sound.play('start'); return; }
    if (now.result && !was.result) {
      const meta = GAME[now.type];
      const mine = now.players.some((p) => p.id === clientId);
      const won = meta.coop ? !!now.result.winners?.length : now.result.winners?.includes(clientId);
      sound.play(!mine ? 'end' : won ? 'win' : 'lose');
      return;
    }
    if (!now.result && now.turn === clientId && was.turn !== clientId) sound.play('turn');
  }
  $('#gameJoin').addEventListener('click', () => ask('game:seat', { on: true }));
  $('#gameEnd').addEventListener('click', () => ask('game:close'));
  $('#gameNowGo').addEventListener('click', () => { $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  renderList();

  return {
    onGame(g) {
      const was = game;
      game = g;
      cue(was, g);
      if (!g || g.id !== was?.id) showRules = false;
      render();
      renderList();
    },
    onRelay(r) {
      if (mounted && r.gameId === mounted.gameId) mounted.ui.relay?.(r.data, r.by);
    },
    render: renderTabExtras,
    get active() { return !!game; },
  };
}
