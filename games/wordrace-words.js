// Wordle's words. ANSWERS are the hidden words: common, friendly, five letters. ALLOWED is
// every guess Wordle accepts (the answers plus other everyday five letter words), so a
// guess has to be a real word rather than a row of vowels.

const words = (s) => s.trim().split(/\s+/);

export const ANSWERS = words(`
about above actor adopt adult after again agent agree ahead alarm album alert alike alive allow alone
along alter amber among angel anger angle angry ankle apple apply apron arena argue arise armor aroma
arrow aside asset audio avoid awake award aware
bacon badge bagel baker basic basil beach beard beast begin belly below bench berry birth black blade
blame blank blast blaze blend bless blind block bloom board boast bonus boost booth brain brake brand
brave bread break brick bride brief bring broad brook broom brown brush build bunch burst buyer
cabin cable camel candy canoe cargo carry catch cause cedar chain chair chalk charm chart chase cheap
check cheek cheer chess chest chick chief child chili chill choir chunk cider claim class clean clear
clerk click cliff climb clock close cloth cloud clown coach coast cocoa color comet comic coral couch
count court cover craft crane crash crate crawl crazy cream creek crisp crowd crown crumb crust curve cycle
daily dairy daisy dance delay delta dense depth diary diner dizzy dodge donut dough draft drain drama
dream dress drift drill drink drive dwarf
eager eagle early earth eight elbow elder empty enjoy enter entry equal error essay event every exact
exist extra
fable faint fairy faith false fancy feast fence ferry fever fiber field fifty final first flame flash
fleet flock flood floor flour fluid flute focus foggy force forge forty found frame fresh front frost
fruit funny
giant given glass globe glove grace grade grain grand grape graph grass great green greet grill group
grove guard guess guest guide
habit happy harsh heart heavy hedge hello hobby honey honor horse hotel house human humor hurry
ideal image index inner input issue ivory
jelly jewel joint jolly judge juice jumbo
kayak knife knock koala
label large laser later laugh layer learn lemon level light lilac limit linen liver llama local lodge
logic loose lucky lunar lunch
magic major mango maple march marry match mayor medal melon mercy merit metal meter minor mixer model
money month moose motor mount mouse mouth movie muddy music
nerve never night ninja noble noise north novel nurse
ocean offer often olive onion opera orbit order other otter outer owner
paint panda panel paper party pasta patch pause peace peach pearl pedal penny phone photo piano piece
pilot pinch pizza place plain plane plant plate plaza point polar porch pouch power press price pride
prime print prize proof proud pulse punch puppy purse
queen quest quick quiet quilt quite quote
radar radio raise rally ranch range rapid raven reach react ready realm relax reply rhyme rider ridge
right rival river roast robin robot rocky round route royal rugby ruler rumor rural
salad salty sandy sauce scale scarf scene scent scoop scout seven shade shake shape share shark sharp
sheep shelf shell shift shine shiny shirt shock shore short shout sight silly skate skill skirt slate
sleep slice slide slope smart smile smoke snack snake sneak solar solid solve sound south space spare
spark speak speed spell spend spice spoon sport spray squad stack staff stage stair stamp stand start
state steam steel steep stick still stone stool storm story stove straw strip study stuff style sugar
sunny super swamp sweep sweet swift swing sword
table taste teach thank theme thick thing think third three throw thumb tiger timer toast today token
tooth topic torch total touch tower track trade trail train treat trend trial tribe trick truck truly
trunk trust truth tulip twist
uncle under unity until upper upset urban usual
valid value vapor vault video visit vital vivid vocal voice
wagon waste watch water whale wheat wheel while white whole world worry worth write
yacht yeast young youth zebra
`);

