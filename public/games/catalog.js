// Every game Couchline offers, with what the Games tab and the lobby show about it.
// Shared by the server (which checks player counts and options) and the page.
//   min, max   how many players a game can start with
//   coop       everyone plays together against the game, so wins aren't counted per person
//   lateJoin   people can join after it has started
//   options    choices made in the lobby before starting; the first choice is the default
//   icon       the inside of a 24 by 24 line icon

export const CATEGORIES = [
  { id: 'board', label: 'Board games' },
  { id: 'word', label: 'Word games' },
  { id: 'party', label: 'Party games' },
  { id: 'cards', label: 'Cards and dice' },
  { id: 'puzzle', label: 'Puzzles together' },
];

const dot = (x, y, r = 1.3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

export const CATALOG = [
  // ---------- board games ----------
  {
    id: 'tictactoe', name: 'Tic-tac-toe', aka: ['noughts and crosses', 'tic tac toe', 'xo'], category: 'board', min: 2, max: 2,
    blurb: 'Three in a row wins.',
    rules: 'Take turns marking a square. The first to get three in a row, across, down, or diagonally, wins. A full board with no line is a draw.',
    icon: '<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  },
  {
    id: 'connect4', name: 'Four in a Row', aka: ['connect four', 'connect 4'], category: 'board', min: 2, max: 2,
    blurb: 'Drop discs, line up four.',
    rules: 'Take turns dropping a disc into a column. It falls to the lowest open spot. Line up four of yours across, down, or diagonally to win.',
    icon: `<rect x="3" y="5" width="18" height="14" rx="2"/>${[8, 12, 16].map((x) => `<circle cx="${x}" cy="10" r="1.5"/><circle cx="${x}" cy="14.5" r="1.5"/>`).join('')}`,
  },
  {
    id: 'checkers', name: 'Checkers', aka: ['draughts'], category: 'board', min: 2, max: 2,
    blurb: 'Jump, crown, clear the board.',
    rules: 'Pieces move one square diagonally forward. Jump over an opponent’s piece to capture it, and keep jumping if you can. Captures are required. Reach the far row to be crowned, and kings move both ways. Take every piece, or leave them no move, to win.',
    icon: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v4c0 1.7 3.1 3 7 3s7-1.3 7-3V8"/><path d="M5 12v3c0 1.7 3.1 3 7 3s7-1.3 7-3v-3"/>',
  },
  {
    id: 'chess', name: 'Chess', aka: [], category: 'board', min: 2, max: 2,
    blurb: 'The classic, with every rule.',
    rules: 'Standard chess: castling, en passant, and promotion included. Checkmate wins. Stalemate, insufficient material, and the fifty move rule are draws. Either player can offer a draw or resign.',
    icon: '<circle cx="12" cy="6.5" r="2.5"/><path d="M9.5 10.5h5M10.5 10.5c0 3-1 5.5-2.5 7.5h8c-1.5-2-2.5-4.5-2.5-7.5M6.5 20.5h11"/>',
  },
  {
    id: 'reversi', name: 'Reversi', aka: ['othello'], category: 'board', min: 2, max: 2,
    blurb: 'Outflank and flip.',
    rules: 'Place a disc so it traps a line of the other player’s discs between yours, and those flip to your color. If you can’t move, you pass. When neither can move, the most discs wins.',
    icon: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  },
  {
    id: 'gomoku', name: 'Five in a Row', aka: ['gomoku', 'gobang'], category: 'board', min: 2, max: 2,
    blurb: 'Tic-tac-toe, but bigger.',
    rules: 'Take turns placing a stone on the 15 by 15 board. The first to get five in an unbroken row, in any direction, wins.',
    icon: `<path d="M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16"/>${dot(8, 16, 1.6)}${dot(12, 12, 1.6)}${dot(16, 8, 1.6)}`,
  },
  {
    id: 'mancala', name: 'Mancala', aka: ['kalah', 'oware'], category: 'board', min: 2, max: 2,
    blurb: 'Sow seeds, fill your store.',
    rules: 'Pick one of your pits and sow its seeds one by one, counterclockwise, into your store too but not your opponent’s. End in your store to go again. End in an empty pit on your side to capture the seeds across from it. When one side runs out, the fullest store wins.',
    icon: `<rect x="2.5" y="7" width="19" height="10" rx="5"/>${[9, 12, 15].map((x) => `<circle cx="${x}" cy="10" r="1.2"/><circle cx="${x}" cy="14" r="1.2"/>`).join('')}`,
  },
  {
    id: 'battleship', name: 'Sea Battle', aka: ['battleship', 'battleships'], category: 'board', min: 2, max: 2,
    blurb: 'Find their fleet first.',
    rules: 'Each of you gets a hidden fleet of five ships. Take turns firing at a square of the other’s waters. A hit lets you fire again. Sink every ship to win.',
    icon: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  },
  {
    id: 'dots', name: 'Dots and Boxes', aka: ['boxes'], category: 'board', min: 2, max: 4,
    blurb: 'Close a box, go again.',
    rules: 'Take turns drawing a line between two dots. Close the fourth side of a box to claim it and draw again. When every box is taken, the most boxes wins.',
    options: [{ key: 'size', label: 'Board', choices: [{ value: 4, label: '4 by 4' }, { value: 3, label: '3 by 3' }, { value: 5, label: '5 by 5' }, { value: 6, label: '6 by 6' }] }],
    icon: `<path d="M6 6h6v6H6z"/>${[6, 12, 18].map((x) => [6, 12, 18].map((y) => dot(x, y, 1.1)).join('')).join('')}`,
  },

  // ---------- word games ----------
  {
    id: 'hangman', name: 'Hangman', aka: ['guess the word'], category: 'word', min: 1, max: 8, coop: true, lateJoin: true,
    blurb: 'Guess the word together.',
    rules: 'Everyone guesses letters (or the whole word) together. Each wrong guess adds to the drawing; six and the word wins. Pick who chooses the word: Couchline, or the first player, who then sits out guessing.',
    options: [
      { key: 'from', label: 'The word comes from', choices: [{ value: 'random', label: 'Couchline' }, { value: 'player', label: 'First player' }] },
      { key: 'topic', label: 'Topic', choices: [{ value: 'mixed', label: 'Mixed' }, { value: 'movies', label: 'Movies and TV' }, { value: 'animals', label: 'Animals' }, { value: 'food', label: 'Food' }] },
    ],
    icon: '<path d="M5 21h10M8 21V3h8v3"/><circle cx="16" cy="8.5" r="2.5"/><path d="M16 11v5M13.5 13h5"/>',
  },
  {
    id: 'wordrace', name: 'Word Race', aka: ['wordle', 'five letters'], category: 'word', min: 1, max: 8, lateJoin: true,
    blurb: 'Same word, six guesses each.',
    rules: 'Everyone gets the same hidden five letter word and six guesses. Green is the right letter in the right spot, yellow is in the word somewhere. You see each other’s colors but not their letters. Fewest guesses wins; ties go to whoever was faster.',
    icon: [2, 6.2, 10.4, 14.6, 18.8].map((x, i) => `<rect x="${x}" y="9" width="3.2" height="6" rx="0.8"${i % 2 ? '' : ' fill="currentColor"'}/>`).join(''),
  },
  {
    id: 'scramble', name: 'Word Scramble', aka: ['anagram', 'unscramble', 'jumble'], category: 'word', min: 2, max: 8, lateJoin: true,
    blurb: 'Unscramble it first.',
    rules: 'Each round shows a scrambled word. The first to type the real word gets the point. Most points after the last round wins.',
    options: [{ key: 'rounds', label: 'Rounds', choices: [{ value: 8, label: '8' }, { value: 5, label: '5' }, { value: 12, label: '12' }] }],
    icon: '<path d="M3 7h3c4 0 6 10 10 10h4M3 17h3c1.7 0 3-1.8 4.2-4M14 7h6M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  },
  {
    id: 'draw', name: 'Draw and Guess', aka: ['pictionary', 'sketch', 'drawing'], category: 'word', min: 2, max: 8, lateJoin: true,
    blurb: 'One draws, everyone guesses.',
    rules: 'Players take turns drawing a secret word while everyone else types guesses. Guess sooner for more points; the artist scores when people get it. Most points after everyone has drawn wins.',
    options: [
      { key: 'turns', label: 'Turns each', choices: [{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }] },
      { key: 'seconds', label: 'Time to draw', choices: [{ value: 80, label: '80 seconds' }, { value: 60, label: '60 seconds' }, { value: 120, label: '2 minutes' }] },
    ],
    icon: '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  },

  // ---------- party games ----------
  {
    id: 'trivia', name: 'Trivia', aka: ['quiz', 'pub quiz'], category: 'party', min: 1, max: 8, lateJoin: true,
    blurb: 'Four choices, one clock.',
    rules: 'Everyone answers the same question at once, against the clock. Right answers score, faster ones score more. Answers reveal together when everyone is in or time runs out.',
    options: [{ key: 'count', label: 'Questions', choices: [{ value: 10, label: '10' }, { value: 5, label: '5' }, { value: 15, label: '15' }] }],
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
  },
  {
    id: 'emoji', name: 'Emoji Movies', aka: ['guess the movie', 'emoji quiz', 'films'], category: 'party', min: 1, max: 8, lateJoin: true,
    blurb: 'Name the film from emoji.',
    rules: 'A movie appears as a row of emoji. Type the title; the first right answer gets the most points, and everyone who gets it before time scores. Close spelling counts.',
    options: [{ key: 'count', label: 'Movies', choices: [{ value: 10, label: '10' }, { value: 6, label: '6' }, { value: 15, label: '15' }] }],
    icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7.5 5v4M12 5v4M16.5 5v4M9.5 14.5a3.5 3.5 0 0 0 5 0"/>',
  },
  {
    id: 'wyr', name: 'Would You Rather', aka: ['this or that', 'wyr'], category: 'party', min: 2, max: 8, lateJoin: true,
    blurb: 'Pick a side, see who agrees.',
    rules: 'Everyone picks one of two options in secret, and the picks reveal together. You score a point for siding with the majority. Most points at the end wins.',
    options: [{ key: 'count', label: 'Questions', choices: [{ value: 10, label: '10' }, { value: 6, label: '6' }, { value: 15, label: '15' }] }],
    icon: '<path d="M12 21v-7M12 14 6 6M12 14l6-8M6 6v4M6 6h4M18 6v4M18 6h-4"/>',
  },
  {
    id: 'rps', name: 'Rock Paper Scissors', aka: ['roshambo', 'rps'], category: 'party', min: 2, max: 2,
    blurb: 'Best of three, or more.',
    rules: 'Both pick in secret and the picks reveal together. Rock beats scissors, scissors beats paper, paper beats rock. A tie is played again.',
    options: [{ key: 'bestOf', label: 'Best of', choices: [{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 7, label: '7' }] }],
    icon: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 17M8 15.5 20 7"/>',
  },
  {
    id: 'reflex', name: 'Fastest Finger', aka: ['reaction', 'quick draw', 'reflex'], category: 'party', min: 2, max: 8,
    blurb: 'Wait for green, then tap.',
    rules: 'Wait for the screen to turn green, then tap as fast as you can. The fastest tap wins the round. Tap too early and you’re out of that round. Most rounds won takes it.',
    options: [{ key: 'rounds', label: 'Rounds', choices: [{ value: 5, label: '5' }, { value: 3, label: '3' }, { value: 10, label: '10' }] }],
    icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  },

  // ---------- cards and dice ----------
  {
    id: 'yacht', name: 'Yacht Dice', aka: ['yahtzee', 'yacht', 'poker dice', 'five dice'], category: 'cards', min: 1, max: 6,
    blurb: 'Five dice, thirteen boxes.',
    rules: 'On your turn roll five dice up to three times, holding any you like between rolls, then score them in one empty box on your card. Five of a kind is a Yacht for 50. Top section of 63 or more earns 35 more. Highest total after 13 turns wins.',
    icon: `<rect x="4" y="4" width="16" height="16" rx="3"/>${dot(8.5, 8.5)}${dot(15.5, 8.5)}${dot(12, 12)}${dot(8.5, 15.5)}${dot(15.5, 15.5)}`,
  },
  {
    id: 'pig', name: 'Pig', aka: ['dice', 'push your luck'], category: 'cards', min: 2, max: 8,
    blurb: 'Roll on, or bank it.',
    rules: 'On your turn roll the die as many times as you like, adding each roll to your turn total. Roll a 1 and you lose the turn total. Hold to bank it. First to the target wins.',
    options: [{ key: 'target', label: 'Play to', choices: [{ value: 100, label: '100' }, { value: 50, label: '50' }] }],
    icon: `<rect x="3" y="7" width="11" height="11" rx="2.5"/>${dot(8.5, 12.5)}<path d="M17 12.5h4M19 10.5v4"/>`,
  },
  {
    id: 'snakes', name: 'Snakes and Ladders', aka: ['chutes and ladders'], category: 'cards', min: 2, max: 6,
    blurb: 'Climb up, slide down.',
    rules: 'Take turns rolling and moving. Land at the foot of a ladder to climb it; land on a snake’s head to slide down. Roll a 6 to go again. Land exactly on 100 to win.',
    icon: '<path d="M5 3v18M10 3v18M5 7h5M5 12h5M5 17h5"/><path d="M19 3c-4 2 0 5-3 7s1 5-2 7"/>',
  },
  {
    id: 'blackjack', name: 'Blackjack', aka: ['21', 'twenty one', 'pontoon'], category: 'cards', min: 1, max: 6,
    blurb: 'Beat the dealer to 21.',
    rules: 'Everyone plays against the dealer with 100 chips. Bet, then take cards (hit) or stop (stand), trying to get closer to 21 than the dealer without going over. Blackjack pays 3 to 2. Most chips after the last hand wins.',
    options: [{ key: 'hands', label: 'Hands', choices: [{ value: 8, label: '8' }, { value: 5, label: '5' }, { value: 12, label: '12' }] }],
    icon: '<rect x="3" y="5" width="11" height="15" rx="2"/><path d="m10 4.5 7.5-1.3a2 2 0 0 1 2.3 1.6l2 11.8a2 2 0 0 1-1.6 2.3L16 20"/>',
  },
  {
    id: 'crazy8', name: 'Crazy Eights', aka: ['uno', 'cards', 'mau mau'], category: 'cards', min: 2, max: 6,
    blurb: 'Match suit or number. Eights are wild.',
    rules: 'Play a card matching the top card’s suit or rank, or draw. Eights are wild: play one and name the next suit. First to empty their hand wins.',
    icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="9.5" r="2.3"/><circle cx="12" cy="14.5" r="2.7"/>',
  },
  {
    id: 'memory', name: 'Memory', aka: ['concentration', 'pairs', 'match'], category: 'cards', min: 1, max: 6,
    blurb: 'Flip two, find the pairs.',
    rules: 'Take turns flipping two cards. A match is yours and you go again; otherwise they flip back. Everyone sees every flip, so pay attention. Most pairs wins.',
    options: [{ key: 'pairs', label: 'Pairs', choices: [{ value: 12, label: '12' }, { value: 8, label: '8' }, { value: 18, label: '18' }] }],
    icon: '<rect x="3" y="6" width="8" height="12" rx="1.5"/><rect x="13" y="6" width="8" height="12" rx="1.5"/><path d="M17 10.5v3M15.5 12h3"/>',
  },

  // ---------- puzzles together ----------
  {
    id: 'sudoku', name: 'Sudoku', aka: ['numbers'], category: 'puzzle', min: 1, max: 8, coop: true, lateJoin: true,
    blurb: 'One grid, everyone solving.',
    rules: 'Fill the grid so every row, column, and 3 by 3 box has 1 to 9 once each. Everyone works on the same grid at once, and each number shows who placed it. Wrong numbers are marked.',
    options: [{ key: 'level', label: 'Difficulty', choices: [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }] }],
    icon: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>${dot(12, 12, 1.4)}`,
  },
  {
    id: 'minesweeper', name: 'Minesweeper', aka: ['mines'], category: 'puzzle', min: 1, max: 8, coop: true, lateJoin: true,
    blurb: 'Clear the field together.',
    rules: 'Open squares without hitting a mine. Numbers say how many mines touch that square. Flag the ones you’re sure of (long press or right click). Anyone can open any square, so talk it through.',
    options: [{ key: 'size', label: 'Field', choices: [{ value: 'medium', label: 'Medium' }, { value: 'small', label: 'Small' }, { value: 'large', label: 'Large' }] }],
    icon: '<circle cx="12" cy="13" r="6"/><path d="M12 3v3M3 13h3M18 13h3M5.6 6.6l2 2M18.4 6.6l-2 2"/>',
  },
  {
    id: 'codebreaker', name: 'Code Breaker', aka: ['mastermind', 'bulls and cows'], category: 'puzzle', min: 1, max: 8, coop: true, lateJoin: true,
    blurb: 'Crack the color code.',
    rules: 'Couchline hides a code of colored pegs. Build a guess together; anyone can submit it. Black means right color, right spot. White means right color, wrong spot. Crack it within ten guesses.',
    options: [{ key: 'length', label: 'Code length', choices: [{ value: 4, label: '4 pegs' }, { value: 5, label: '5 pegs' }] }],
    icon: `${dot(5, 14, 2.1)}${dot(10, 14, 2.1)}<circle cx="15" cy="14" r="2.1"/><circle cx="20" cy="14" r="2.1"/>${dot(9, 7, 0.9)}${dot(12, 7, 0.9)}<circle cx="15" cy="7" r="0.9"/>`,
  },
];

export const GAME = Object.fromEntries(CATALOG.map((g) => [g.id, g]));

// The lobby's choices, with each option set to its first (default) value.
export function defaultOptions(meta) {
  return Object.fromEntries((meta.options || []).map((o) => [o.key, o.choices[0].value]));
}
