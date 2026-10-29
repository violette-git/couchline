# Games

Games are played by everyone in a room at once and take over the stage while they're open (the video pauses). The server is the referee: it holds each game's state, checks every move, and sends each person only what they may see. Pages never decide anything; they draw what they're sent and ask for moves.

Each game has four pieces, all named after its id:

| File | What it is |
| --- | --- |
| `public/games/catalog.js` | One entry per game: name, search words, category, player counts, rules text, lobby options, icon. Shared by the server and the page. |
| `games/<id>.js` | The rules, on the server. |
| `public/games/<id>.js` | Draws the game in the browser. |
| `public/games/<id>.css` | The game's own styles. Loaded the first time it's played. |

`games/engine.js` runs the lobby, seats, start, moves, timers, play again, and win counts for every game. `public/games.js` is the page side: the Games tab, the lobby, the bar over the game (players, whose turn, a timer, How to play, End), and the result at the end.

## Rules (`games/<id>.js`)

```js
import { Nope } from './util.js';

export default {
  // Make the starting state. players: [{ id, name, color }] in turn order.
  // options: the lobby choices (defaults from the catalog). rng: () => 0..1.
  setup({ players, options, rng, round }, ctx) { return { turn: players[0].id, result: null, ... }; },

  // Apply one move from player "by". Throw new Nope('message') to refuse it; the message is
  // shown to that person. Change the state in place. Return nothing, or { quiet: true, relay }
  // for small, frequent moves (drawing strokes): relay goes straight to every page and the
  // full state isn't resent.
  move(state, by, move, ctx) {},

  // Optional. What one person sees. Required whenever the state holds anything secret
  // (a hidden word, cards in hand, a fleet, other people's picks). viewer may be a spectator.
  view(state, viewer, players) { return { ... }; },

  // Optional, for catalog entries with lateJoin: add someone mid-game.
  join(state, player, ctx) {},
};
```

Fields the engine reads from the state:

- `turn`: whose turn it is (a player id), or `null` when everyone acts at once. The bar shows it.
- `result`: set it once, when the game ends: `{ winners: [ids], text }`. `winners: []` is a draw (or, for a cooperative game, a loss). `text` is optional; it defaults to "Ana wins", "A draw", "You did it!".
- `deadline`: a server time in ms (`ctx.now() + ms`) to show a countdown in the bar.

`ctx` gives `players`, `rng`, `now()`, `timer(ms, fn)` (one timer per game; a new one replaces the old; `fn(state, ctx)` runs later and everyone gets the new state afterwards), `clearTimer()`, and `say(text, byId)` for a toast to the room.

Everything in the state (or the view) is sent as JSON, so keep it to plain data, and keep it small: it's resent after every move.

`games/util.js` has `Nope`, `shuffle`, `pick`, `int`, `text`, `nextPlayer`, `squash` (for comparing typed answers), `editDistance`, and `topScorers`.

## Drawing (`public/games/<id>.js`)

```js
export default function mount(root, api) {
  return {
    update(game) { ... },     // redraw from game; optionally return a status for the bar
    relay(data, by) { ... },  // optional: a quiet move's relay arrived
    destroy() { ... },        // optional: clean up timers or listeners
  };
}
```

`game` has `view` (what the rules' `view` returned), `players` (`[{ id, name, color, here }]`), `turn`, `result`, `deadline`, `options`, and `round`. The status is a string, or `{ text, color }` where color is a person color or `'me'` (something this person should do now). Return nothing to show whose turn it is.

`api` has `me` (this person's id), `el(tag, attrs, ...children)`, `colorOf(color)`, `send(move)` (returns a promise; refusals are already shown as a toast), `player(id)`, `name(id)` ("You" for this person), `isPlayer()`, `now()` (the server's clock), and `toast(text)`.

`public/games/kit.js` builds the shared pieces styled in `public/games.css`: `die`, `card`, `keyboard`, `scoreboard`, `answerBox`, and `tint` (sets `--c` to a person's color). The stylesheet also has `.g-board` and `.g-cell` (a grid board: set `--cols`, `--rows`, `--size`), `.g-disc`, `.g-choices` and `.g-choice`, `.g-tiles` and `.g-letter`, `.g-hand`, `.g-big`, `.g-note`, `.g-row`, and `.g-actions`.

## House style

- Person colors only ever mean "this person did this": a piece, a mark, a score in someone's color is theirs. Everything else stays neutral.
- Plain, short sentences in UI text, with curly apostrophes (’). No em dashes anywhere (`npm test` checks).
- Phones first: everything fits and works at 360px wide, with tap targets of at least 36px.
- Watchers (people in the room who aren't playing) see the game but can't act on it.

## Tests

`test/games.js` runs the room flow over sockets, then every file in `test/games/`. Those test rules directly with `test/games/harness.js`:

```js
const g = play('connect4', 2);
g.move('p1', { col: 3 });
g.refused('p2', { col: 9 });
g.view('p2');
g.fire(); // runs the pending timer
```
