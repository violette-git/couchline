// Hangman, played together: everyone guesses letters of one hidden word or phrase. Eight
// wrong guesses and the word wins. The word comes from Couchline's lists, or the first
// player types one (with its topic, and a hint if they like) and sits out guessing.
// Once a game, anyone guessing can open the hint: the chooser's, or a free letter.
import { Nope, pick, shuffle, text, squash } from './util.js';

const WORDS = {
  movies: ['Jurassic Park', 'The Matrix', 'Finding Nemo', 'Toy Story', 'Casablanca', 'Jaws', 'Titanic', 'Frozen', 'Inception', 'Gladiator',
    'The Lion King', 'Back to the Future', 'Ghostbusters', 'Rocky', 'Shrek', 'Coco', 'Up', 'Moana', 'Alien', 'Psycho',
    'Breaking Bad', 'The Office', 'Friends', 'Stranger Things', 'Seinfeld', 'The Simpsons', 'Game of Thrones', 'Ted Lasso', 'Succession', 'The Crown',
    'Parks and Recreation', 'Mad Men', 'The Wire', 'Lost', 'Twin Peaks', 'Gilmore Girls', 'Schitts Creek', 'Black Mirror', 'The Sopranos', 'Arrested Development'],
  animals: ['Giraffe', 'Penguin', 'Octopus', 'Kangaroo', 'Platypus', 'Chameleon', 'Flamingo', 'Hedgehog', 'Armadillo', 'Porcupine',
    'Dolphin', 'Elephant', 'Squirrel', 'Butterfly', 'Jellyfish', 'Alligator', 'Hippopotamus', 'Rhinoceros', 'Wolverine', 'Narwhal',
    'Peacock', 'Pelican', 'Tortoise', 'Lobster', 'Raccoon', 'Gorilla', 'Cheetah', 'Hamster', 'Ostrich', 'Walrus',
    'Scorpion', 'Seahorse', 'Toucan', 'Koala', 'Sloth', 'Panther', 'Buffalo', 'Meerkat', 'Salamander', 'Woodpecker'],
  food: ['Spaghetti', 'Guacamole', 'Pancakes', 'Croissant', 'Burrito', 'Lasagna', 'Cheesecake', 'Pineapple', 'Avocado', 'Broccoli',
    'Popcorn', 'Pretzel', 'Dumplings', 'Ramen', 'Sushi', 'Tiramisu', 'Meatballs', 'Quesadilla', 'Cinnamon Roll', 'Grilled Cheese',
    'Hot Chocolate', 'Mashed Potatoes', 'French Toast', 'Pumpkin Pie', 'Watermelon', 'Blueberry', 'Pomegranate', 'Zucchini', 'Cauliflower', 'Marshmallow',
    'Nachos', 'Waffles', 'Omelette', 'Hummus', 'Falafel', 'Paella', 'Risotto', 'Brownies', 'Cupcake', 'Lemonade'],
  everyday: ['Umbrella', 'Backpack', 'Keyboard', 'Lighthouse', 'Telescope', 'Skateboard', 'Thunderstorm', 'Snowflake', 'Fireworks', 'Rainbow',
    'Bicycle', 'Treehouse', 'Volcano', 'Calendar', 'Compass', 'Hammock', 'Lantern', 'Passport', 'Sandcastle', 'Saxophone',
    'Campfire', 'Doorbell', 'Escalator', 'Harmonica', 'Jigsaw Puzzle', 'Kaleidoscope', 'Microphone', 'Notebook', 'Origami', 'Parachute',
    'Quicksand', 'Roller Coaster', 'Scarecrow', 'Trampoline', 'Wristwatch', 'Yo-yo', 'Zipper', 'Blanket Fort', 'Pillow Fight', 'Movie Night'],
};
WORDS.mixed = [...WORDS.movies, ...WORDS.animals, ...WORDS.food, ...WORDS.everyday];
// What guessers are told the word is. A mixed pick is told by the list it came from.
const TOPICS = { movies: 'Movies and TV', animals: 'Animals', food: 'Food', everyday: 'Everyday things' };
const topicOf = (word) => TOPICS[Object.keys(TOPICS).find((t) => WORDS[t].includes(word))];
// Long enough for any real topic or hint; the cap only keeps the game's state small.
export const NOTE_MAX = 200;
const note = (v) => (typeof v === 'string' && text(v.replace(/\s+/g, ' '), NOTE_MAX)) || null;

export const MAX_WRONG = 8;
const isLetter = (ch) => /[a-z]/i.test(ch);
// Phones type curly apostrophes and long dashes; they mean the same as ' and -.
const plain = (s) => s.replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'").replace(/[\u2010-\u2015\u2212]/g, '-');

