// Battleship: two hidden fleets on 10 by 10 waters. Take turns firing; a hit fires again.
// Each fleet stays secret until a ship sinks (or the game ends).
import { Nope, int, nextPlayer } from './util.js';

export const SIZE = 10;
export const FLEET = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

// Places every ship at random without overlapping. Returns [{ name, size, cells, sunk }].
export function placeFleet(rng) {
  const taken = new Set();
  return FLEET.map(({ name, size }) => {
    for (;;) {
      const across = rng() < 0.5;
      const r = Math.floor(rng() * (across ? SIZE : SIZE - size + 1));
      const c = Math.floor(rng() * (across ? SIZE - size + 1 : SIZE));
      const cells = Array.from({ length: size }, (_, k) => (across ? r * SIZE + c + k : (r + k) * SIZE + c));
      if (cells.some((i) => taken.has(i))) continue;
      for (const i of cells) taken.add(i);
      return { name, size, cells, sunk: false };
    }
  });
}

const other = (players, id) => players.find((p) => p.id !== id).id;

export default {
  setup({ players, rng }) {
    return {
      // shots[id]: what has been fired at id's waters, per square: 0 not yet, 1 miss, 2 hit.
      fleets: Object.fromEntries(players.map((p) => [p.id, placeFleet(rng)])),
      shots: Object.fromEntries(players.map((p) => [p.id, Array(SIZE * SIZE).fill(0)])),
      fired: 0, turn: players[0].id, last: null, result: null,
    };
  },
  move(s, by, m, ctx) {
    if (m?.shuffle === true) {
      if (s.fired) throw new Nope('The shooting has started. Your fleet stays where it is.');
      s.fleets[by] = placeFleet(ctx.rng);
      return;
    }
    if (s.turn !== by) throw new Nope('It’s not your turn.');
    const at = int(m?.at, 0, SIZE * SIZE - 1);
    if (at == null) throw new Nope('Pick a square to fire at.');
    const foe = other(ctx.players, by);
    const board = s.shots[foe];
    if (board[at]) throw new Nope('You already fired there.');
    const ship = s.fleets[foe].find((sh) => sh.cells.includes(at));
    board[at] = ship ? 2 : 1;
    s.fired++;
    s.last = { by, at, hit: !!ship, sunk: null };
    if (!ship) { s.turn = nextPlayer(ctx.players, by); return; }
    if (ship.cells.every((i) => board[i] === 2)) {
      ship.sunk = true;
      s.last.sunk = ship.name;
      const names = Object.fromEntries(ctx.players.map((p) => [p.id, p.name]));
      ctx.say(`${names[by]} sank ${names[foe]}’s ${ship.name.toLowerCase()}`, by);
      if (s.fleets[foe].every((sh) => sh.sunk)) s.result = { winners: [by], text: `${names[by]} sank the whole fleet` };
    }
  },
  // Your own fleet in full; the other fleet only as ships sink, or all of it once it's over.
  view(s, viewer, players) {
    const boards = players.map((p) => {
      const open = p.id === viewer || !!s.result;
      return {
        id: p.id,
        shots: s.shots[p.id],
        ships: s.fleets[p.id].filter((sh) => open || sh.sunk),
        afloat: s.fleets[p.id].filter((sh) => !sh.sunk).length,
        sunk: s.fleets[p.id].filter((sh) => sh.sunk).map((sh) => sh.name),
      };
    });
    return { boards, fired: s.fired, last: s.last };
  },
};
