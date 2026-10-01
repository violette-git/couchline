// Copied from public/sync.js by scripts/build-extension.js. Edit the original, then run npm run build:ext.
// Clock sync and drift correction.

// Estimates the gap between this device's clock and the server's, using the
// lowest round-trip sample from a burst of pings (NTP-style).
export class Clock {
  constructor(socket) {
    this.socket = socket;
    this.offset = 0;
    setInterval(() => this.calibrate(3), 60000);
  }

  ping() {
    return new Promise((resolve) => {
      const t0 = Date.now();
      this.socket.timeout(4000).emit('time:ping', (err, serverNow) => {
        if (err || typeof serverNow !== 'number') return resolve(null);
        const t1 = Date.now();
        resolve({ rtt: t1 - t0, offset: serverNow - (t0 + t1) / 2 });
      });
    });
  }

  async calibrate(samples = 5) {
    let best = null;
    for (let i = 0; i < samples; i++) {
      const s = await this.ping();
      if (s && (!best || s.rtt < best.rtt)) best = s;
    }
    if (best) this.offset = best.offset;
  }

  now() {
    return Date.now() + this.offset;
  }
}

// Where the shared video should be right now, in seconds.
export function expectedPosition(playback, serverNow) {
  if (!playback.playing) return playback.position;
  return playback.position + Math.max(0, serverNow - playback.at) / 1000;
}

// drift = local time minus expected time, in seconds (negative means behind).
// Small drift is fixed by speeding up or slowing down slightly, using WatchParty's
// rule of +0.01 playback rate per 100ms behind, capped at 1.1 (MIT, Howard Chung).
// Big drift, or players that can't do fine rates, get a hard seek.
export function correction(drift, { fineRates = true, settling = false } = {}) {
  const gap = Math.abs(drift);
  if (settling) return { rate: 1 };
  if (gap > 1.5 || (!fineRates && gap > 0.8)) return { seek: true };
  if (!fineRates || gap <= 0.3) return { rate: 1 };
  const step = Number((gap / 10).toFixed(2));
  return { rate: drift < 0 ? Math.min(1.1, 1 + step) : Math.max(0.9, 1 - step) };
}

export function fmt(s) {
  if (!Number.isFinite(s)) return '0:00';
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
