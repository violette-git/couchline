// Couchline extension: a small "Couchline" button on YouTube, Vimeo, Twitch, and Instagram.
// It adds what you're looking at to your room (or puts it on now), so nobody copies links.
// On Instagram it can also share your scrolling: as you move from reel to reel, everyone in
// the room sees the same one in Couchline.
(() => {
  if (window.top !== window || window.__couchlineAnywhere) return;
  window.__couchlineAnywhere = true;

  const onInstagram = location.hostname.endsWith('instagram.com');
  let media = null; // lib/media.js, shared with the web app
  let host = null;
  let ui = null;
  let open = false;
  let sharing = false;
  let lastShared = null;
  let lastUrl = '';

  const send = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { error: 'The extension was updated. Reload this page.' } : r)); } catch { resolve({ error: 'The extension was updated. Reload this page.' }); }
  });

  // What this page is, if Couchline can play it.
  function pageMedia() {
    if (!media) return null;
    const m = media.parseMedia(location.href);
    return m && !m.error && m.kind !== 'stream' ? m : null;
  }
  const label = (m) => ({ youtube: 'this video', vimeo: 'this video', twitch: m.live ? 'this stream' : 'this video', instagram: m.igType === 'p' ? 'this post' : 'this reel' }[m.kind] || 'this');

  async function build() {
    host = document.createElement('couchline-button');
    host.style.cssText = 'all: initial; position: fixed; left: 16px; bottom: 16px; z-index: 2147483646;';
    const shadow = host.attachShadow({ mode: 'closed' });
    try {
      const css = await (await fetch(chrome.runtime.getURL('lib/styles.css'))).text();
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`${css.replace(/:root\s*\{/, ':host {')}
        .cl-pill { font: 700 0.9rem var(--font); color: var(--paper); padding-inline: 0.95rem; background: rgb(30 39 66 / 0.92); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); box-shadow: inset 0 1px 0 var(--edge), 0 8px 24px rgb(8 12 26 / 0.45); }
        .cl-pill:hover { background: var(--night-3); transform: translateY(-1px); }
        .cl-card { width: 288px; display: grid; gap: 0.65rem; padding: 1rem; margin-bottom: 0.6rem; border-radius: var(--r-large); background: radial-gradient(120% 90% at 50% -20%, var(--glow), transparent 65%), var(--night); color: var(--paper); border: 1px solid var(--line); box-shadow: inset 0 1px 0 var(--edge), var(--shadow-3); font: 400 0.92rem/1.4 var(--font); transform-origin: bottom left; animation: pop-in var(--t-med) var(--ease-out) backwards; }
        .cl-card p { margin: 0; }
        .cl-card > p:first-child { font-weight: 700; }
        .cl-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .cl-note { color: var(--muted); font-size: 0.85rem; }
        .cl-sharing { color: var(--paper); font-weight: 700; }
        @media (prefers-reduced-motion: reduce) { .cl-card { animation: none; } .cl-pill:hover { transform: none; } }`);
      shadow.adoptedStyleSheets = [sheet];
    } catch { /* unstyled still works */ }
    ui = {
      card: Object.assign(document.createElement('div'), { className: 'cl-card', hidden: true }),
      pill: Object.assign(document.createElement('button'), { className: 'btn btn-small cl-pill', textContent: 'Couchline' }),
    };
    ui.pill.addEventListener('click', () => { open = !open; render(); });
    shadow.append(ui.card, ui.pill);
    document.documentElement.append(host);
    render();
  }

  function button(text, cls, onClick) {
    const b = document.createElement('button');
    b.className = `btn btn-small ${cls}`;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }
  function p(text, cls = '') {
    const node = document.createElement('p');
    node.className = cls;
    node.textContent = text;
    return node;
  }

  let notice = '';
  async function render() {
    if (!ui) return;
    const m = pageMedia();
    // Only show up where there's something to add, or on Instagram for sharing your scrolling.
    // (The host resets all styles, so the hidden attribute wouldn't apply; set display instead.)
    host.style.display = !m && !onInstagram && !open ? 'none' : 'block';
    ui.pill.textContent = sharing ? 'Couchline: sharing' : 'Couchline';
    ui.card.hidden = !open;
    if (!open) return;
    const room = await send({ t: 'room' });
    const parts = [];
    if (!room) {
      parts.push(p('Pick your room first: click the Couchline button in the browser toolbar, or join a room from the sidebar on Netflix or Hulu.', 'cl-note'));
    } else {
      parts.push(p(`Room ${room.room}`));
      if (m) {
        parts.push(Object.assign(document.createElement('div'), { className: 'cl-row' }));
        parts.at(-1).append(
          button('Play now', 'btn-primary', () => act({ t: 'drop', url: location.href, play: true }, 'Putting it on')),
          button('Add to Up next', '', () => act({ t: 'drop', url: location.href, play: false }, 'Added')));
      } else if (!onInstagram) {
        parts.push(p('Open a video to add it.', 'cl-note'));
      }
      if (onInstagram) {
        parts.push(sharing
          ? p('Sharing your scrolling. Everyone in the room sees each reel you land on.', 'cl-sharing')
          : p('Share your scrolling: as you move through reels, the room follows along in Couchline.', 'cl-note'));
        parts.push(button(sharing ? 'Stop sharing' : 'Share my scrolling', sharing ? 'btn-quiet' : '', toggleSharing));
      }
    }
    if (notice) parts.push(p(notice, 'cl-note'));
    ui.card.replaceChildren(...parts);
  }

  async function act(msg, okText) {
    const r = await send(msg);
    notice = r?.error || `${okText}${r?.title ? `: ${r.title}` : ''}.`;
    render();
  }

  // ---------- Instagram: share my scrolling ----------
  async function toggleSharing() {
    sharing = !sharing;
    lastShared = null;
    if (sharing) await shareNow();
    else await send({ t: 'followStop' });
    render();
  }
  async function shareNow() {
    const m = pageMedia();
    if (!sharing || !m || m.kind !== 'instagram' || m.url === lastShared) return;
    lastShared = m.url;
    const r = await send({ t: 'follow', url: m.url });
    if (r?.error) { notice = r.error; render(); }
  }
  window.addEventListener('pagehide', () => { if (sharing) send({ t: 'followStop' }); });

  // These sites change pages without reloading, so watch the address.
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    notice = '';
    if (sharing) setTimeout(shareNow, 400); // let fast swipes settle on one reel
    render();
  }, 500);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.t === 'notice') { notice = msg.text; open = true; render(); }
  });

  import(chrome.runtime.getURL('lib/media.js')).then((m) => {
    media = m;
    const start = () => build();
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  });
})();
