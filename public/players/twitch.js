// Twitch player, using Twitch's official embed script (player.twitch.tv/js/embed/v1.js).
// Twitch only plays inside pages on the domains passed as "parent", which the server
// reads from the TWITCH_PARENT environment variable.
// Videos (past broadcasts) sync like any other video. Live channels can't be seeked, so
// only play and pause are shared and the app hides the timeline.
// Twitch won't start playback in a player that's covered by anything, so nothing is laid
// over it. People can use Twitch's own buttons, and those presses are reported to the room
// through onUser (the same idea as the browser extension uses on Netflix).
import { Player, PState, loadScript } from './player.js';

const SDK = 'https://player.twitch.tv/js/embed/v1.js';
let parents = ['localhost'];
export function setTwitchParents(list) {
  if (Array.isArray(list) && list.length) parents = list;
}

const hms = (t) => {
  t = Math.max(0, Math.floor(t));
  return `${Math.floor(t / 3600)}h${Math.floor((t % 3600) / 60)}m${t % 60}s`;
};

let nextId = 0;

export class TwitchPlayer extends Player {
  constructor(slot) {
    super(slot);
    this.mount = document.createElement('div');
    this.mount.id = `twitch-player-${++nextId}`;
    this.el.append(this.mount);
    this.ownControls = true;
    this.onUser = null; // set by the app: (kind, seconds) for 'play', 'pause', or 'seek'
    this.expected = { play: 0, pause: 0, seek: 0 };
    this.reset();
  }

  // Our own play, pause, and seek calls also fire Twitch events. Those are ignored for a moment.
  mark(kind, ms) { this.expected[kind] = performance.now() + ms; }
  fromTwitch(kind, position) {
    const now = performance.now();
    if (!this.ready || now < this.expected[kind] || now < this.expected.seek) return;
    this.onUser?.(kind, position ?? this.time());
  }

  reset() {
    this.started = false;
    this.blocked = false;
    this.offline = false;
    this.lastT = -1;
    this.lastMove = performance.now();
  }

  async load(item, start = 0) {
    this.key = item.id;
    this.live = !!item.live;
    this.ready = false;
    this.error = null;
    this.reset();
    if (!parents.includes(location.hostname)) {
      this.error = `Twitch only plays on sites it was told about. Set TWITCH_PARENT to ${location.hostname} on the server.`;
      return;
    }
    const key = item.id;
    try {
      await loadScript(SDK, () => window.Twitch?.Player);
    } catch {
      this.error = 'Couldn’t load the Twitch player.';
      return;
    }
    if (this.key !== key) return;
    const T = window.Twitch.Player;
    if (!this.player) {
      this.player = new T(this.mount.id, {
        width: '100%', height: '100%', parent: parents, autoplay: false, muted: false,
        ...(item.live ? { channel: item.channel } : { video: `v${item.videoId}`, time: hms(start) }),
      });
      this.player.addEventListener(T.PLAY, () => { this.started = true; this.blocked = false; this.fromTwitch('play'); });
      this.player.addEventListener(T.PAUSE, () => this.fromTwitch('pause'));
      this.player.addEventListener(T.SEEK, (d) => { if (!this.live) this.fromTwitch('seek', d?.position); });
      this.player.addEventListener(T.PLAYING, () => { this.started = true; this.blocked = false; });
      this.player.addEventListener(T.PLAYBACK_BLOCKED || 'playbackBlocked', () => { this.blocked = true; });
      this.player.addEventListener(T.OFFLINE, () => { if (this.live) { this.offline = true; this.error = 'This channel is offline right now.'; } });
      this.player.addEventListener(T.ONLINE, () => { this.offline = false; this.error = null; });
      await new Promise((resolve) => this.player.addEventListener(T.READY, resolve));
    } else if (item.live) {
      this.player.setChannel(item.channel);
    } else {
      this.player.setVideo(`v${item.videoId}`, start);
    }
    if (this.key !== key) return;
    this.mark('pause', 1500);
    this.player.pause();
    this.ready = true;
  }

  state() {
    const p = this.player;
    if (!p || !this.ready) return PState.UNSTARTED;
    if (p.getEnded?.()) return PState.ENDED;
    if (this.offline) return PState.PAUSED; // nothing to wait for, so don't hold the room
    if (p.isPaused?.()) return this.started && !this.blocked ? PState.PAUSED : PState.CUED;
    // Twitch has no buffering state, so a clock that stops moving while playing counts as buffering.
    const t = p.getCurrentTime?.() ?? 0;
    const now = performance.now();
    if (t !== this.lastT) { this.lastT = t; this.lastMove = now; }
    return now - this.lastMove > 1200 ? PState.BUFFERING : PState.PLAYING;
  }
  time() { return this.player?.getCurrentTime?.() ?? 0; }
  duration() { return this.live ? 0 : this.player?.getDuration?.() ?? 0; }
  // The Twitch embed has no speed control, so catching up is always a seek.
  rate() { return 1; }
  play() { this.mark('play', 2000); this.player?.play?.(); }
  pause() { this.mark('pause', 2000); this.player?.pause?.(); }
  seek(t) {
    if (this.live) return;
    this.mark('seek', 3000);
    this.player?.seek?.(Math.max(0, t));
  }
  stop() {
    this.key = null;
    this.ready = false;
    this.mark('pause', 1500);
    this.player?.pause?.();
  }
}
