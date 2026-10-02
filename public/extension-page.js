// The extension download page: points at the right browser's extensions page, shows the
// version, and carries the room code over when someone came here from a room.
import { $, toast } from './ui.js';

const ua = navigator.userAgent;
const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
const isEdge = /Edg\//.test(ua);
const isChrome = /Chrome\//.test(ua) && !isEdge && !/OPR\//.test(ua);

if (isPhone) {
  $('#phoneNote').hidden = false;
} else if (!isEdge && !isChrome) {
  $('#browserNote').hidden = false;
}
if (isEdge) {
  $('#extUrl').textContent = 'edge://extensions';
  $('#devModeWhere').textContent = 'It’s a switch on the left side of that page (open the menu there if the window is narrow).';
}

// Came from a room: show its code, and send them back to it.
const room = new URLSearchParams(location.search).get('room');
if (room && /^[a-z0-9-]{3,40}$/i.test(room)) {
  $('#roomRow').hidden = false;
  $('#roomCode').textContent = room.toLowerCase();
  $('#backToRoom').href = `/r/${room.toLowerCase()}`;
  $('#backToRoom').textContent = 'Back to your room';
}

fetch('/extension/info').then((r) => r.json()).then(({ version, size }) => {
  $('#versionNote').textContent = `Version ${version}, a ${Math.max(1, Math.round(size / 1024))} KB .zip file. Free.`;
}).catch(() => {});

for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($(b.dataset.copy).textContent);
      toast({ text: 'Copied' });
    } catch { /* the text is right there to select */ }
  });
}
