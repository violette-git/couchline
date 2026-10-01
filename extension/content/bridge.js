// Couchline extension: content script for Netflix and Hulu (runs in the extension's own world).
//
// It does three jobs:
//   1. Hosts the sidebar, an extension page in a frame docked on the right. The sidebar holds
//      the room connection, the call, and reactions.
//   2. Drives the video. When the room is synced it applies the room's play, pause, and seek,
//      and nudges speed to stay within about half a second (same rules as the web app, from
//      lib/sync.js).
//   3. Reports what the person does with the site's own controls, so pressing pause on
//      Netflix pauses everyone.
//
// Hulu is driven through its <video> element. Netflix seeks crash (M7375) if currentTime is
// set, so Netflix commands go to content/netflix-page.js, which uses Netflix's player API.
(() => {
  if (window.top !== window || window.__couchlineBridge) return;
  window.__couchlineBridge = true;

  const SERVICE = location.hostname.endsWith('netflix.com') ? 'Netflix' : 'Hulu';
  const PANEL_WIDTH = 340;
  const onWatchPage = () => location.pathname.startsWith('/watch/');
  const watchId = () => (location.pathname.match(/^\/watch\/([\w-]+)/) || [])[1] || null;

  // A link from the Couchline web app carries #couchline=ROOM&server=URL. Read it right away,
  // before the site rewrites the address. It only fills in the join form.
  const invite = (() => {
    const h = new URLSearchParams(location.hash.slice(1));
    return h.get('couchline') ? { room: h.get('couchline'), server: h.get('server') || '' } : null;
  })();

  let sync = null; // lib/sync.js, loaded below
  import(chrome.runtime.getURL('lib/sync.js')).then((m) => { sync = m; });

  // ---------- the page's video ----------
  let video = null;
  // What we last asked the video to do, so the events it fires aren't mistaken for the person.
  const ours = { play: 0, pause: 0, seekTarget: null, seekUntil: 0 };

  function findVideo() {
    const all = [...document.querySelectorAll('video')];
    if (SERVICE === 'Hulu') {
      // Hulu plays ads in a separate element; the show is in the content player.
      const content = all.find((v) => /content/i.test(v.className) && v.readyState > 0);
      if (content) return content;
    }
    const area = (v) => v.clientWidth * v.clientHeight;
    return all.filter((v) => v.readyState > 0).sort((a, b) => area(b) - area(a))[0] || null;
  }

  function attach(v) {
    if (v === video) return;
    video = v;
    if (!v || v.__couchline) return;
    v.__couchline = true;
    v.addEventListener('play', () => onVideoEvent(v, 'play'));
    v.addEventListener('pause', () => onVideoEvent(v, 'pause'));
    // "seeking" fires as soon as a seek starts, before the site loads the new spot. Waiting for
    // "seeked" would let a slow load look like buffering and pull the person back.
    v.addEventListener('seeking', () => onVideoEvent(v, 'seek'));
  }

  const control = {
    play() {
      ours.play = performance.now() + 2000;
      if (SERVICE === 'Netflix') window.postMessage({ couchline: 'netflix-cmd', op: 'play' }, location.origin);
      else video?.play().catch(() => {});
    },
    pause() {
      ours.pause = performance.now() + 2000;
      if (SERVICE === 'Netflix') window.postMessage({ couchline: 'netflix-cmd', op: 'pause' }, location.origin);
      else video?.pause();
    },
    seek(t) {
      ours.seekTarget = t;
      ours.seekUntil = performance.now() + 5000;
      if (SERVICE === 'Netflix') window.postMessage({ couchline: 'netflix-cmd', op: 'seek', time: t }, location.origin);
      else if (video) video.currentTime = Math.max(0, t);
    },
    // Speed nudges use the video element on both sites; only currentTime upsets Netflix.
    setRate(r) { if (video && video.playbackRate !== r) video.playbackRate = r; },
  };

  // ---------- the room ----------
  let port = null;
  let room = null; // latest room state from the sidebar, or null when not in a room
  let offset = 0; // server clock minus this device's clock, in ms
  let userActedAt = 0;
  let lastCmdAt = 0;
  let lastSeekAt = 0;
  let lastDriftSent = 0;
  let bufferingSince = 0;
  let reportedBuffering = false;
  let metaSentFor = null;

  const emit = (ev, data) => { try { port?.postMessage({ t: 'emit', ev, data }); } catch { /* sidebar reloading */ } };
  const serverNow = () => Date.now() + offset;
  const syncingHere = () => !!room?.extSync && room.current?.service === SERVICE && onWatchPage();

  // Reports what the person did with the site's own controls. A seek is ours if it landed
  // where we sent it. A play or pause only matters when it disagrees with the room. A pause
  // during our own seek might be the site pausing to load, so it counts only if it lasts.
  function onVideoEvent(v, kind) {
    if (v !== video || !syncingHere()) return;
    const now = performance.now();
    // A room held for someone's buffering is still meant to be playing.
    const roomPlaying = room.playback.playing || room.holds.length > 0;
    const position = v.currentTime;
    if (kind === 'seek') {
      const pending = ours.seekTarget != null && now < ours.seekUntil;
      if (pending && Math.abs(position - ours.seekTarget) < 1.5) {
        ours.seekTarget = null;
        ours.seekUntil = 0;
        return;
      }
      // Players skip small gaps in the stream on their own. Only a real jump is news.
      if (sync && Math.abs(position - sync.expectedPosition(room.playback, serverNow())) < 2.5) return;
      userActedAt = now;
      emit('cmd:seek', { position });
    } else if (kind === 'play') {
      if (now < ours.play || roomPlaying) { ours.play = 0; return; }
      userActedAt = now;
      emit('cmd:play', { position });
    } else if (kind === 'pause') {
      if (now < ours.pause || !roomPlaying || v.ended) { ours.pause = 0; return; }
      const report = () => {
        if (!v.paused || !(room?.playback.playing || room?.holds.length) || performance.now() < ours.play) return;
        userActedAt = performance.now();
        emit('cmd:pause', { position: v.currentTime });
      };
      // Either way, hold the sync loop off so it doesn't press play again while we decide.
      userActedAt = now;
      if (ours.seekTarget != null && now < ours.seekUntil) setTimeout(report, 700);
      else report();
    }
  }

  function stopReportingBuffering() {
    bufferingSince = 0;
    if (reportedBuffering) { reportedBuffering = false; emit('buffering', { on: false }); }
  }

  function tick() {
    attach(findVideo());
    if (!sync || !video || !syncingHere()) { stopReportingBuffering(); return; }
    const now = performance.now();
    // Give the room a moment to echo back what the person just did before enforcing anything.
    if (now - userActedAt < 1500) return;
    const cur = room.current;
    const pb = room.playback;
    const t = video.currentTime;
    const exp = sync.expectedPosition(pb, serverNow());

    if (Number.isFinite(video.duration) && video.duration > 0 && !cur.duration && metaSentFor !== cur.id) {
      metaSentFor = cur.id;
      emit('media:meta', { itemId: cur.id, duration: video.duration });
    }

    const roomPlaying = pb.playing && serverNow() >= pb.at;
    if (roomPlaying) {
      if (video.paused) {
        if (now - lastCmdAt > 1500) {
          if (Math.abs(t - exp) > 1) { control.seek(exp); lastSeekAt = now; }
          control.play();
          lastCmdAt = now;
        }
        return;
      }
      if (video.readyState < 3 || video.seeking) {
        bufferingSince ||= now;
        if (!reportedBuffering && now - bufferingSince > 1500) { reportedBuffering = true; emit('buffering', { on: true }); }
        return;
      }
      stopReportingBuffering();
      const drift = t - exp;
      const fix = sync.correction(drift, { fineRates: true, settling: now - lastSeekAt < 3000 });
      // Netflix seeks take a moment, so aim a little further ahead.
      if (fix.seek) { control.seek(exp + (SERVICE === 'Netflix' ? 0.5 : 0.2)); lastSeekAt = now; }
      else control.setRate(fix.rate);
      if (now - lastDriftSent > 2000) {
        lastDriftSent = now;
        emit('drift', { value: Math.round(drift * 10) / 10 });
      }
    } else {
      stopReportingBuffering();
      control.setRate(1);
      if (!video.paused && now - lastCmdAt > 1000) { control.pause(); lastCmdAt = now; }
      // A fresh item leaves everyone where they are until someone presses play.
      if (!pb.fresh && Math.abs(t - pb.position) > 0.7 && now - lastSeekAt > 1500) {
        control.seek(pb.position);
        lastSeekAt = now;
      }
    }
  }
  setInterval(tick, 500);

  // ---------- floating reactions over the video ----------
  let layer = null;
  function floatReaction({ emoji, color }) {
    if (!layer) return;
    const node = document.createElement('span');
    node.className = 'float';
    node.textContent = emoji;
    node.style.left = `${10 + Math.random() * 60}%`;
    node.style.setProperty('--c', color ? `var(--${color})` : 'var(--muted)');
    layer.append(node);
    setTimeout(() => node.remove(), 2400);
  }

  // ---------- sidebar frame ----------
  let host = null;
  let frame = null;
  let tab = null;
  let open = false;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

  async function buildUi() {
    host = document.createElement('couchline-sidebar');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
    // Closed, so page scripts can't reach the frame or read the channel id in its address.
    const shadow = host.attachShadow({ mode: 'closed' });

    // The web app's stylesheet gives the same tokens, person colors, and reaction animation.
    // Its :root tokens become :host tokens here, since :root doesn't reach inside a shadow root.
    try {
      const css = await (await fetch(chrome.runtime.getURL('lib/styles.css'))).text();
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`${css.replace(/:root\s*\{/, ':host {')}
        .cl-tab { position: absolute; right: 0; top: 38%; pointer-events: auto; writing-mode: vertical-rl;
          padding: 0.9rem 0.45rem; border: 1px solid var(--line); border-right: 0; border-radius: var(--r-small) 0 0 var(--r-small);
          background: var(--night); color: var(--paper); font: 700 0.9rem var(--font); letter-spacing: 0.02em; cursor: pointer; }
        .cl-tab:hover { background: var(--night-2); }
        .cl-frame { position: absolute; top: 0; right: 0; width: ${PANEL_WIDTH}px; max-width: 100vw; height: 100%; border: 0;
          border-left: 1px solid var(--line); background: var(--night); pointer-events: auto; color-scheme: dark; }
        .react-layer { right: ${PANEL_WIDTH}px; }
        .float { font-size: 2.8rem; }`);
      shadow.adoptedStyleSheets = [sheet];
    } catch { /* the frame still works unstyled */ }

    layer = document.createElement('div');
    layer.className = 'react-layer';
    tab = document.createElement('button');
    tab.className = 'cl-tab';
    tab.textContent = 'Couchline';
    tab.addEventListener('click', () => setOpen(true));

    frame = document.createElement('iframe');
    frame.className = 'cl-frame';
    frame.hidden = true;
    frame.allow = 'camera; microphone; autoplay';
    frame.title = 'Couchline';
    const params = new URLSearchParams({ n: nonce, svc: SERVICE });
    if (invite) { params.set('room', invite.room); params.set('server', invite.server); }
    frame.src = `${chrome.runtime.getURL('sidebar/sidebar.html')}#${params}`;
    // A reload of the frame (for example after moving into fullscreen) needs a new channel.
    frame.addEventListener('load', connect);

    shadow.append(layer, frame, tab);
    document.documentElement.append(host);
    refreshVisibility();
  }

  function connect() {
    try { port?.disconnect(); } catch { /* already gone */ }
    port = chrome.runtime.connect({ name: `couchline:${nonce}` });
    port.onMessage.addListener(onSidebarMessage);
    port.onDisconnect.addListener(() => { port = null; });
    sendPage();
  }

  function sendPage() {
    try { port?.postMessage({ t: 'page', service: SERVICE, watchId: watchId(), onWatch: onWatchPage() }); } catch { /* reloading */ }
  }

  function onSidebarMessage(msg) {
    if (msg.t === 'state') {
      room = msg.state;
      offset = msg.offset || 0;
      refreshVisibility();
    } else if (msg.t === 'react') {
      floatReaction(msg);
    } else if (msg.t === 'panel') {
      setOpen(msg.open);
    } else if (msg.t === 'syncToMe' && video) {
      emit('cmd:seek', { position: video.currentTime });
    } else if (msg.t === 'startTogether') {
      emit('countdown:start', { seconds: 5, position: video ? video.currentTime : null });
    }
  }

  function setOpen(on) {
    open = on;
    refreshVisibility();
  }

  // The tab shows on watch pages, or anywhere while in a room, so leaving the player to pick
  // the next episode doesn't drop the call.
  function refreshVisibility() {
    if (!host) return;
    const show = onWatchPage() || !!room;
    frame.hidden = !(show && open);
    tab.hidden = !show || open;
    layer.hidden = !room;
  }

  // Elements outside the fullscreen element disappear, so the sidebar moves into it.
  // moveBefore keeps the frame (and its call) alive; older browsers reload the frame,
  // and the sidebar rejoins on its own.
  document.addEventListener('fullscreenchange', () => {
    if (!host) return;
    const target = document.fullscreenElement || document.documentElement;
    if (host.parentNode === target) return;
    if (typeof target.moveBefore === 'function') {
      try { target.moveBefore(host, null); return; } catch { /* fall through */ }
    }
    target.append(host);
  });

  // Netflix and Hulu change pages without reloading, so watch the address.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    sendPage();
    refreshVisibility();
  }, 1000);

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.t === 'toggle') {
      setOpen(msg.open ?? !open);
      reply({ ok: true, service: SERVICE, inRoom: !!room });
    }
  });

  const start = () => buildUi().then(() => { if (invite && onWatchPage()) setOpen(true); });
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
