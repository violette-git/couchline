// Vimeo player, using Vimeo's official Player.js SDK.
// Player.js answers every question with a promise, but the sync loop reads the player
// several times a second, so this keeps a local copy of the state from Vimeo's events
// and estimates the current time between timeupdate events.
// Note: hiding Vimeo's own controls only works on videos whose owner pays for Vimeo,
// and so does changing playback speed. Other videos fall back to seek-only catch-up.
import { Player, PState, loadScript } from './player.js';

const SDK = 'https://player.vimeo.com/api/player.js';

export class VimeoPlayer extends Player {
  constructor(slot) {
    super(slot);
    this.mount = document.createElement('div');
    this.el.append(this.mount);
    this.reset();
  }

  reset() {
    this.s = { state: PState.UNSTARTED, seconds: 0, at: performance.now(), duration: 0, rate: 1 };
    this.ratesChecked = false;
  }

  async load(item, start = 0) {
    this.key = item.id;
    this.fineRates = false;
    this.ready = false;
    this.error = null;
    this.reset();
    const key = item.id;
    try {
      await loadScript(SDK, () => window.Vimeo?.Player);
      if (!this.player) {
        this.player = new window.Vimeo.Player(this.mount, {
          url: item.url, controls: false, playsinline: true, dnt: true, autopause: false,
          autoplay: false, title: false, byline: false, portrait: false, keyboard: false,
        });
        this.bind();
        await this.player.ready();
      } else {
        await this.player.loadVideo(item.url);
      }
      if (this.key !== key) return; // another item was put on while this one loaded
      if (start) await this.player.setCurrentTime(start);
      this.s = { ...this.s, state: PState.CUED, seconds: start, at: performance.now() };
      this.s.duration = await this.player.getDuration();
      this.ready = true;
    } catch (err) {
      if (this.key === key) this.error = 'This Vimeo video can’t be played here. It may be private or blocked from embedding.';
      console.warn('vimeo', err);
    }
  }

  bind() {
    const p = this.player;
    const set = (patch) => { this.s = { ...this.s, ...patch }; };
    p.on('timeupdate', (d) => set({ seconds: d.seconds, duration: d.duration || this.s.duration, at: performance.now() }));
    p.on('play', () => set({ state: PState.PLAYING, at: performance.now() }));
    p.on('playing', () => set({ state: PState.PLAYING, at: performance.now() }));
    p.on('pause', (d) => set({ state: PState.PAUSED, seconds: d?.seconds ?? this.s.seconds, at: performance.now() }));
    p.on('ended', () => set({ state: PState.ENDED }));
    p.on('bufferstart', () => { if (this.s.state === PState.PLAYING) set({ state: PState.BUFFERING }); });
    p.on('bufferend', () => { if (this.s.state === PState.BUFFERING) set({ state: PState.PLAYING, at: performance.now() }); });
    p.on('seeked', (d) => set({ seconds: d.seconds, at: performance.now() }));
    p.on('playbackratechange', (d) => set({ rate: d.playbackRate }));
  }

  state() { return this.s.state; }
  time() {
    const { state, seconds, at, rate } = this.s;
    return state === PState.PLAYING ? seconds + ((performance.now() - at) / 1000) * rate : seconds;
  }
  duration() { return this.s.duration || 0; }
  rate() { return this.s.rate; }

  // Speed changes only work on some videos, so try one small change and see if Vimeo accepts it.
  checkRates() {
    if (this.ratesChecked || !this.player) return;
    this.ratesChecked = true;
    this.player.setPlaybackRate(1.05).then(() => { this.fineRates = true; }).catch(() => { this.fineRates = false; });
  }
  setRate(r) {
    if (!this.player || (!this.fineRates && r !== 1)) return;
    this.player.setPlaybackRate(r).catch(() => { this.fineRates = false; });
  }

  play() {
    // Stays CUED if the browser blocks it, which makes the app ask for one tap.
    this.player?.play().catch(() => {});
  }
  pause() { this.player?.pause().catch(() => {}); }
  seek(t) {
    if (!this.player) return;
    this.s = { ...this.s, seconds: Math.max(0, t), at: performance.now() };
    this.player.setCurrentTime(Math.max(0, t)).catch(() => {});
  }
  stop() {
    this.key = null;
    this.ready = false;
    this.player?.unload().catch(() => {});
    this.reset();
  }
}
