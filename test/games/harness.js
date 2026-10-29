// Plays a game's rules directly, without a server, for the per-game tests in this folder.
//   const g = play('connect4', 2);           // players p1, p2 (ids 'p1', 'p2')
//   g.move('p1', { col: 3 });               // throws if the rules refuse
//   g.refused('p2', { col: 9 });            // asserts the rules refuse it, returns the message
//   g.view('p2');                           // what p2's browser would get
//   g.fire();                               // runs the pending timer now, if any
import assert from 'node:assert/strict';
import { RULES } from '../../games/index.js';
import { GAME, defaultOptions } from '../../public/games/catalog.js';
import { Nope } from '../../games/util.js';

const COLORS = ['lamp', 'rose', 'sky', 'mint', 'lilac', 'lime', 'orchid', 'iris'];

export function play(id, n = 2, options = {}, { rng = Math.random } = {}) {
  const rules = RULES[id];
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: COLORS[i] }));
  let pending = null;
  const said = [];
  const ctx = {
    players,
    rng,
    now: () => Date.now(),
    timer(ms, fn) { pending = { ms, fn }; },
    clearTimer() { pending = null; },
    say(text) { said.push(text); },
  };
  const g = {
    rules, players, ctx, said,
    state: rules.setup({ players, options: { ...defaultOptions(GAME[id]), ...options }, rng, round: 1 }, ctx),
    move(by, m) { return rules.move(g.state, by, m, ctx); },
    refused(by, m) {
      try { rules.move(g.state, by, m, ctx); } catch (err) {
        assert.ok(err instanceof Nope, `expected a Nope, got ${err}`);
        return err.message;
      }
      assert.fail(`${id}: expected ${JSON.stringify(m)} from ${by} to be refused`);
    },
    // Round-trips through JSON, like the real thing, so nothing unsendable hides in state.
    view(by) { return JSON.parse(JSON.stringify(rules.view ? rules.view(g.state, by, players) : g.state)); },
    get timer() { return pending; },
    fire() {
      const t = pending;
      assert.ok(t, `${id}: no timer pending`);
      pending = null;
      t.fn(g.state, ctx);
    },
    join(player) {
      players.push(player);
      rules.join?.(g.state, player, ctx);
    },
  };
  return g;
}
