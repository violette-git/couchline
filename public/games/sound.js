// Little sounds for games, made on the spot with Web Audio (no files to download). Kept soft
// and short so they sit under the call: a tap for every button, a thud when a move isn't
// allowed, a chime when it's your turn, and short tunes to start and finish. Muting is
// remembered on this device.
import { store } from '../ui.js';

const KEY = 'gameSound';
let ctx = null;
let master = null;
let muted = store.get(KEY, false);

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// One note: a frequency (or a slide between two), a shape, a length, and a soft envelope.
function note(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.12, slide = null, attack = 0.005 } = {}) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, G4 = 392, Eb4 = 311.13, C4 = 261.63;
const wobble = () => 1 + (Math.random() - 0.5) * 0.08; // so repeated taps don't sound like a machine

const SOUNDS = {
  tap() { note(1250 * wobble(), { dur: 0.05, type: 'triangle', gain: 0.07, slide: 900 }); },
  nope() {
    note(196, { dur: 0.11, type: 'square', gain: 0.035 });
    note(165, { at: 0.09, dur: 0.14, type: 'square', gain: 0.035 });
  },
  turn() {
    note(E5, { dur: 0.22, gain: 0.08, attack: 0.01 });
    note(A5, { at: 0.11, dur: 0.32, gain: 0.08, attack: 0.01 });
  },
  start() { [C5, E5, G5].forEach((f, i) => note(f, { at: i * 0.08, dur: 0.2, type: 'triangle', gain: 0.08 })); },
  win() {
    [C5, E5, G5, C6].forEach((f, i) => note(f, { at: i * 0.09, dur: 0.3, type: 'triangle', gain: 0.09 }));
    note(C6 * 2, { at: 0.36, dur: 0.5, gain: 0.03, attack: 0.02 });
  },
  lose() { [G4, Eb4, C4].forEach((f, i) => note(f, { at: i * 0.14, dur: 0.32, type: 'triangle', gain: 0.07, attack: 0.01 })); },
  end() { [G5, C5].forEach((f, i) => note(f, { at: i * 0.12, dur: 0.25, type: 'triangle', gain: 0.06 })); },
  tick() { note(1800, { dur: 0.03, type: 'square', gain: 0.025 }); },
};

export const sound = {
  play(name) {
    if (muted || document.hidden || !SOUNDS[name] || !audio()) return;
    try { SOUNDS[name](); } catch { /* audio not available right now */ }
  },
  get muted() { return muted; },
  setMuted(on) {
    muted = !!on;
    store.set(KEY, muted);
    if (!muted) sound.play('tap');
  },
};
