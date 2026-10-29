// Starting a room (with a name, private or public, for watching or games) and browsing public rooms.
import { $, el, colorOf, debounce, listNames } from './ui.js';

const NEW_ROOM = 'couchline:newRoom';

// What to set up once the creator is in the new room (name, privacy, and what it's for).
export const pendingRoom = {
  get(code) {
    try {
      const p = JSON.parse(sessionStorage.getItem(NEW_ROOM));
      return p?.code === code ? p : null;
    } catch { return null; }
  },
  set(p) { try { sessionStorage.setItem(NEW_ROOM, JSON.stringify(p)); } catch { /* private mode */ } },
  clear() { try { sessionStorage.removeItem(NEW_ROOM); } catch { /* private mode */ } },
};

// ---------- starting a room ----------
export function initCreate({ newRoomCode }) {
  const form = $('#createForm');
  let visibility = 'private';
  const setVisibility = (v) => {
    visibility = v;
    for (const b of form.querySelectorAll('[data-visibility]')) b.setAttribute('aria-pressed', String(b.dataset.visibility === v));
    $('#createWhat').textContent = v === 'public'
      ? 'Listed in Browse rooms while someone is in it. Anyone can find it and join.'
      : 'Only people with the code or link can join. It never shows up in Browse rooms.';
  };
  for (const b of form.querySelectorAll('[data-visibility]')) b.addEventListener('click', () => setVisibility(b.dataset.visibility));
  setVisibility('private');
  let mode = 'watch';
  const setMode = (m) => {
    mode = m;
    for (const b of form.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    $('#createModeNote').textContent = m === 'games'
      ? 'Opens to the games, with the call and chat beside them. You can still put a video on.'
      : 'Opens to Up next, ready for a video or a show. The games are a tab away.';
    $('#createTitle').placeholder = m === 'games' ? 'Thursday game night' : 'Friday movie night';
  };
  for (const b of form.querySelectorAll('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
  setMode('watch');
  $('#createRoom').addEventListener('click', () => {
    form.hidden = !form.hidden;
    $('#createRoom').setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) $('#createTitle').focus();
  });
  // The other Start a room buttons on the home page open the same form, up in the hero.
  // data-open-create="games" starts it set to games.
  for (const b of document.querySelectorAll('[data-open-create]')) {
    b.addEventListener('click', () => {
      if (b.dataset.openCreate) setMode(b.dataset.openCreate);
      if (form.hidden) $('#createRoom').click();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#createTitle').focus({ preventScroll: true });
    });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = newRoomCode();
    pendingRoom.set({ code, title: $('#createTitle').value.trim().slice(0, 60), visibility, mode });
    location.href = `/r/${code}`;
  });
}

// ---------- browsing public rooms ----------
const thumbFor = (now) => {
  if (!now) return null;
  if (now.poster) return now.poster;
  if (now.kind === 'youtube' && now.videoId) return `https://i.ytimg.com/vi/${now.videoId}/mqdefault.jpg`;
  if (now.kind === 'vimeo') return now.thumb;
  if (now.kind === 'twitch' && now.live && now.channel) return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${now.channel}-320x180.jpg`;
  return null;
};
const KIND_TEXT = { youtube: 'YouTube', vimeo: 'Vimeo', twitch: 'Twitch', tiktok: 'TikTok', instagram: 'Instagram', file: 'Video', local: 'Video file', jellyfin: 'Jellyfin', plex: 'Plex' };

export function initBrowse() {
  let seq = 0;
  async function load() {
    const mine = ++seq;
    const q = $('#browseSearch').value.trim();
    let list = [];
    try {
      list = (await (await fetch(`/api/rooms${q ? `?q=${encodeURIComponent(q)}` : ''}`)).json()).rooms || [];
    } catch {
      $('#browseStatus').textContent = 'Couldn’t load rooms. Check your connection.';
      return;
    }
    if (mine !== seq) return;
    $('#browseStatus').textContent = list.length
      ? `${list.length} public ${list.length === 1 ? 'room' : 'rooms'}${q ? ` matching “${q}”` : ' open now'}`
      : q ? `No public rooms match “${q}”.` : 'No public rooms are open right now. Start one and make it public.';
    $('#browseList').replaceChildren(...list.map((r) => {
      const src = thumbFor(r.now);
      const label = r.now ? (r.now.kind === 'stream' ? r.now.service || 'Show' : KIND_TEXT[r.now.kind] || '') : '';
      const people = r.people.map((p) => p.name);
      return el('li', { class: 'room-card' },
        el('a', { class: 'room-card-link', href: `/r/${r.id}`, 'aria-label': `Join ${r.title || r.id}` },
          el('div', { class: 'room-card-thumb' }, src ? el('img', { src, alt: '', loading: 'lazy' }) : el('span', {}, label ? label.slice(0, 2).toUpperCase() : 'CL'),
            r.now && r.playing ? el('span', { class: 'room-live' }, 'Playing') : null),
          el('div', { class: 'room-card-text' },
            el('p', { class: 'room-card-title' }, r.title || r.id),
            el('p', { class: 'room-card-now' }, r.game ? `Playing ${r.game}` : r.now ? `${label}: ${r.now.title}` : r.mode === 'games' ? 'Game night, picking a game' : 'Nothing on yet'),
            el('p', { class: 'room-card-people' },
              el('span', { class: 'room-dots', 'aria-hidden': 'true' }, ...r.people.slice(0, 8).map((p) => {
                const d = el('span', { class: 'dot' });
                d.style.setProperty('--c', colorOf(p.color));
                return d;
              })),
              `${people.length} ${people.length === 1 ? 'person' : 'people'}: ${listNames(people.slice(0, 4))}${people.length > 4 ? ' and more' : ''}`)),
          el('span', { class: 'btn btn-small room-card-join' }, 'Join')));
    }));
  }
  $('#browseSearch').addEventListener('input', debounce(load, 250));
  $('#browseForm').addEventListener('submit', (e) => { e.preventDefault(); load(); });
  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
}
