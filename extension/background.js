// Couchline extension: background worker.
// Adds things to your Couchline room from anywhere on the web: the right-click menu on links
// and pages, the "Couchline" button on video sites (content/anywhere.js), and the popup.
// It talks to the Couchline server's small HTTP API, using the room you last joined.

const ROOM_KEYS = ['server', 'room', 'name'];

async function roomSettings() {
  const s = await chrome.storage.local.get(ROOM_KEYS);
  return s.server && s.room ? s : null;
}

async function api(path, body) {
  const s = await roomSettings();
  if (!s) return { error: 'Pick your Couchline room first: click the Couchline button in the toolbar.' };
  try {
    const r = await fetch(`${s.server}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: s.room, name: s.name || 'Someone', ...body }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...j, room: s.room } : { error: j.error || `Couchline said no (${r.status}).` };
  } catch {
    return { error: `Can’t reach ${s.server}.` };
  }
}

const drop = (input, play) => api('/api/drop', { input, play: !!play });

// A quick check mark or "!" on the toolbar button, for pages with no Couchline button of their own.
function flag(ok, message) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#7DD8B0' : '#FFB3A6' });
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' });
  chrome.action.setTitle({ title: message });
  setTimeout(() => { chrome.action.setBadgeText({ text: '' }); chrome.action.setTitle({ title: 'Couchline' }); }, 4000);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'add', title: 'Add to Couchline', contexts: ['link', 'page', 'video'] });
    chrome.contextMenus.create({ id: 'play', title: 'Play now on Couchline', contexts: ['link', 'page', 'video'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.srcUrl || info.pageUrl || tab?.url;
  const r = await drop(url, info.menuItemId === 'play');
  const message = r.error || (info.menuItemId === 'play' ? `Playing in ${r.room}` : `Added to ${r.room}`);
  flag(!r.error, message);
  // Pages with the Couchline button show the result there too.
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { t: 'notice', text: message, ok: !r.error }).catch?.(() => {});
});

// From content scripts and the popup.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.t === 'drop') { drop(msg.url, msg.play).then(reply); return true; }
  if (msg?.t === 'follow') { api('/api/follow', { url: msg.url }).then(reply); return true; }
  if (msg?.t === 'followStop') { api('/api/follow/stop', {}).then(reply); return true; }
  if (msg?.t === 'room') { roomSettings().then(reply); return true; }
  return false;
});
