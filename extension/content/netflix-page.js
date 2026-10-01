// Couchline extension: Netflix page script. Runs in the page's own JavaScript world
// (manifest "world": "MAIN"), because Netflix's player API is only reachable from there.
//
// Netflix stops playback with error M7375 if anything sets video.currentTime directly, so
// every seek goes through Netflix's internal player API, which takes milliseconds. Play and
// pause go through it too, so Netflix's own controls stay in step. This API is undocumented
// and can change without notice; if it disappears, play and pause fall back to the video
// element and seeking is skipped rather than risking the crash.
//
// The content script (bridge.js) asks for actions with window.postMessage.
(() => {
  if (window.__couchlineNetflix) return;
  window.__couchlineNetflix = true;

  function netflixPlayer() {
    try {
      const api = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const ids = api.getAllPlayerSessionIds();
      const id = ids.find((s) => s.startsWith('watch')) || ids[0];
      return id ? api.getVideoPlayerBySessionId(id) : null;
    } catch {
      return null;
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.couchline !== 'netflix-cmd') return;
    const { op, time } = e.data;
    const p = netflixPlayer();
    if (op === 'seek') {
      if (p && Number.isFinite(time)) p.seek(Math.max(0, Math.round(time * 1000)));
      else window.postMessage({ couchline: 'netflix-status', ok: false, op }, location.origin);
    } else if (op === 'play') {
      if (p) p.play(); else document.querySelector('video')?.play().catch(() => {});
    } else if (op === 'pause') {
      if (p) p.pause(); else document.querySelector('video')?.pause();
    }
  });
})();
