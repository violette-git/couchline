// YouTube IFrame player.
// Adapted from WatchParty's src/components/App/YouTube.ts (MIT, Copyright (c) 2020 Howard Chung).
// Native controls are hidden so every play, pause, and seek goes through the room,
// which keeps both screens from fighting each other.
import { Player, PState } from './player.js';

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

export class YouTubePlayer extends Player {
  constructor(slot) {
    super(slot);
    this.pending = null;
    this.apiReady = false;
    const mount = document.createElement('div');
    this.el.append(mount);
    loadApi().then(() => {
      this.player = new window.YT.Player(mount, {
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0, playsinline: 1, rel: 0, disablekb: 1, fs: 0,
          iv_load_policy: 3, modestbranding: 1, origin: location.origin,
        },
        events: {
          onReady: () => {
            this.apiReady = true;
            if (this.pending) {
              const [item, t] = this.pending;
              this.pending = null;
              this.load(item, t);
            }
          },
        },
      });
    });
  }

  load(item, start = 0) {
    this.key = item.id;
    this.fineRates = false;
    if (!this.apiReady) { this.pending = [item, start]; return; }
    this.ready = true;
    this.player.cueVideoById({ videoId: item.videoId, startSeconds: Math.max(0, start) });
  }

  // Some videos only allow 0.25 steps, so a 1.03 nudge would silently round to 1.
  checkRates() {
    const rates = this.player?.getAvailablePlaybackRates?.() || [];
    this.fineRates = rates.some((r) => r > 1 && r < 1.2);
  }

  state() { return this.player?.getPlayerState?.() ?? PState.UNSTARTED; }
  time() { return this.player?.getCurrentTime?.() ?? 0; }
  duration() { return this.player?.getDuration?.() ?? 0; }
  rate() { return this.player?.getPlaybackRate?.() ?? 1; }
  setRate(r) { if (this.fineRates || r === 1) this.player?.setPlaybackRate?.(r); }
  play() { this.player?.playVideo?.(); }
  pause() { this.player?.pauseVideo?.(); }
  seek(t) { this.player?.seekTo?.(Math.max(0, t), true); }
  stop() {
    this.pending = null;
    this.key = null;
    this.player?.stopVideo?.();
  }
}
