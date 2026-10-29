// Little sounds, made on the spot with Web Audio (no files to download), kept soft and short
// so they sit under the call and the show. Two kinds, each switched off on its own and
// remembered on this device:
//   games  a tap for every button, a thud when a move isn't allowed, a chime when it's your
//          turn, and short tunes to start and finish
//   chat   a soft note when someone else sends a message (brighter when it names you). These
//          play in a background tab too, since that's when you'd miss a message.
import { store } from './ui.js';

const KEYS = { games: 'gameSound', chat: 'chatSound' };
let ctx = null;
let master = null;
const muted = { games: store.get(KEYS.games, false), chat: store.get(KEYS.chat, false) };

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
  message() {
    note(G5, { dur: 0.16, gain: 0.07, attack: 0.008 });
    note(C6, { at: 0.08, dur: 0.24, gain: 0.07, attack: 0.008 });
  },
  mention() { [C6, E5 * 2, G5 * 2].forEach((f, i) => note(f, { at: i * 0.07, dur: 0.26, type: 'triangle', gain: 0.07 })); },
};

export const sound = {
  // Game sounds stay quiet in a background tab; pass background for ones that shouldn't.
  play(name, { kind = 'games', background = false } = {}) {
    if (muted[kind] || (document.hidden && !background) || !SOUNDS[name] || !audio()) return;
    try { SOUNDS[name](); } catch { /* audio not available right now */ }
  },
  isMuted: (kind = 'games') => muted[kind],
  setMuted(kind, on) {
    muted[kind] = !!on;
    store.set(KEYS[kind], muted[kind]);
    if (!muted[kind]) sound.play(kind === 'chat' ? 'message' : 'tap', { kind });
  },
  // Browsers only let a page make sound after someone taps it, so start audio on a tap
  // (entering the room is one). Then a message can chime even while the tab is in the back.
  prime() {
    audio();
    for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => audio(), { once: true, capture: true });
  },
};
