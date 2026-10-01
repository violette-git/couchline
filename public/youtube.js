// YouTube IFrame player wrapper.
// Adapted from WatchParty's src/components/App/YouTube.ts (MIT, Copyright (c) 2020 Howard Chung).
// Native controls are hidden so every play, pause, and seek goes through the room,
// which keeps both screens from fighting each other.

export const YTState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

let apiPromise = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ||= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  });
  return apiPromise;
}

export class YouTubePlayer {
  constructor(elementId) {
    this.ready = false;
    this.videoId = null;
    this.pending = null;
    this.fineRates = false;
    loadApi().then(() => {
      this.player = new window.YT.Player(elementId, {
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0, playsinline: 1, rel: 0, disablekb: 1, fs: 0,
          iv_load_policy: 3, modestbranding: 1, origin: location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true;
            if (this.pending) {
              const [id, t] = this.pending;
              this.pending = null;
              this.load(id, t);
            }
          },
        },
      });
    });
  }

  load(videoId, start = 0) {
    if (!this.ready) { this.pending = [videoId, start]; return; }
    this.videoId = videoId;
    this.fineRates = false;
    this.player.cueVideoById({ videoId, startSeconds: Math.max(0, start) });
  }

  // Some videos only allow 0.25 steps, so a 1.03 nudge would silently round to 1.
  checkRates() {
    const rates = this.player?.getAvailablePlaybackRates?.() || [];
    this.fineRates = rates.some((r) => r > 1 && r < 1.2);
  }

  state() { return this.player?.getPlayerState?.() ?? YTState.UNSTARTED; }
  time() { return this.player?.getCurrentTime?.() ?? 0; }
  duration() { return this.player?.getDuration?.() ?? 0; }
  rate() { return this.player?.getPlaybackRate?.() ?? 1; }
  setRate(r) { if (this.fineRates || r === 1) this.player?.setPlaybackRate?.(r); }
  play() { this.player?.playVideo?.(); }
  pause() { this.player?.pauseVideo?.(); }
  seek(t) { this.player?.seekTo?.(Math.max(0, t), true); }
  stop() { this.player?.stopVideo?.(); }
}