// Everyday words that are fine to guess but too odd, too plural, or too tricky to be the answer.
const MORE = words(`
abbey abide abode abort abyss acorn acrid acted adage adapt added adept admin admit adobe affix afoot
afoul agile aging aglow agony aided aimed aired aisle algae alias alibi alien align allay alley
alloy aloft aloha aloof altar amaze amble amend amiss ample amuse angst anime annex annoy antic ants
anvil aorta apart aphid aptly arbor ardor areas armed artsy ashen ashes asked atlas atoms attic audit
auger avail avert axiom azure ached acres
backs badly baggy bails baked bakes balls balmy bands bangs banjo banks barge barks barns baron basin
batch bathe baths baton beads beady beaks beams beans bears beets befit began begun beige being belle
bells belts bendy bento beret berth bikes bills binge bingo birch birds bison bites bland blare bleak
bleat bleed bleep blimp blink bliss blitz bloat blobs blond blood blown blues bluff blunt blurb blurt
blush boats bogus boils bolts bones bongo books boots borax bossy botch bough bound bowed bowls boxed
boxer brace braid brash brass bravo brawl brawn briar bribe brine brink briny brisk broil broke brood
broth brows brunt brute buddy budge buggy bugle built bulbs bulge bulky bulls bully bumps bumpy bunny
burly burnt burro buses bushy butte buzzy bylaw
cacao cache cadet cafes caged cakes calls calve camps canal caper cards cared cares carol carts carve
cases cater caulk caves cease cello cents chafe chaff champ chant chaos chard chats cheat chewy chide
chime china chips chirp chive choke chomp chops chord chore chose chuck churn chute cigar cinch circa
cites civic civil clams clang clank clash clasp claws clays cleat cleft cling clips cloak clone clout
clove cluck clued clues clubs clump clung coals coats cobra codes coins colon combo comma conch condo
cones cooks cools corks corny costs cough could coupe covet cower crabs crack cramp crank creak creep
crepe crept cress crews cribs cried cries crime crimp croak crook crops cross crude cruel crush cubby
cubes cumin cupid curds curly curry cushy cutie cyber
dally dandy dared dares darts dated dates datum deals dealt dears debit debut decal decay decks decor
decoy decry deeds deity desks deter detox deuce dials diced dicey diets digit dimes dimly dined dines
dingy dirty disco ditch ditto ditty divan diver dives docks doggy dogma doing dolls dolly domes donor
doors dopey dotty doubt doves dowdy dowel downy dozed dozen drags drake drank drape drawl drawn draws
dread dried drier dries droll drone drool droop drops drove drown drums dryer dryly ducks ducts dudes
dully dummy dumpy dunce dunes dusky dusty duvet dwell dwelt dying
earns easel eased eaten eater eaves ebony edged edges edict eerie egret eject elate elect elegy elfin
elite elope elude elves embed ember emcee emote enact ended endow enemy ensue envoy epoch epoxy equip
erase erode erupt ether ethic evade evens evict evoke exalt excel exert exile exits expel extol exude
faced faces facet facts faded fades fails fairs faked fakes falls famed fangs farms fatal fated fault
fauna favor fawns fears feats feeds feels feign feint femur fends feral ferns fetch fiend fiery fifth
fight filch filed files fills filly filmy films finch finds fined fines finer fired fires firms fishy
fists fixed fixer fizzy fjord flags flair flake flaky flank flaps flare flask flats flaws fleas fleck
flesh flick flier flies fling flint flips flirt float flops flora floss flown flows fluff fluke flung
flunk flush foals foamy focal foils folds folks folly fonts foods fools foray forgo forks forms forte
forum fouls fowls foxes foyer frail franc frank fraud freak freed freer frees fried fries frill frisk
frizz frock frogs froze fudge fuels fully fumes funds fungi funky furry fused fussy fuzzy
gable gains gales gamer games gamut gases gassy gates gaudy gauze gavel gawky gazed gears gecko geese
genie genre germs ghost giddy gifts gills girls girth gizmo glade glare glaze gleam glean glide glint
gloat gloom glory gloss glows glued glues gnome goals goats going goods gooey goofy goose gorge gouge
gourd gowns grabs graft grams grant grasp grate grave gravy graze greed grief grime grimy grind grins
gripe grips grits groan groom gross grout grown grows grubs gruel gruff grump grunt guava guild guile
guilt guise gulch gulls gully gummy guppy gusto gusty
hairy halls halve hands handy hangs hardy hares harps hasty hatch hated hates haunt haven havoc hawks
hazel heads heady heals heaps heard hears heath heave heels hefty heist helix helps hence herbs herds
heron hertz hiked hikes hills hilly hinge hints hippo hired hires hitch hives hoard hoist holds holes
holly homes honed honks hooks hoops hoped hopes horns hosts hound hours hover howdy howls huffy humid
humus hunch hunts hurls hurts husky hutch hydra hyena hymns hyper
icing icons ideas idiom idled idols igloo imply inane inbox incur inept inert infer inlet irate irons
irony itchy items
jacks jaunt jazzy jeans jeeps jerky jests jetty jiffy joins joked joker jokes jolts joust juicy jumps
jumpy juror
karma keeps keyed khaki kicks kinds kings kiosk kites kitty knack knave knead kneel knees knelt knobs
knots known knows
labor laced lacks laden ladle lakes lamps lance lands lanes lanky lapel lapse larch lasso latch latte
lawns leads leafy leaks leaky leans leant leaps leapt lease leash least leave ledge leech leeks lefty
legal leggy lemur lends lever lifts liked liken likes limbo limbs limes lined liner lines lingo links
lions lists liter lithe lived lives livid loads loamy loans lobby locks locus lofty logos looks loops
loopy lords lorry loser loses lotto lotus lousy loved lover loves lower lowly loyal lucid lumps lumpy
lunge lurch lurks lying lyric
macaw maids mails maize makes malls mambo manes mange mania manly manor marks marsh masks mason masts
mates maths mauve maxim maybe meals mealy means meant meats meaty media meets melts memos mends menus
meows merge merry messy metro micro midst might miles milky mills mimic mince minds mined miner mines
mints minty minus mirth miser mists misty miter mitts mixed mixes moans moats mocha mocks modem molar
molds moldy moles mommy monks moods moody moons moped moral mossy motel moths motto mound mourn mousy
moved moves mower mucky muggy mulch mules mummy munch mural murky mused mushy musty muted myths
nails naive named names nanny nasal nasty naval navel nears necks needs needy neigh nerdy nests newer
newly nexus nicer niche niece nifty ninth nippy nodes noisy nomad nooks norms nosey notch noted notes
nouns nudge nutty nylon
oaken oases oasis occur oddly odors oiled okapi older oldie omega omits onset oozed opens opted optic
orcas organ ought ounce outdo ovals ovens overt owing owlet owned oxide ozone
paced paces packs pacts paddy pages pails pains pairs palms pansy pants parch parka parks parts paste
pasty patio patty paved paves pawns payee peaks pears pecan pecks peeks peels peeps peers pence penne
perch peril perks perky pesky pesto petal petty phase phony picks picky piers piety piggy piled piles
pills pines pinky pinto pints pious piped piper pipes pitch pithy pivot pixel pixie plaid plank plans
plays plead pleat plods plots plows ploys pluck plugs plumb plume plump plums plunk plush poach poems
poets poise poked poker polka polls ponds pooch pools poppy pores posed poser poses posse posts potty
pound pours pouty prank prawn prays preen preps pried pries prism privy probe prods prone prong prose
prowl prune psalm puffs puffy pulls pulpy pumps punny pupil purge purrs pushy putty
quack quail quake qualm quart quash query queue quips quirk quota
rabbi raced racer races racks radii rafts raged rails rains rainy raked rakes ramen ramps rangy ranks
rants rarer rated rates ratio raved raves rayon razor reads reams reaps rebel rebus recap recur redid
reeds reedy reefs reeks reels refer refit regal reign reins relay relic remit renew rents repay repel
rerun reset resin rests retro reuse revel revue rhino rides rifle rifts rigid rigor rinds rings rinse
ripen riper risen rises risky rites ritzy roads roams roars robes rocks rodeo rogue roles rolls roofs
rooks rooms roomy roost roots roped ropes roses rosin rotor rouge rough rowdy rowed rower ruled rules
rumba rummy runes rungs runny rusts rusty
saber sable sacks sadly safer sagas sages sails saint sales salon salsa salve samba sands saner sappy
sassy satin sauna saved saves savor savvy scald scalp scaly scamp scams scant scare scary scoff scold
scone scope score scorn scrap scrub scuba scuff seals seams seats sedan seeds seedy seeks seems seize
sells sends sense serum serve setup sever sewed sewer shack shaft shaky shall shame shank shawl sheen
sheer sheet shied shins ships shire shirk shoal shoes shone shook shoot shops shorn shown shows showy
shred shrub shrug shuck shunt sides siege sieve sighs signs silks silky sills silty since sings sinks
sinus siren sixth sixty sized sizes skied skier skies skimp skims skins skips skits skull skunk slabs
slack slain slang slant slaps slash slats sleek sleet slept slick slime slimy sling slink slips slits
slosh sloth slots slows slump slung slurp slush smack small smash smear smell smelt smirk smith smock
snaps snare snarl sniff snipe snoop snore snort snout snowy snuck snuff soapy soars sober socks sofas
softy soggy soils solos sonar songs sonic sorry sorts souls soups spade spans spasm spawn spear specs
spied spiel spies spike spiky spill spilt spine spiny spite splat split spoil spoke spook spool spore
spots spout sprig spurs squat squid stabs stain stake stale stalk stall stank stare stark stars stash
stays steak steal stems steps stern stews sting stink stint stock stoic stoke stole stomp stony stood
stoop stops store stork stout strap stray strum strut stubs stuck studs stump stung stunk stunt suave
suite suits sulky sumac surge surly sushi swabs swans swaps swarm swath sways swear sweat swell swept
swims swine swipe swirl swish swoon swoop syrup
tabby taboo tacit tacky tacos taffy tails taken takes tales talks tally talon tamed tamer tango tangy
tanks tapas taped taper tapes tardy tarot tarts tasks tasty taunt tawny taxed taxes taxis teams tears
teary tease teddy teens teeth tells tempo tends tenor tense tenth tents tepid terms terse tests their
there these thief thigh thins thorn those threw thump tiara tidal tides tiers tight tilde tiled tiles
tilts timed times timid tinge tinny tired tires titan title toads tolls tombs tonal toned tones tongs
tonic tools topaz torso totem tough tours towel towns toxic toyed trace trait tramp traps trash trawl
trays tread treks trees tress trims trios tripe trips trite troll troop trout trove truce tubby tubes
tucks tufts tummy tuned tunes tunic turbo turns tusks tutor tweak tweed tweet twice twigs twine twins
twirl tying typed
udder ulcer ultra uncut undid undue unfit unify union unite units unlit unmet untie unzip usage usher
using utter
vague vales valet valor valve vanes vapid vases veins venom venue verbs verge verse vests vexed vibes
views vigil vigor villa vines vinyl viola viper viral virus visor vista vogue voted voter votes vouch
vowel vowed
wacky wafer waged wager wages waist waits waive walks walls waltz wands wants wards wares warms warns
warps warty wasps waved waver waves waxed waxes weary weave wedge weeds weedy weeks weepy weigh weird
wells whack wharf where which whiff whims whine whiny whips whirl whisk whoop whose wicks wider widow
width wield wilds wills wimpy wince winch winds windy wings winks wiped wiper wipes wired wires wiser
wisps wispy witch witty wives woken woman women woods woody wooed woofs words wordy works worms wormy
worse worst would wound woven wowed wrath wreak wreck wrens wrest wring wrist wrong wrote wrung wryly
yards yarns yawns yearn years yells yelps yield yodel yokes yolks yours yummy
zesty zilch zippy zonal zoned zones zooms
`);

