// Ways to add things without copying and pasting a link: a Paste button, an offer to add the
// link you just copied, YouTube search (when the server has a key), show search with episode
// lists (TVmaze, no key needed), the phone share sheet, and a QR code for joining.
import { $, el, store, toast, debounce } from './ui.js';
import { parseMedia } from './media.js';

const TVMAZE = 'https://api.tvmaze.com';
const POSTER = /^https:\/\/static\.tvmaze\.com\//;
const SHARE_KEY = 'pendingAdd';

const LABELS = { youtube: 'YouTube video', vimeo: 'Vimeo video', twitch: 'Twitch video', file: 'Video link', jellyfin: 'Jellyfin video', plex: 'Plex video', instagram: 'Instagram', stream: 'link' };
export const describe = (m) => (m.kind === 'stream' ? `${m.service} link` : m.kind === 'twitch' && m.live ? 'Twitch live stream' : LABELS[m.kind] || 'link');

// A supported link inside some text (share sheets often send "Look at this! https://...").
export function findLink(text) {
  for (const word of String(text || '').split(/\s+/)) {
    const m = parseMedia(word.replace(/[.,!?)]+$/, ''));
    if (m && !m.error && (m.kind !== 'stream' || m.url)) return m.url;
  }
  return null;
}

// ---------- phone share sheet (before a room is open) ----------
// /share?url=...&text=... comes from Android's share sheet (Couchline installed to the home
// screen) or an iPhone Shortcut. It goes into the last room this device was in.
export function handleShareLanding() {
  if (location.pathname !== '/share') return false;
  const q = new URLSearchParams(location.search);
  const link = findLink(q.get('url')) || findLink(q.get('text')) || findLink(q.get('title'));
  const last = store.get('lastRoom');
  if (link) store.set(SHARE_KEY, { link, at: Date.now() });
  if (link && last) {
    location.replace(`/r/${last}`);
    return true;
  }
  history.replaceState(null, '', '/');
  const note = $('#shareNote');
  note.hidden = false;
  note.textContent = link
    ? 'Got it. Join or start a room and it will be added there.'
    : 'That share didn’t include a link Couchline can play.';
  return false;
}

