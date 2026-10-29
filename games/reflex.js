// Fastest Finger: wait for green, then tap. The wait is random and lives only in the server’s
// timer, so no page can know when green is coming. Network delay differs per person, so each
// page times its own reaction from the moment its screen turned green and sends that.
import { Nope, topScorers } from './util.js';

const MIN_WAIT = 1500;
const MAX_WAIT = 5000;
const WINDOW = 3000; // how long green lasts
const SHOW = 2500; // the results between rounds
const TOO_FAST = 80; // no human reacts faster, so a tap under this was a guess

function wait(s, ctx) {
  s.phase = 'wait';
  s.taps = {};
  s.deadline = null;
  ctx.timer(MIN_WAIT + Math.floor(ctx.rng() * (MAX_WAIT - MIN_WAIT)), green);
}

function green(s, ctx) {
  s.phase = 'go';
  s.deadline = ctx.now() + WINDOW;
  if (!stillIn(s, ctx).length) return endRound(s, ctx);
  ctx.timer(WINDOW, endRound);
}

const stillIn = (s, ctx) => ctx.players.filter((p) => s.taps[p.id] == null);

function endRound(s, ctx) {
  const times = Object.entries(s.taps).filter(([, t]) => typeof t === 'number');
  const best = times.length ? Math.min(...times.map(([, t]) => t)) : null;
  const winners = times.filter(([, t]) => t === best).map(([id]) => id);
  for (const id of winners) s.wins[id]++;
  s.last = { round: s.round, taps: s.taps, winners };
  s.phase = 'results';
  s.deadline = null;
  if (s.round >= s.rounds) {
    ctx.clearTimer();
    const top = topScorers(s.wins);
    s.result = s.wins[top[0]] ? { winners: top } : { winners: [], text: 'Nobody won a round' };
    return;
  }
  s.deadline = ctx.now() + SHOW;
  ctx.timer(SHOW, (st, c) => {
    st.round++;
    wait(st, c);
  });
}

export default {
  setup({ players, options }, ctx) {
    const s = {
      rounds: options.rounds, round: 1, phase: 'wait', taps: {}, last: null,
      wins: Object.fromEntries(players.map((p) => [p.id, 0])), turn: null, deadline: null, result: null,
    };
    wait(s, ctx);
    return s;
  },
  move(s, by, m, ctx) {
    if (s.phase === 'results') throw new Nope('Get ready for the next round.');
    if (s.taps[by] != null) throw new Nope(s.taps[by] === 'early' ? 'Too early. You’re out this round.' : 'You’ve tapped. Waiting on the others.');
    if (m?.early || s.phase === 'wait') {
      s.taps[by] = 'early';
    } else {
      const ms = typeof m?.tap === 'number' && Number.isFinite(m.tap) ? Math.round(m.tap) : null;
      if (ms == null) throw new Nope('Tap when it turns green.');
      s.taps[by] = ms < TOO_FAST ? 'early' : Math.min(ms, WINDOW);
    }
    // Everyone has tapped (or jumped the gun): no need to wait out the clock.
    if (!stillIn(s, ctx).length) endRound(s, ctx);
  },
};
