// Swipe together: a deck of Instagram reels and TikToks that everyone moves through as one.
// Whoever swipes is driving, and everyone's screen shows the same one. Reels shared while it's
// on (share sheet, Paste, chat) join the deck. Each person taps the video to play it, since
// Instagram's player can't be started for you.
import { $, el, colorOf } from './ui.js';

const embedUrl = (r) => (r.kind === 'tiktok'
  ? `https://www.tiktok.com/player/v1/${r.videoId}?music_info=1&description=1&rel=0&loop=1`
  : `https://www.instagram.com/${r.igType || 'reel'}/${r.code}/embed/`);

export function initSwipe({ socket, getRoom }) {
  let shownId = null;

  const deck = () => getRoom()?.reels;
  const go = (delta) => {
    const r = deck();
    if (!r?.on || !r.items.length) return;
    const index = Math.max(0, Math.min(r.items.length - 1, r.index + delta));
    if (index !== r.index) socket.emit('reels:go', { index });
  };

  $('#swipeNext').addEventListener('click', () => go(1));
  $('#swipeBack').addEventListener('click', () => go(-1));
  $('#swipeEnd').addEventListener('click', () => socket.emit('reels:stop'));
  $('#swipeRemove').addEventListener('click', () => {
    const r = deck();
    const item = r?.items[r.index];
    if (item) socket.emit('reels:remove', { id: item.id });
  });
  $('#swipeStart').addEventListener('click', () => socket.emit('reels:start'));

  // Arrow keys, and swiping on the space around the video (the video itself takes its own taps).
  document.addEventListener('keydown', (e) => {
    if (!deck()?.on || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(-1); }
  });
  let start = null;
  $('#swipeWrap').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, iframe')) return;
    start = { x: e.clientX, y: e.clientY };
  });
  $('#swipeWrap').addEventListener('pointerup', (e) => {
    if (!start) return;
    const dy = e.clientY - start.y;
    const dx = e.clientX - start.x;
    start = null;
    if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) go(dy < 0 ? 1 : -1);
  });

  function render(room) {
    const r = room.reels;
    const on = !!r?.on && !room.follow;
    $('#swipeWrap').hidden = !on;
    $('#stage').classList.toggle('is-swiping', on);
    // Up next offers it whenever there's something to swipe through.
    const waiting = room.queue.filter((it) => it.kind === 'instagram' || it.kind === 'tiktok').length + (r?.items.length || 0);
    $('#swipeCard').hidden = on;
    $('#swipeCount').textContent = waiting
      ? `${waiting} ${waiting === 1 ? 'reel or TikTok' : 'reels and TikToks'} ready.`
      : 'Share reels or TikToks to Couchline from your phone, or paste their links, then swipe through them as one.';
    if (!on) {
      if (shownId) $('#swipeFrame').removeAttribute('src');
      shownId = null;
      return;
    }
    const item = r.items[r.index];
    $('#swipeEmpty').hidden = !!item;
    $('#swipeFrame').hidden = !item;
    $('#swipeBack').disabled = !item || r.index === 0;
    $('#swipeNext').disabled = !item || r.index >= r.items.length - 1;
    $('#swipeRemove').hidden = !item;
    $('#swipePos').textContent = item ? `${r.index + 1} of ${r.items.length}` : 'Nothing yet';
    const driver = r.driverName ? room.members.find((m) => m.name === r.driverName) : null;
    $('#swipeDriver').textContent = r.driverName ? `${r.driverName} is driving` : '';
    $('#swipeDriver').style.setProperty('--c', colorOf(driver?.color));
    $('#swipeFrom').textContent = item ? `${item.kind === 'tiktok' ? 'TikTok' : 'Instagram'}, shared by ${item.addedBy}. Tap it to play.` : '';
    if (item && item.id !== shownId) {
      shownId = item.id;
      $('#swipeFrame').src = embedUrl(item);
    }
  }

  return { render };
}
