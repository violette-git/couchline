// Plain video player for direct links (.mp4, .webm, .m3u8), for Jellyfin and Plex,
// which both hand out HLS (.m3u8) streams, and for files on the person's own device.
// Local files come from resolveLocal, which the app points at public/share.js. Safari plays HLS on its own; other browsers
// get hls.js, served by Couchline from node_modules at /vendor/hls/.
import { Player, PState, loadScript } from './player.js';

const HLS_SRC = '/vendor/hls/hls.min.js';
const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

// Jellyfin and Plex each run one conversion job per playback session. Giving every viewer
// their own session id keeps one person's seek from restarting the other person's stream.
function withSession(item) {
  const id = randomHex();
  const sep = item.src.includes('?') ? '&' : '?';
  if (item.kind === 'jellyfin') return `${item.src}${sep}PlaySessionId=${id}&DeviceId=couchline-${id}`;
  if (item.kind === 'plex' && item.format === 'hls') return `${item.src}${sep}session=${id}&X-Plex-Client-Identifier=couchline-${id}`;
  return item.src;
}

export class FilePlayer extends Player {
  constructor(slot) {
    super(slot);
    this.tapThrough = false; // a bare <video> has no button of its own to tap
    this.fineRates = true;
    const v = document.createElement('video');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    this.video = v;
    this.el.append(v);
    this.src = null;
    this.objectUrl = null;
    this.blocked = false;
    this.startAt = 0;
    this.resolveLocal = null; // (item) -> File, or null when this device doesn't have it yet
    v.addEventListener('loadedmetadata', () => {
      if (this.startAt) v.currentTime = this.startAt;
      this.startAt = 0;
      this.live = v.duration === Infinity;
    });
    v.addEventListener('playing', () => { this.blocked = false; });
    v.addEventListener('error', () => { if (this.src) this.fail(); });
  }

  fail() {
    this.error = 'This video couldn’t be played. The link may have expired, need a sign-in, or use a format browsers can’t play.';
  }

  async load(item, start = 0) {
    this.teardown();
    this.key = item.id;
    this.error = null;
    this.live = false;
    this.startAt = start;
    const key = item.id;
    if (item.kind === 'local') {
      const file = this.resolveLocal?.(item);
      if (!file) return; // stays not ready; the app asks the person for the file
      this.objectUrl = URL.createObjectURL(file);
    }
    const src = item.kind === 'local' ? this.objectUrl : item.kind === 'file' ? item.url : withSession(item);
    this.src = src;
    const v = this.video;
    if (item.format === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
      try {
        await loadScript(HLS_SRC, () => window.Hls);
      } catch {
        this.error = 'Couldn’t load the streaming player.';
        return;
      }
      if (this.key !== key) return;
      if (!window.Hls.isSupported()) { this.error = 'This browser can’t play streaming video.'; return; }
      this.hls = new window.Hls({ startPosition: start || -1 });
      this.hls.on(window.Hls.Events.ERROR, (_e, data) => { if (data.fatal) this.fail(); });
      this.hls.loadSource(src);
      this.hls.attachMedia(v);
    } else {
      v.src = src;
    }
    this.ready = true;
  }

  teardown() {
    this.hls?.destroy();
    this.hls = null;
    this.src = null;
    this.ready = false;
    this.blocked = false;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  state() {
    const v = this.video;
    if (!this.src || this.error) return PState.UNSTARTED;
    if (this.blocked) return PState.CUED;
    if (v.ended) return PState.ENDED;
    if (v.paused) return v.readyState >= 1 ? PState.PAUSED : PState.CUED;
    if (v.readyState < 3 || v.seeking) return PState.BUFFERING;
    return PState.PLAYING;
  }
  time() { return this.video.currentTime || this.startAt || 0; }
  duration() { return Number.isFinite(this.video.duration) ? this.video.duration : 0; }
  rate() { return this.video.playbackRate; }
  setRate(r) { this.video.playbackRate = r; }
  play() {
    // iPhones refuse to start sound without a tap. Then this reports CUED and the app asks for one.
    this.video.play()?.catch((err) => { if (err?.name === 'NotAllowedError') this.blocked = true; });
  }
  pause() { this.video.pause(); }
  seek(t) {
    t = Math.max(0, t);
    if (this.video.readyState >= 1) this.video.currentTime = t;
    else this.startAt = t;
  }
  stop() {
    this.teardown();
    this.key = null;
  }
}
