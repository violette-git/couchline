// Games in a room. The server is the referee: it keeps each game's state, checks every move
// against the game's rules, and sends each person only what they're allowed to see (so a
// hidden word or fleet never reaches anyone's browser).
//
// A game goes lobby -> play. In the lobby people take a seat and pick options; Start deals
// everyone in. When the rules set state.result the game is over, wins are counted, and
// anyone can play again with the same seats, go back to the lobby, or close it.
import crypto from 'node:crypto';
import { GAME, defaultOptions } from '../public/games/catalog.js';
import { RULES } from './index.js';
import { Nope } from './util.js';

const newId = () => crypto.randomBytes(6).toString('hex');
const SCORES_MAX = 40;

export function createGames({ io, toast, broadcast, onOpen = () => {} }) {
  const seat = (m) => ({ id: m.id, name: m.name, color: m.color });

  // What one person sees of the game.
  function viewFor(room, viewerId) {
    const g = room.game;
    if (!g) return null;
    const out = {
      id: g.id, type: g.type, phase: g.phase, host: g.host, options: g.options, round: g.round,
      seats: g.seats.map((id) => room.members.get(id)).filter(Boolean).map(seat),
      players: g.players.map((p) => ({ ...p, here: room.members.has(p.id) })),
    };
    if (g.phase === 'play') {
      const rules = RULES[g.type];
      out.view = rules.view ? rules.view(g.state, viewerId, g.players) : g.state;
      out.turn = g.state.turn ?? null;
      out.result = g.state.result ?? null;
      out.deadline = g.state.deadline ?? null;
    }
    return out;
  }

  function send(room, onlyId = null) {
    for (const m of room.members.values()) {
      if (!onlyId || m.id === onlyId) io.to(m.socketId).emit('game', viewFor(room, m.id));
    }
  }

  function clearTimer(room) {
    clearTimeout(room.gameTimer);
    room.gameTimer = null;
  }

  // What the rules get alongside the state: the players, randomness, a clock, one timer at a
  // time (for rounds and countdowns), and a way to tell the room something.
  function ctxFor(room) {
    const g = room.game;
    return {
      players: g.players,
      rng: Math.random,
      now: () => Date.now(),
      timer(ms, fn) {
        clearTimer(room);
        const gameId = g.id;
        room.gameTimer = setTimeout(() => {
          room.gameTimer = null;
          if (room.game?.id !== gameId || room.game.phase !== 'play' || room.game.state.result) return;
          try {
            fn(room.game.state, ctxFor(room));
          } catch (err) {
            console.error(`game ${g.type} timer`, err);
          }
          changed(room);
        }, Math.max(0, ms));
      },
      clearTimer: () => clearTimer(room),
      say(msg, byId = null) {
        toast(room, msg, room.members.get(byId) || null);
      },
    };
  }

  // After any change: if the game just ended, count wins and tell the room.
  function changed(room) {
    const g = room.game;
    if (g?.phase === 'play' && g.state.result && !g.counted) {
      g.counted = true;
      clearTimer(room);
      const r = g.state.result;
      const meta = GAME[g.type];
      if (!r.text) {
        const names = (r.winners || []).map((id) => g.players.find((p) => p.id === id)?.name).filter(Boolean);
        r.text = meta.coop ? (r.winners?.length ? 'You did it!' : 'Not this time.') : names.length === 1 ? `${names[0]} wins` : names.length ? `${names.join(' and ')} win` : 'A draw';
      }
      if (!meta.coop) {
        for (const id of r.winners || []) {
          const p = g.players.find((x) => x.id === id);
          if (!p) continue;
          const s = room.gameScores[id] || (room.gameScores[id] = { id, name: p.name, color: p.color, wins: 0 });
          s.name = p.name;
          s.wins++;
        }
        const ids = Object.keys(room.gameScores);
        if (ids.length > SCORES_MAX) delete room.gameScores[ids[0]];
      }
      toast(room, `${meta.name}: ${r.text}`);
      broadcast(room);
    }
    send(room);
  }

  function start(room, players) {
    const g = room.game;
    const rules = RULES[g.type];
    g.players = players;
    g.phase = 'play';
    g.counted = false;
    g.round = (g.round || 0) + 1;
    clearTimer(room);
    g.state = rules.setup({ players, options: g.options, rng: Math.random, round: g.round }, ctxFor(room));
    broadcast(room); // the room's summary (in the Games tab) says it's on now
  }

  const isPlayer = (room, id) => !!room.game?.players.some((p) => p.id === id);
  const playing = (room) => room.game?.phase === 'play' && !room.game.state.result;
  // Runs a rules call, turning a Nope into a message for the person and anything else into a logged bug.
  function attempt(type, fn, cb) {
    try {
      return { ok: true, value: fn() };
    } catch (err) {
      if (err instanceof Nope) cb({ error: err.message });
      else { console.error(`game ${type}`, err); cb({ error: 'That didn’t work. Try again.' }); }
      return { ok: false };
    }
  }

  const handlers = {
    // Pick a game: everyone's screen goes to its lobby. People from the last game keep their seats.
    'game:open'(room, me, d, cb) {
      const meta = GAME[d.type];
      if (!meta) return cb({ error: 'That game isn’t here.' });
      if (playing(room) && !isPlayer(room, me.id) && room.game.players.some((p) => room.members.has(p.id))) {
        return cb({ error: `${GAME[room.game.type].name} is still going. Only its players can change the game.` });
      }
      const before = room.game;
      const keep = before ? [me.id, ...(before.phase === 'play' ? before.players.map((p) => p.id) : before.seats)] : [me.id];
      clearTimer(room);
      room.game = {
        id: newId(), type: meta.id, phase: 'lobby', host: me.id, options: defaultOptions(meta), round: 0,
        seats: [...new Set(keep)].filter((id) => room.members.has(id)).slice(0, meta.max), players: [], state: null,
      };
      onOpen(room, me);
      broadcast(room);
      send(room);
      toast(room, `${me.name} picked ${meta.name}`, me);
      cb({ ok: true });
    },
    // Take or leave a seat. Games that allow it take new players mid-game.
    'game:seat'(room, me, d, cb) {
      const g = room.game;
      if (!g) return cb({ error: 'No game is open.' });
      const meta = GAME[g.type];
      if (g.phase === 'lobby') {
        if (d.on) {
          if (g.seats.includes(me.id)) return cb({ ok: true });
          if (g.seats.length >= meta.max) return cb({ error: `${meta.name} is for ${meta.max} players, and the seats are taken.` });
          g.seats.push(me.id);
        } else {
          g.seats = g.seats.filter((id) => id !== me.id);
        }
        send(room);
        return cb({ ok: true });
      }
      if (!d.on || isPlayer(room, me.id)) return cb({ ok: true });
      if (!meta.lateJoin || !playing(room)) return cb({ error: 'This game has started. Join the next one.' });
      if (g.players.length >= meta.max) return cb({ error: 'This game is full.' });
      const rules = RULES[g.type];
      const r = attempt(g.type, () => {
        g.players.push(seat(me));
        rules.join?.(g.state, seat(me), ctxFor(room));
      }, cb);
      if (!r.ok) { g.players = g.players.filter((p) => p.id !== me.id); return; }
      changed(room);
      toast(room, `${me.name} joined ${meta.name}`, me);
      cb({ ok: true });
    },
    'game:option'(room, me, d, cb) {
      const g = room.game;
      if (g?.phase !== 'lobby') return cb({ error: 'Options are set before starting.' });
      const opt = GAME[g.type].options?.find((o) => o.key === d.key);
      const choice = opt?.choices.find((c) => c.value === d.value);
      if (!choice) return cb({ error: 'That isn’t one of the choices.' });
      g.options[opt.key] = choice.value;
      send(room);
      cb({ ok: true });
    },
    'game:start'(room, me, _d, cb) {
      const g = room.game;
      if (g?.phase !== 'lobby') return cb({ error: 'No game is waiting to start.' });
      const meta = GAME[g.type];
      if (!g.seats.includes(me.id)) return cb({ error: 'Take a seat to start the game.' });
      const players = g.seats.map((id) => room.members.get(id)).filter(Boolean).map(seat);
      if (players.length < meta.min) return cb({ error: `${meta.name} needs ${meta.min} players.` });
      if (!attempt(g.type, () => start(room, players), cb).ok) { g.phase = 'lobby'; g.state = null; return; }
      changed(room);
      toast(room, `${me.name} started ${meta.name}`, me);
      cb({ ok: true });
    },
    'game:move'(room, me, d, cb) {
      const g = room.game;
      if (!playing(room)) return cb({ error: 'The game is over.' });
      if (!isPlayer(room, me.id)) return cb({ error: GAME[g.type].lateJoin ? 'Join the game to play.' : 'You’re watching this one.' });
      const r = attempt(g.type, () => RULES[g.type].move(g.state, me.id, d.move ?? null, ctxFor(room)), cb);
      if (!r.ok) return;
      // Quick, small moves (like drawing strokes) go straight to everyone instead of resending the game.
      if (r.value?.relay !== undefined) io.to(room.id).emit('game:relay', { gameId: g.id, by: me.id, data: r.value.relay });
      if (!r.value?.quiet) changed(room);
      cb({ ok: true });
    },
    // The same game again with the same players; whoever went first goes last this time.
    'game:again'(room, me, _d, cb) {
      const g = room.game;
      if (g?.phase !== 'play') return cb({ error: 'No game to play again.' });
      if (!isPlayer(room, me.id)) return cb({ error: 'Only the players can start another round.' });
      if (playing(room)) return cb({ error: 'Finish this one first, or end it.' });
      const here = g.players.filter((p) => room.members.has(p.id));
      const players = [...here.slice(1), ...here.slice(0, 1)];
      if (players.length < GAME[g.type].min) return cb({ error: 'Not enough players are still here. Back to the lobby to find more.' });
      if (!attempt(g.type, () => start(room, players), cb).ok) return;
      changed(room);
      toast(room, `${me.name} started another round of ${GAME[g.type].name}`, me);
      cb({ ok: true });
    },
    // Back to the lobby, keeping the seats, to change options or who's playing.
    'game:lobby'(room, me, _d, cb) {
      const g = room.game;
      if (!g || g.phase !== 'play') return cb({ ok: true });
      if (playing(room) && !isPlayer(room, me.id)) return cb({ error: 'Only the players can stop the game.' });
      clearTimer(room);
      g.seats = g.players.map((p) => p.id).filter((id) => room.members.has(id));
      g.phase = 'lobby';
      g.state = null;
      g.players = [];
      broadcast(room);
      send(room);
      cb({ ok: true });
    },
    'game:close'(room, me, _d, cb) {
      const g = room.game;
      if (!g) return cb({ ok: true });
      const wasOn = playing(room);
      if (wasOn && !isPlayer(room, me.id) && g.players.some((p) => room.members.has(p.id))) return cb({ error: 'Only the players can end the game.' });
      clearTimer(room);
      room.game = null;
      broadcast(room);
      send(room);
      toast(room, wasOn ? `${me.name} ended ${GAME[g.type].name}` : `${me.name} closed ${GAME[g.type].name}`, me);
      cb({ ok: true });
    },
  };

  return {
    handlers,
    send,
    // Someone left the room: free their lobby seat. A game nobody is playing anymore closes.
    left(room, id) {
      const g = room.game;
      if (!g) return;
      if (g.phase === 'lobby') g.seats = g.seats.filter((x) => x !== id);
      if (g.phase === 'play' && !g.players.some((p) => room.members.has(p.id))) {
        clearTimer(room);
        room.game = null;
      }
      send(room);
    },
    clear: clearTimer,
    // For the room's shared state: which game is open, and wins so far.
    summary(room) {
      const g = room.game;
      return {
        open: g ? { type: g.type, phase: g.phase, over: g.phase === 'play' && !!g.state.result } : null,
        scores: Object.values(room.gameScores || {}).filter((s) => s.wins).sort((a, b) => b.wins - a.wins),
      };
    },
  };
}
