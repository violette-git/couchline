// The room's social layer: chat (with messages floating over the video), typing, pings on the
// video, starred moments on the timeline, the ready check, rating together, the watched
// history, stepping away, and following someone's Instagram scrolling.
import { $, el, colorOf, toast, clockTime, shortDate } from './ui.js';
import { fmt } from './sync.js';
import { parseMedia } from './media.js';

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+|\b(?:youtu\.be|(?:m\.)?youtube\.com|vimeo\.com|twitch\.tv|instagram\.com|netflix\.com|hulu\.com)\/[^\s<>"]+/gi;
const HOLD_MS = 450;
const STARS = [1, 2, 3, 4, 5];

export function initSocial({ socket, clientId, getRoom, expectedNow, durationNow, isLive, thumbUrl }) {
  let messages = [];
  let unread = 0;
  const typing = new Map(); // member id -> { name, until }
  let tookTap = false;
  let followCode = null;
  let ratingShownFor = null;

  // ---------- chat ----------
  const chatOpen = () => !$('#tabChat').hidden && document.visibilityState === 'visible';

  function messageNode(m) {
    const room = getRoom();
    const meta = el('p', { class: 'chat-meta' },
      el('span', { class: 'chat-name' }, m.name),
      el('span', { class: 'chat-time' }, clockTime(m.at)));
    // A message sent mid-video can take the room back to that spot.
    if (m.pos != null && room?.current?.id === m.itemId) {
      meta.append(el('button', { class: 'chat-at', title: 'Take everyone to this spot', onclick: () => socket.emit('cmd:seek', { position: m.pos }) }, `at ${fmt(m.pos)}`));
    }
    const node = el('li', { class: `chat-msg${m.from === clientId ? ' is-me' : ''}`, 'data-color': m.color }, meta, el('p', { class: 'chat-text' }, m.text));
    // Links in chat can go straight to Up next.
    const found = [...new Set(m.text.match(LINK) || [])].map((t) => parseMedia(t.replace(/[.,!?)]+$/, ''))).filter((x) => x && !x.error && (x.kind !== 'stream' || x.url));
    for (const media of found.slice(0, 2)) {
      const input = media.url;
      node.append(el('p', { class: 'chat-link' },
        el('button', { class: 'btn btn-small', onclick: () => add(input, false) }, 'Add to Up next'),
        el('button', { class: 'btn btn-quiet btn-small', onclick: () => add(input, true) }, 'Play now')));
    }
    return node;
  }
  function add(input, playNow) {
    socket.emit('queue:add', { input, playNow }, (res) => toast({ text: res?.error || (playNow ? 'Putting it on' : 'Added to Up next') }));
  }

  function renderChat() {
    const list = $('#chatList');
    list.replaceChildren(...(messages.length ? messages.map(messageNode) : [el('li', { class: 'q-empty' }, 'No messages yet. Say hi, or paste a link to share it.')]));
    list.scrollTop = list.scrollHeight;
  }

  function addMessage(m) {
    messages.push(m);
    if (messages.length > 200) messages = messages.slice(-200);
    const list = $('#chatList');
    if (messages.length === 1) list.replaceChildren();
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.append(messageNode(m));
    while (list.children.length > 200) list.firstChild.remove();
    if (nearBottom || m.from === clientId) list.scrollTop = list.scrollHeight;
    typing.delete(m.from);
    renderTyping();
    // Every message rises over the video, yours included.
    const launchFrom = m.from === clientId && sentFrom?.text === m.text && Date.now() - sentFrom.at < 5000 ? sentFrom.input : null;
    if (launchFrom) sentFrom = null;
    flyMessage(m, launchFrom);
    if (m.from !== clientId && !chatOpen()) setUnread(unread + 1);
  }

  function setUnread(n) {
    unread = n;
    $('#chatBadge').textContent = n > 9 ? '9+' : String(n);
    $('#chatBadge').hidden = !n;
  }

  // A message lifts off from the box it was typed in, lands at the bottom of the video, and
  // floats up until it leaves the top of the picture. Messages from others rise from the
  // bottom of the video. With reduced motion, they fade in and out in place instead.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let sentFrom = null;
  function bubble(m) {
    const text = m.text.length > 160 ? `${m.text.slice(0, 160)}...` : m.text;
    return el('p', { class: 'fly-msg', 'data-color': m.color }, el('strong', {}, m.name), ` ${text}`);
  }
  function flyMessage(m, fromInput) {
    const stage = $('#stage');
    const layer = $('#chatFloat');
    const sr = stage.getBoundingClientRect();
    if (!sr.height || stage.offsetParent === null) return;
    const node = bubble(m);
    layer.append(node);
    const h = node.offsetHeight;
    const startBottom = parseFloat(getComputedStyle(node).bottom) || 0;
    if (reduceMotion.matches) {
      node.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 5000, fill: 'forwards' }).finished.then(() => node.remove(), () => node.remove());
      return;
    }
    // Long enough to read: about 4.5 seconds plus a little per character, over the whole height.
    const travel = sr.height - startBottom + h + 8;
    const duration = Math.min(10000, 4500 + m.text.length * 30);
    const rise = () => node.animate(
      [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-travel}px)`, opacity: 1 }],
      { duration, easing: 'linear', fill: 'forwards' },
    ).finished.then(() => node.remove(), () => node.remove());
    const ir = fromInput?.getBoundingClientRect();
    if (!ir || !ir.width) {
      node.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 250, easing: 'ease-out' });
      rise();
      return;
    }
    // Your own message: a copy flies from the chat box to where the rising one starts.
    node.style.visibility = 'hidden';
    const nr = node.getBoundingClientRect();
    const twin = bubble(m);
    twin.classList.add('fly-launch');
    Object.assign(twin.style, { left: `${ir.left}px`, top: `${ir.top + (ir.height - h) / 2}px`, width: `${nr.width}px` });
    document.body.append(twin);
    const dx = nr.left - ir.left;
    const dy = nr.top - (ir.top + (ir.height - h) / 2);
    twin.animate([{ transform: 'translate(0, 0) scale(0.92)', opacity: 0.4 }, { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 }],
      { duration: 380, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' }).finished.then(() => {
      twin.remove();
      node.style.visibility = '';
      rise();
    }, () => twin.remove());
  }

  function send(input) {
    const text = input.value.trim();
    if (!text) return;
    sentFrom = { input, text, at: Date.now() };
    socket.emit('chat:send', { text }, (res) => {
      if (res?.error && res.error !== 'empty') toast({ text: res.error });
    });
    input.value = '';
    stopTyping();
  }

  let typingSentAt = 0;
  function onInput(e) {
    const now = Date.now();
    if (!e.target.value.trim()) return stopTyping();
    if (now - typingSentAt > 2000) {
      typingSentAt = now;
      socket.emit('chat:typing', { on: true });
    }
  }
  function stopTyping() {
    if (!typingSentAt) return;
    typingSentAt = 0;
    socket.emit('chat:typing', { on: false });
  }
  for (const [form, input] of [['#chatForm', '#chatInput'], ['#quickChat', '#quickInput']]) {
    $(form).addEventListener('submit', (e) => { e.preventDefault(); send($(input)); });
    $(input).addEventListener('input', onInput);
    $(input).addEventListener('blur', stopTyping);
  }
  $('#tabChatBtn').addEventListener('click', () => { setUnread(0); requestAnimationFrame(() => { $('#chatList').scrollTop = $('#chatList').scrollHeight; }); });

  function renderTyping() {
    const now = Date.now();
    for (const [id, t] of typing) if (t.until < now) typing.delete(id);
    const names = [...typing.values()].map((t) => t.name);
    const text = names.length ? `${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} typing` : '';
    for (const id of ['#typingNote', '#typingQuick']) {
      $(id).textContent = text;
      $(id).hidden = !text;
    }
  }
  setInterval(renderTyping, 1000);

  // ---------- pings: press and hold on the video ----------
  let hold = null;
  $('#stage').addEventListener('pointerdown', (e) => {
    // The invisible tap layer over the video is a button too, but holding on it is the point.
    if (e.target.id !== 'tapShield' && e.target.closest('button, a, input, select, iframe, .local-card, .countdown')) return;
    const r = $('#stage').getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    clearTimeout(hold?.timer);
    hold = {
      start,
      timer: setTimeout(() => {
        tookTap = true;
        socket.emit('ping', { x: (start.x - r.left) / r.width, y: (start.y - r.top) / r.height });
        navigator.vibrate?.(20);
      }, HOLD_MS),
    };
  });
  const cancelHold = (e) => {
    if (!hold) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - hold.start.x, e.clientY - hold.start.y) < 10) return;
    clearTimeout(hold.timer);
    hold = null;
  };
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) $('#stage').addEventListener(ev, cancelHold);
  $('#stage').addEventListener('contextmenu', (e) => { if (tookTap) e.preventDefault(); });

  function showPing({ x, y, color, name }) {
    const node = el('span', { class: 'ping', 'data-color': color }, el('span', { class: 'ping-name' }, name));
    node.style.left = `${x * 100}%`;
    node.style.top = `${y * 100}%`;
    $('#pingLayer').append(node);
    setTimeout(() => node.remove(), 1800);
  }

  // ---------- moments ----------
  $('#starBtn').addEventListener('click', () => socket.emit('moment:add', { pos: expectedNow() }));
  let marksKey = '';
  function renderMoments(force = false) {
    const room = getRoom();
    const cur = room?.current;
    const dur = durationNow();
    const list = cur && dur && !isLive(cur) ? room.moments.filter((m) => m.itemId === cur.id && m.pos <= dur) : [];
    const key = JSON.stringify([list.map((m) => m.id), Math.round(dur)]);
    if (key === marksKey && !force) return;
    marksKey = key;
    $('#momentMarks').replaceChildren(...list.map((m) => {
      const b = el('button', {
        class: 'moment', 'data-color': m.color, 'aria-label': `${m.name} starred ${fmt(m.pos)}. Go there.`,
        title: `${m.name} starred ${fmt(m.pos)}${m.note ? `: ${m.note}` : ''}. Tap to go there, right click to remove.`,
        onclick: () => socket.emit('cmd:seek', { position: m.pos }),
        oncontextmenu: (e) => { e.preventDefault(); socket.emit('moment:remove', { id: m.id }); },
      });
      b.style.left = `${(m.pos / dur) * 100}%`;
      return b;
    }));
  }

  // ---------- ready check ----------
  $('#readyBtn').addEventListener('click', () => socket.emit('ready:toggle'));
  function renderReady(room) {
    const viewers = room.members.filter((m) => !m.remote);
    const playing = room.playback.playing && room.serverNow >= room.playback.at;
    const show = !!room.current && !playing && !room.countdown && viewers.length > 1 && !room.follow;
    $('#readyRow').hidden = !show;
    if (!show) return;
    const ids = room.ready?.itemId === room.current.id ? room.ready.ids : [];
    const mine = ids.includes(clientId);
    $('#readyBtn').textContent = mine ? 'Not ready' : 'I’m ready';
    $('#readyBtn').classList.toggle('btn-primary', !mine);
    const waiting = viewers.filter((m) => !ids.includes(m.id)).map((m) => (m.id === clientId ? 'you' : m.name));
    $('#readyNote').textContent = ids.length
      ? `Ready: ${viewers.filter((m) => ids.includes(m.id)).map((m) => m.name).join(', ')}. Waiting for ${waiting.join(' and ')}.`
      : 'When everyone taps ready, it starts by itself.';
  }

  // ---------- rate it together ----------
  function renderRating(room) {
    const r = room.rating;
    const card = $('#rateCard');
    if (!r) { card.hidden = true; ratingShownFor = null; return; }
    card.hidden = false;
    const title = r.item.title;
    const viewers = room.members.filter((m) => !m.remote);
    if (r.revealed) {
      card.replaceChildren(...[
        el('p', { class: 'rate-q' }, `You rated ${title}`),
        el('ul', { class: 'rate-reveal' }, ...(r.votes.length ? r.votes : []).map((v) => el('li', { 'data-color': v.color },
          el('span', { class: 'rate-name' }, v.name), el('span', { class: 'rate-stars', 'aria-label': `${v.score} out of 5` }, '★'.repeat(v.score) + '☆'.repeat(5 - v.score))))),
        r.votes.length ? null : el('p', { class: 'hint' }, 'Nobody rated it.'),
        el('button', { class: 'btn btn-quiet btn-small', onclick: () => socket.emit('rate:dismiss') }, 'Close')].filter(Boolean));
      if (ratingShownFor !== `${r.itemId}:revealed`) {
        ratingShownFor = `${r.itemId}:revealed`;
        card.classList.remove('reveal');
        void card.offsetWidth;
        card.classList.add('reveal');
      }
      return;
    }
    if (r.answered.includes(clientId)) {
      const waiting = viewers.filter((m) => !r.answered.includes(m.id)).map((m) => m.name);
      card.replaceChildren(el('p', { class: 'rate-q' }, `Rated ${title}.`), el('p', { class: 'hint' }, waiting.length ? `Scores show when ${waiting.join(' and ')} ${waiting.length > 1 ? 'answer' : 'answers'}.` : 'Revealing.'));
      return;
    }
    card.replaceChildren(
      el('p', { class: 'rate-q' }, `How was ${title}?`),
      el('p', { class: 'hint' }, 'Scores stay hidden until everyone answers.'),
      el('div', { class: 'rate-stars-pick', role: 'group', 'aria-label': 'Your rating' },
        ...STARS.map((n) => el('button', { class: 'star', 'aria-label': `${n} out of 5`, onclick: () => socket.emit('rate', { itemId: r.itemId, score: n }) }, '★'))),
      el('button', { class: 'btn btn-quiet btn-small', onclick: () => socket.emit('rate', { itemId: r.itemId, score: null }) }, 'Skip'));
  }

  // ---------- watched together ----------
  // Everything you actually played together, whatever it was, newest first. Ratings show
  // once they're revealed.
  const THUMB_TEXT = { instagram: 'IG', twitch: 'TW', vimeo: 'V', file: 'VIDEO', local: 'FILE', jellyfin: 'JF', plex: 'PLEX' };
  function renderHistory(room) {
    const list = $('#historyList');
    if (!room.history.length) {
      list.replaceChildren(el('li', { class: 'q-empty' }, 'Nothing yet. Everything you play together shows up here, with how you each rated it.'));
      return;
    }
    list.replaceChildren(...room.history.map((h) => {
      const src = thumbUrl(h);
      const label = h.kind === 'stream' ? (h.service && h.service !== 'Other' ? h.service.slice(0, 1) : 'TV') : THUMB_TEXT[h.kind] || '';
      const thumb = el('div', { class: 'thumb' }, src ? el('img', { src, alt: '', loading: 'lazy' }) : label);
      const ep = h.season && h.episode ? ` S${h.season} E${h.episode}` : '';
      const now = room.current?.id === h.id;
      const when = now ? 'Watching now' : shortDate(h.at);
      return el('li', { class: now ? 'q-item is-current' : 'q-item' }, thumb,
        el('div', { class: 'q-text' },
          el('p', { class: 'q-title' }, `${h.title}${h.title.includes(`S${h.season} E`) ? '' : ep}`),
          el('p', { class: 'q-sub' }, when),
          h.votes.length
            ? el('p', { class: 'history-votes' }, ...h.votes.map((v) => el('span', { 'data-color': v.color, 'aria-label': `${v.name}: ${v.score} out of 5` }, `${v.name} ${'★'.repeat(v.score)}`)))
            : el('p', { class: 'q-sub' }, now ? '' : 'Not rated')),
        h.url && !now ? el('div', { class: 'q-actions' }, el('button', { class: 'btn btn-small', onclick: () => add(h.url, false) }, 'Watch again')) : null);
    }));
  }

  // ---------- stepping away ----------
  const reportPresence = () => socket.emit('presence', { away: document.visibilityState === 'hidden' });
  document.addEventListener('visibilitychange', reportPresence);
  $('#optAwayPause').addEventListener('change', (e) => socket.emit('settings:set', { pauseOnAway: e.target.checked }));

  // ---------- following someone's Instagram ----------
  $('#followStop').addEventListener('click', () => socket.emit('follow:stop'));
  function renderFollow(room) {
    const f = room.follow;
    $('#followWrap').hidden = !f;
    if (!f) {
      if (followCode) $('#followFrame').removeAttribute('src');
      followCode = null;
      return;
    }
    $('#followWho').textContent = `Following ${f.name}’s Instagram`;
    $('#followWrap').dataset.color = f.color || '';
    $('#followOpen').href = f.url;
    if (f.code !== followCode) {
      followCode = f.code;
      $('#followFrame').src = `https://www.instagram.com/${f.igType}/${f.code}/embed/`;
    }
  }

  return {
    onJoin(chat) {
      messages = Array.isArray(chat) ? chat.slice(-200) : [];
      renderChat();
      reportPresence();
    },
    onState(room) {
      renderReady(room);
      renderRating(room);
      renderHistory(room);
      renderFollow(room);
      renderMoments(true);
      $('#optAwayPause').checked = !!room.settings?.pauseOnAway;
    },
    onChat: addMessage,
    onTyping({ id, name, on }) {
      if (on) typing.set(id, { name, until: Date.now() + 4000 });
      else typing.delete(id);
      renderTyping();
    },
    onPing: showPing,
    tick() { renderMoments(); },
    // True once after a press-and-hold, so the tap that ended it doesn't also play or pause.
    tookTap() { const t = tookTap; tookTap = false; return t; },
    messages: () => messages,
  };
}