export function initAdding({ socket, roomId, config }) {
  // ---------- adding a link in one step ----------
  function add(input, playNow = false, done) {
    socket.emit('queue:add', { input, playNow }, (res) => {
      if (res?.error) toast({ text: res.error });
      else toast({ text: playNow ? 'Putting it on' : 'Added to Up next' });
      done?.(res);
    });
  }

  // Paste: reads the clipboard and adds the link right away.
  $('#pasteBtn').addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* not allowed */ }
    const link = findLink(text);
    if (link) {
      add(link);
      lastOffered = text;
    } else {
      $('#addInput').focus();
      toast({ text: text ? 'The clipboard doesn’t have a link Couchline can play.' : 'Allow clipboard access, or paste into the box.' });
    }
  });

  // Coming back to Couchline with a link copied: offer to add it (only where the browser
  // already allows reading the clipboard, so this never pops up a permission prompt).
  let lastOffered = store.get('lastOffered', '');
  async function offerClipboard() {
    try {
      const perm = await navigator.permissions?.query({ name: 'clipboard-read' });
      if (perm?.state !== 'granted') return;
      const text = await navigator.clipboard.readText();
      const link = findLink(text);
      if (!link || text === lastOffered) return;
      lastOffered = text;
      store.set('lastOffered', text);
      const m = parseMedia(link);
      const box = $('#clipSuggest');
      box.replaceChildren(
        el('span', {}, `Add the ${describe(m)} you copied?`),
        el('button', { class: 'btn btn-primary btn-small', onclick: () => { add(link); box.hidden = true; } }, 'Add'),
        el('button', { class: 'btn btn-small', onclick: () => { add(link, true); box.hidden = true; } }, 'Play now'),
        el('button', { class: 'btn btn-quiet btn-small', 'aria-label': 'No thanks', onclick: () => { box.hidden = true; } }, 'No'));
      box.hidden = false;
    } catch { /* clipboard unavailable */ }
  }
  window.addEventListener('focus', offerClipboard);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') offerClipboard(); });
  offerClipboard();

  // ---------- YouTube search (when the server has a key) ----------
  if (config.youtubeSearch) $('#addInput').placeholder = 'Paste a link or search YouTube';
  let searchSeq = 0;
  const search = debounce(async (q) => {
    const seq = ++searchSeq;
    const box = $('#searchResults');
    try {
      const r = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (seq !== searchSeq) return;
      if (!r.ok) { box.replaceChildren(el('li', { class: 'note' }, j.error)); box.hidden = false; return; }
      box.replaceChildren(...j.results.map((v) => el('li', { class: 'q-item' },
        el('div', { class: 'thumb' }, el('img', { src: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, alt: '', loading: 'lazy' })),
        el('div', { class: 'q-text' }, el('p', { class: 'q-title' }, v.title), el('p', { class: 'q-sub' }, v.live ? `${v.channel}, live` : v.channel)),
        el('div', { class: 'q-actions' },
          el('button', { class: 'btn btn-small', onclick: () => add(`https://www.youtube.com/watch?v=${v.videoId}`, false, clearSearch) }, 'Add'),
          el('button', { class: 'btn btn-quiet btn-small', onclick: () => add(`https://www.youtube.com/watch?v=${v.videoId}`, true, clearSearch) }, 'Play now')))));
      box.hidden = !j.results.length;
    } catch { /* offline */ }
  }, 400);
  function clearSearch() {
    $('#searchResults').hidden = true;
    $('#addInput').value = '';
  }
  $('#addInput').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const isLink = !!parseMedia(v)?.url || /^(https?:\/\/|www\.)/i.test(v);
    if (!config.youtubeSearch || v.length < 2 || isLink) { searchSeq++; $('#searchResults').hidden = true; return; }
    search(v);
  });

  // ---------- show search with episode lists (TVmaze) ----------
  // Picking a show fills in its name, service, and poster, and lists its episodes, so nobody
  // types season and episode numbers by hand.
  function showPicker({ input, suggest, epSelect, onPick, onEpisode }) {
    let seq = 0;
    const lookup = debounce(async (q) => {
      const mine = ++seq;
      try {
        const r = await fetch(`${TVMAZE}/search/shows?q=${encodeURIComponent(q)}`);
        const list = (await r.json()).slice(0, 6);
        if (mine !== seq) return;
        suggest.replaceChildren(...list.map(({ show }) => {
          const where = show.webChannel?.name || show.network?.name || '';
          const year = (show.premiered || '').slice(0, 4);
          return el('li', {},
            el('button', { type: 'button', class: 'suggest-item', onclick: () => pick(show) },
              show.image?.medium ? el('img', { src: show.image.medium, alt: '', loading: 'lazy' }) : el('span', { class: 'suggest-noimg' }),
              el('span', {}, el('strong', {}, show.name), el('small', {}, [where, year].filter(Boolean).join(', ')))));
        }));
        suggest.hidden = !list.length;
      } catch { suggest.hidden = true; }
    }, 300);
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q.length < 2) { seq++; suggest.hidden = true; return; }
      lookup(q);
    });
    input.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; }, 200));
    async function pick(show) {
      suggest.hidden = true;
      input.value = show.name;
      const where = show.webChannel?.name || show.network?.name || '';
      const service = /netflix/i.test(where) ? 'Netflix' : /hulu/i.test(where) ? 'Hulu' : 'Other';
      const poster = POSTER.test(show.image?.medium || '') ? show.image.medium : null;
      onPick({ title: show.name, service, poster });
      epSelect.hidden = true;
      try {
        const eps = await (await fetch(`${TVMAZE}/shows/${show.id}/episodes`)).json();
        if (!Array.isArray(eps) || !eps.length) return;
        epSelect.replaceChildren(el('option', { value: '' }, 'Pick an episode (optional)'),
          ...eps.filter((e) => e.season && e.number).map((e) => el('option', { value: `${e.season}:${e.number}` }, `S${e.season} E${e.number}  ${e.name || ''}`)));
        epSelect.hidden = false;
        epSelect.onchange = () => {
          const [season, episode] = epSelect.value.split(':').map(Number);
          if (season) onEpisode({ season, episode, name: eps.find((e) => e.season === season && e.number === episode)?.name || '' });
        };
      } catch { /* episodes are optional */ }
    }
  }

  // Shows tab: picking fills the form, including season and episode.
  let showPoster = null;
  showPicker({
    input: $('#showTitle'), suggest: $('#showSuggest'), epSelect: $('#showEpPick'),
    onPick: ({ service, poster }) => { $('#showService').value = service; showPoster = poster; },
    onEpisode: ({ season, episode }) => { $('#showSeason').value = season; $('#showEpisode').value = episode; },
  });
  $('#showForm').addEventListener('submit', () => {
    // app.js sends the form; this adds the poster and resets the picker.
    setTimeout(() => { showPoster = null; $('#showEpPick').hidden = true; }, 0);
  });

  // Up next, "Type a show": picking a show and episode makes a tidy title.
  let addShow = null;
  showPicker({
    input: $('#showAddName'), suggest: $('#showAddSuggest'), epSelect: $('#showAddEp'),
    onPick: (s) => { addShow = { ...s }; $('#showAddService').value = s.service; },
    onEpisode: ({ season, episode }) => {
      if (!addShow) return;
      addShow.season = season;
      addShow.episode = episode;
    },
  });

  // ---------- QR code for joining from a phone or TV ----------
  let qrDone = false;
  async function renderQr() {
    if (qrDone) return;
    try {
      if (!window.qrcode) {
        await new Promise((resolve, reject) => {
          const s = el('script', { src: '/vendor/qrcode/qrcode.js' });
          s.onload = resolve;
          s.onerror = reject;
          document.head.append(s);
        });
      }
      const qr = window.qrcode(0, 'M');
      qr.addData(`${location.origin}/r/${roomId}`);
      qr.make();
      $('#qrBox').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      $('#qrBox').hidden = false;
      qrDone = true;
    } catch { /* the code and link still work */ }
  }
  $('#roomChip').addEventListener('click', renderQr);

  // iPhone: a Shortcut puts Couchline in the share sheet. This is the address it opens.
  $('#shortcutUrl').textContent = `${location.origin}/share?url=`;
  $('#copyShortcut').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/share?url=`); toast({ text: 'Copied. Paste it into the Shortcut.' }); } catch { /* shown on screen */ }
  });

  return {
    // Something shared from the phone before the room opened.
    flushShared() {
      const pending = store.get(SHARE_KEY);
      if (!pending?.link || Date.now() - pending.at > 10 * 60 * 1000) return;
      store.set(SHARE_KEY, null);
      add(pending.link);
    },
    hasShared: () => !!store.get(SHARE_KEY)?.link,
    // Extra fields for the add forms: the show poster and picked episode.
    showExtras: () => ({ poster: showPoster }),
    typedShow: (name) => (addShow && addShow.title === name ? addShow : null),
    resetTypedShow: () => { addShow = null; $('#showAddEp').hidden = true; },
  };
}
