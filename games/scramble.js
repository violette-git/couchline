// Word Scramble: each round shows a word with its letters mixed up. The first person to type
// the real word gets the point. Wrong guesses stay private to whoever made them.
import { Nope, shuffle, text, squash, topScorers } from './util.js';

// Everyday words, six to nine letters. None of them is an anagram of another common word, so
// there's only ever one right answer.
export const WORDS = `
animal anchor apricot autumn avocado balloon bamboo banana bandage basket battery beaver bicycle
biscuit blanket blossom bonfire bottle breeze bridge broccoli bubble bucket buffalo burrito butter
button cabbage cactus camera campfire canyon captain caramel carnival carpet carrot castle cattle
cereal champion cheese cherry chicken chimney chocolate circle circus clarinet coconut coffee
compass cookie copper cottage cotton cousin cowboy crayon cricket crystal cupcake curtain cushion
dentist diamond dinner dinosaur doctor dolphin donkey dragon eclipse elephant engine falcon feather
festival flamingo flower forest fountain freckle galaxy garlic giraffe glacier goblin gorilla guitar
hamster harbor harvest helmet hammock hurricane iceberg island jacket jaguar journey jungle kangaroo
ketchup kitten ladder lantern laptop lemonade library lizard lobster magnet mammoth meadow mermaid
monkey monster morning muffin mustard napkin noodle octopus orange orchard orchestra ostrich oyster
paddle pancake panther peanut pencil penguin pepper picnic pillow pirate planet pickle popcorn
potato pretzel pumpkin puzzle pyramid rabbit raccoon rainbow reindeer rocket saddle sailor salmon
sandwich scooter seaweed shadow shampoo sheriff shoulder shovel skeleton sleigh snowman spinach
sponge squirrel stomach sunflower sunshine sweater teapot thunder ticket tomato tornado tortoise
trumpet turkey turtle umbrella unicorn velvet violin volcano waffle walrus weather whisper window
winter wizard yogurt zipper
`.trim().split(/\s+/);

export const ROUND_MS = 30000;
export const REVEAL_MS = 3000;

// Mixed up letters that never spell the word itself.
export function scramble(word, rng) {
  for (let i = 0; i < 20; i++) {
    const s = shuffle([...word], rng).join('');
    if (s !== word) return s;
  }
  return word.slice(1) + word[0];
}

function startRound(s, ctx) {
  const word = s.words[s.round];
  s.phase = 'guess';
  s.scrambled = scramble(word, ctx.rng);
  s.winner = null;
  s.reveal = null;
  s.wrong = {};
  s.deadline = ctx.now() + ROUND_MS;
  ctx.timer(ROUND_MS, (st, c) => endRound(st, c, null));
}

function endRound(s, ctx, winner) {
  s.phase = 'reveal';
  s.winner = winner;
  s.reveal = s.words[s.round];
  s.history.push({ word: s.reveal, winner });
  s.deadline = ctx.now() + REVEAL_MS;
  ctx.timer(REVEAL_MS, (st, c) => {
    if (st.round + 1 < st.words.length) { st.round++; return startRound(st, c); }
    st.deadline = null;
    const best = Math.max(...Object.values(st.scores));
    st.result = best > 0 ? { winners: topScorers(st.scores) } : { winners: [], text: 'Nobody scored this time.' };
  });
}

export default {
  setup({ players, options, rng }, ctx) {
    const s = {
      words: shuffle(WORDS, rng).slice(0, options.rounds || 8),
      round: 0, phase: 'guess', scrambled: '', winner: null, reveal: null, wrong: {}, history: [],
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      turn: null, deadline: null, result: null,
    };
    startRound(s, ctx);
    return s;
  },
  move(s, by, m, ctx) {
    if (s.phase !== 'guess') throw new Nope('The next word is coming up.');
    const guess = squash(text(m?.answer, 30));
    if (!guess) throw new Nope('Type a word.');
    if (guess === s.words[s.round]) {
      s.scores[by] = (s.scores[by] || 0) + 1;
      endRound(s, ctx, by);
      return;
    }
    const mine = (s.wrong[by] ||= []);
    if (!mine.includes(guess)) mine.push(guess);
    if (mine.length > 6) mine.shift();
  },
  // The word stays hidden until the round is over; your wrong guesses are yours alone.
  view(s, viewer) {
    const { words, wrong, ...rest } = s;
    return { ...rest, total: words.length, length: words[s.round]?.length || 0, wrong: wrong[viewer] || [] };
  },
  join(s, player) {
    s.scores[player.id] ??= 0;
  },
};
