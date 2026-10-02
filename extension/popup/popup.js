// Toolbar popup: add the current page to your room, set which room that is, and open the
// sidebar on Netflix or Hulu.
const $ = (s) => document.querySelector(s);
const status = (text) => { $('#status').textContent = text; };

chrome.storage.local.get(['server', 'room', 'name'], (s) => {
  $('#server').value = s.server || '';
  $('#room').value = s.room || '';
  $('#name').value = s.name || '';
});

$('#roomForm').addEventListener('submit', (e) => {
  e.preventDefault();
  let server = $('#server').value.trim();
  let room = $('#room').value.trim();
  const link = room.match(/^(https?:\/\/[^/]+)\/r\/([a-z0-9-]{3,40})/i);
  if (link) { server = link[1]; room = link[2]; }
  if (!/^https?:\/\//i.test(server)) server = `${/^(localhost|127\.)/.test(server) ? 'http' : 'https'}://${server}`;
  try { server = new URL(server).origin; } catch { return status('That Couchline address doesn’t look right.'); }
  room = room.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  chrome.storage.local.set({ server, room, name: $('#name').value.trim().slice(0, 24) }, () => status(`Saved. Things you add go to ${room}.`));
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.id) return;
  if (/^https?:/.test(tab.url || '')) {
    $('#pageBox').hidden = false;
    $('#pageLabel').textContent = tab.title || tab.url;
    const drop = (play) => chrome.runtime.sendMessage({ t: 'drop', url: tab.url, play }, (r) => {
      status(r?.error || (play ? `Putting it on: ${r.title}` : `Added: ${r.title}`));
    });
    $('#playPage').addEventListener('click', () => drop(true));
    $('#addPage').addEventListener('click', () => drop(false));
  }
  // Only Netflix and Hulu tabs answer this.
  chrome.tabs.sendMessage(tab.id, { t: 'toggle', open: true }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) return;
    $('#pageBox').hidden = true;
    status(res.inRoom ? `You’re in a room on ${res.service}. The sidebar is open.` : 'The sidebar is open. Join your room there.');
    $('#toggle').hidden = false;
    $('#toggle').textContent = 'Hide the sidebar';
    $('#toggle').addEventListener('click', () => chrome.tabs.sendMessage(tab.id, { t: 'toggle', open: false }, () => window.close()));
  });
});
