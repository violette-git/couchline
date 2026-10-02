// The shared player interface. Every source that plays inside the video box implements it,
// so the sync loop in app.js drives YouTube, Vimeo, Twitch, and plain video files the same way.
// Shape adapted from WatchParty's src/components/App/Player.ts (MIT, Copyright (c) 2020 Howard Chung).

// Same numbers as YouTube's player states, which the sync loop was first written against.
export const PState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export class Player {
  constructor(slot) {
    this.el = document.createElement('div');
    this.el.className = 'player';
    this.el.hidden = true;
    slot.append(this.el);
    this.ready = false; // true once load() has something the loop can drive
    this.key = null; // id of the room item that is loaded
    this.fineRates = false; // can it nudge speed by a few percent to catch up?
    this.live = false; // live streams have no timeline, so there is nothing to seek
    this.tapThrough = true; // iPhone "tap once to start" goes to the embed itself
    this.ownControls = false; // true when the embed's own buttons stay usable (nothing laid over it)
    this.error = null; // a message to show over the video when something is wrong
  }

  show(on) { this.el.hidden = !on; }

  // Shows the item paused at "start" seconds. Must set this.key = item.id.
  load(_item, _start) {}
  // One of PState.
  state() { return PState.UNSTARTED; }
  // Seconds. Read every tick, so it must be cheap and synchronous.
  time() { return 0; }
  duration() { return 0; }
  rate() { return 1; }
  setRate(_r) {}
  // Called once playback starts, for players that only learn their speed options then.
  checkRates() {}
  play() {}
  pause() {}
  seek(_t) {}
  // Stops and unloads, so audio can't keep going while another item is on.
  stop() {}
}

const scripts = new Map();
// Loads a third-party SDK once. Resolves when check() finds what the script defines.
export function loadScript(src, check) {
  if (check()) return Promise.resolve();
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => (check() ? resolve() : reject(new Error(`${src} loaded without its API`)));
      s.onerror = () => { scripts.delete(src); reject(new Error(`Could not load ${src}`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}