// More everyday words, and plurals and past tenses of short ones (bands, baked).
const OTHERS = words(`
moist adieu atone riots tries mites emits aloud tried posit smite bares sabre abuse adore adorn
afire agape aisle alpha amino amply apnea argon array arson askew aspen augur aunty avian await
awash awful axial banal basis bayou beefy belch bevel bible bicep biome bitty borne bused cameo
canny canon carat caved chasm chimp conic covey crave craze creed creme crest crony cubic curio
curvy cynic daunt debug delve denim depot derby doily email ennui ethos exult farce fewer fibre
filet flail flout flume frond froth frown furor gaunt gland glyph gnash golem gumbo homer horde
idler ingot inlay inter intro ionic islet joist kebab knoll larva lathe leach leery lumen macro
magma maker mangy manic medic melee midge modal morph moult mover myrrh nadir ninny nobly octal
octet odder olden ombre opine ovate paler parer parry parse penal piney pique plait plied plier
poesy primo prior prove proxy pudgy puree purer quark quasi quill rabid raspy ratty rearm rebar
rebut recut rehab retch retry riser rivet roach roger rouse rover ruddy ruder rupee sally salvo
saute savoy scion scour scowl scram scree screw scrum segue sepia serif shady shale shard shave
shear sheik shrew shush shyly sigma sinew singe skiff slunk sloop slyly smoky snail snaky sneer
snide sooty sower spelt spent spicy spire spoof spree spunk spurn spurt squib staid stave stead
steed steer stein stiff stilt sworn swung synod taint taker tapir tatty tenet tepee terra testy
theft theta thong throb thrum thyme tibia tipsy tithe tonga toxin tract triad trice trope truer
trump truss tryst tubal tuber tulle tumor twang twixt unfed unset usurp utile vaunt vegan verso
verve vixen voila vying waxen widen wight wooer woozy
`);
const PLURAL = words(`
bake band bank barn base bath bead beak beam bean bear beat beef beep bell belt bend bike bill bind
bird bite blow boat bolt bond bone book boom boot bore bowl bulb bump burn cage cake call camp cane
card care cart case cave cell chat chef chip chop clam clap claw clay clip club clue coat code coil
coin cola colt comb cone cook cool cope cord core cork corn cost crab crew crib crop crow cube cuff
curb cure curl dare dart date dawn deal dean dear deck deed dent desk dial diet dime dine disk dive
dock doll dome door dose dove drag draw drip drop drum duck duel dune dusk dust earn ease edge face
fact fade fail fair fake fall fame fang farm fawn fear feat feed feel fern file fill film find fine
fire firm fist flag flap flat flaw flea flip flow foam foil fold folk font food fool foot fork form
fort fowl frog fuel fume fund fuse gain game gang gape gasp gate gaze gear germ gift girl give glow
glue goal goat gold golf gong gown grab grin grip grow gulp gust hail hair hall halt hand hang harm
harp hate haul hawk head heal heap hear heat heel help herb herd hide hike hill hint hire hold hole
home hood hoof hook hoop hope horn hose host hour howl hunt hurt hymn icon idea idol iron item jail
jeep jerk jest joke jolt jump keep kick kind king kite knee knit knob knot lace lack lake lamb lamp
land lane last leak lean leap lend lick lift like limb lime line link lion list load loan lock loft
look loop lord lose love lump lure lurk mail make male mall mane mark mask mast mate maze meal mean
meat meet melt memo mend menu mile milk mill mind mine mint mist mitt moan moat mock mode mold mole
monk mood moon moth move mule muse nail name neck need nest nose note noun oath oven pace pack page
pail pain pair palm part path peak pear peck peek peel peer pest pick pier pile pill pine pink pint
pipe plan play plot plow plug plum poem poet pole poll pond pool pore port pose post pour pray prey
prop pull pump purr race rack raft rage rail rain rake ramp rank rant rate read reed reef reel rent
rest ride ring rink riot rise risk road roam roar robe rock role roll roof room root rope rose ruin
rule rust sack safe sage sail sale salt sand save scan seal seam seat seed seek seem sell send ship
shoe shop shot show side sigh sign silk sing sink site size skin skip slam slap sled slip slot slug
snap snow soak soap sock sofa soil sole song soul soup span spin spot star stay stem step stew stir
stop suit surf swan swap swim tack tail take tale talk tank tape task team tear tell tent term test
text tide tile time tire toad toll tomb tone tool tour town trap tray tree trim trip tube tuck tune
turn twin type unit vase veil vein verb vest view vine vote wade wage wait wake walk wall wand want
ward warm warn wart wave weed week well whip wick wind wine wing wink wipe wire word work worm wrap
yard yarn yawn year yell yelp yolk zone zoom
`).map((w) => `${w}s`);
const PAST = words(`
bake care dare date dine dive fade hate hike hire hope joke like line live love move name note pave
pile poke pose race rake rate rule save tame tape time tone tune type vote wave wipe wire bore cure
fire fuse gaze glue lure mope mute raze rope bike file gape lace mine pine pipe tile wade wake
`).map((w) => `${w}d`);

export const ALLOWED = new Set([...ANSWERS, ...MORE, ...OTHERS, ...PLURAL, ...PAST].filter((w) => /^[a-z]{5}$/.test(w)));
