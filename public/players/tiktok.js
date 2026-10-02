// TikTok player, using TikTok's official embed player (www.tiktok.com/player/v1/ID).
// It's driven with postMessage: we send play, pause, seekTo, and it reports its state and
// current time, which is kept here and estimated between reports (like the Vimeo player).
// TikTok's own controls are hidden so every play, pause, and seek goes through the room.
import { Player, PState } from './player.js';

const ORIGIN = 'https://www.tiktok.com';
const PARAMS = new URLSearchParams({
  controls: 0, progress_bar: 0, play_button: 0, volume_control: 0, fullscreen_button: 0, timestamp: 0,
  loop: 0, autoplay: 0, music_info: 1, description: 1, rel: 0, native_context_menu: 0, closed_caption: 1,
});
// TikTok's state numbers: -1 starting, 0 ended, 1 playing, 2 paused, 3 buffering.
const STATES = { '-1': PState.CUED, 0: PState.ENDED, 1: PState.PLAYING, 2: PState.PAUSED, 3: PState.BUFFERING };

export class TikTokPlayer extends Player {
  constructor(slot) {
    super(slot);
    this.el.classList.add('player-tiktok');
    this.frame = null;
    this.reset();
    window.addEventListener('message', (e) => this.onMessage(e));
  }

  reset() {
    this.s = { state: PState.UNSTARTED, seconds: 0, at: performance.now(), duration: 0 };
    this.pendingSeek = 0;
  }

  load(item, start = 0) {
    this.key = item.id;
    this.ready = false;
    this.error = null;
    this.reset();
    this.pendingSeek = start;
    this.frame?.remove();
    const f = document.createElement('iframe');
    f.title = 'TikTok video';
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.src = `${ORIGIN}/player/v1/${item.videoId}?${PARAMS}`;
    this.frame = f;
    this.el.append(f);
    // Commands can go as soon as the player page loads. Its "ready" event doesn't always come,
    // so the loop shouldn't wait for it; until TikTok reports a state, it counts as not started
    // (the room then asks for a tap if needed).
    f.addEventListener('load', () => {
      if (this.frame !== f) return;
      this.ready = true;
      if (this.s.state === PState.UNSTARTED) this.s = { ...this.s, state: PState.CUED, at: performance.now() };
      if (this.pendingSeek) this.seek(this.pendingSeek);
    }, { once: true });
  }

  send(type, value) {
    this.frame?.contentWindow?.postMessage({ 'x-tiktok-player': true, type, value }, ORIGIN);
  }

  onMessage(e) {
    if (e.origin !== ORIGIN || !this.frame || e.source !== this.frame.contentWindow) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || !d['x-tiktok-player']) return;
    const now = performance.now();
    if (d.type === 'onPlayerReady') {
      this.ready = true;
      this.error = null;
      if (this.s.state === PState.UNSTARTED) this.s = { ...this.s, state: PState.CUED, at: now };
      if (this.pendingSeek) this.seek(this.pendingSeek);
    } else if (d.type === 'onStateChange') {
      const state = STATES[d.value] ?? this.s.state;
      this.s = { ...this.s, state, seconds: this.time(), at: now };
    } else if (d.type === 'onCurrentTime' && d.value) {
      this.s = { ...this.s, seconds: Number(d.value.currentTime) || 0, duration: Number(d.value.duration) || this.s.duration, at: now };
    } else if (d.type === 'onPlayerError') {
      this.error = 'This TikTok can’t be played here. It may be private or removed.';
    }
  }

  state() { return this.s.state; }
  time() {
    const { state, seconds, at } = this.s;
    return state === PState.PLAYING ? seconds + (performance.now() - at) / 1000 : seconds;
  }
  duration() { return this.s.duration || 0; }
  // No speed control in TikTok's player, so catching up is always a seek.
  rate() { return 1; }
  play() { this.send('play'); }
  pause() { this.send('pause'); }
  seek(t) {
    t = Math.max(0, t);
    this.s = { ...this.s, seconds: t, at: performance.now() };
    this.send('seekTo', t);
  }
  stop() {
    this.key = null;
    this.ready = false;
    this.frame?.remove();
    this.frame = null;
    this.reset();
  }
}