function begin(s, word) {
  s.word = word;
  s.phase = 'guess';
  s.guessed = [];
  s.found = {}; // letter -> who found it, shown on the chooser's screen in their color
  s.wrong = 0;
  s.misses = [];
}

function check(s, players) {
  const left = [...s.word.toLowerCase()].filter((ch) => isLetter(ch) && !s.guessed.includes(ch));
  if (!left.length) s.result = { winners: players.map((p) => p.id), text: `You got it: ${s.word}` };
  else if (s.wrong >= s.max) s.result = { winners: [], text: `The word was ${s.word}` };
}

export default {
  setup({ players, options, rng }) {
    const s = {
      setter: null, phase: 'guess', word: null, guessed: [], wrong: 0, max: MAX_WRONG, misses: [], log: [], turn: null, result: null,
      topic: null, hint: null, hintShown: false,
    };
    if (options.from === 'player') {
      if (players.length < 2) throw new Nope('Someone else has to play to guess your word. Pick Couchline’s word instead, or wait for a second player.');
      s.setter = players[0].id;
      s.phase = 'choose';
      s.turn = players[0].id;
    } else {
      begin(s, pick(WORDS[options.topic] || WORDS.mixed, rng));
      s.topic = topicOf(s.word);
    }
    return s;
  },
  move(s, by, m, ctx) {
    if (s.phase === 'choose') {
      if (by !== s.setter) throw new Nope('Waiting for the word.');
      const word = plain(text(m?.word, 40)).replace(/\s+/g, ' ');
      if (!/^[a-z][a-z '-]*[a-z]$/i.test(word) || word.replace(/[^a-z]/gi, '').length < 3) throw new Nope('Use letters only, at least three of them. Spaces, apostrophes, and hyphens are fine.');
      begin(s, word);
      // The topic and hint are optional, and free text, so they can be as helpful or as sly as they like.
      s.topic = note(m?.topic);
      s.hint = note(m?.hint);
      s.turn = null;
      return;
    }
    if (by === s.setter) throw new Nope('You chose the word, so you sit this one out.');
    if (m?.hint) {
      if (s.hintShown) throw new Nope('The hint is already out.');
      if (s.setter && !s.hint) throw new Nope('There’s no hint this time.');
      s.hintShown = true;
      s.log.push({ by, hint: true });
      // Couchline's words have no written hint, so the hint is a letter.
      if (!s.setter) {
        const letter = shuffle([...new Set(s.word.toLowerCase().replace(/[^a-z]/g, ''))].filter((l) => !s.guessed.includes(l)), ctx.rng)[0];
        s.guessed.push(letter);
        s.found[letter] = by;
        s.hint = `There’s ${/[aeiou]/.test(letter) ? 'an' : 'a'} ${letter.toUpperCase()}`;
      }
      check(s, ctx.players);
      return;
    }
    if (typeof m?.word === 'string') {
      const guess = squash(m.word);
      if (!guess) throw new Nope('Type a guess.');
      s.log.push({ by, word: text(m.word, 40), right: guess === squash(s.word) });
      if (guess === squash(s.word)) {
        for (const l of s.word.toLowerCase().replace(/[^a-z]/g, '')) if (!s.found[l]) s.found[l] = by;
        s.guessed = [...new Set([...s.guessed, ...s.word.toLowerCase().replace(/[^a-z]/g, '')])];
      } else s.wrong++;
      check(s, ctx.players);
      return;
    }
    const letter = String(m?.letter || '').toLowerCase();
    if (!/^[a-z]$/.test(letter)) throw new Nope('Pick a letter.');
    if (s.guessed.includes(letter)) throw new Nope('That letter was already guessed.');
    s.guessed.push(letter);
    const right = s.word.toLowerCase().includes(letter);
    if (right) s.found[letter] = by;
    else { s.wrong++; s.misses.push(letter); }
    s.log.push({ by, letter, right });
    if (s.log.length > 30) s.log.shift();
    check(s, ctx.players);
  },
  // The word is shown as its letters so far; the person who chose it sees all of it.
  // The hint stays hidden until someone opens it.
  view(s, viewer) {
    const { word, hint, ...rest } = s;
    const open = s.result || viewer === s.setter;
    return {
      ...rest,
      word: open ? word : null,
      hint: s.hintShown || open ? hint : null,
      hintReady: !s.hintShown && (!s.setter || !!hint),
      mask: word ? [...word].map((ch) => (!isLetter(ch) || open || s.guessed.includes(ch.toLowerCase()) ? ch : null)) : null,
    };
  },
};
