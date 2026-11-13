/**
 * Word data (hand-written for this project, so there are no licensing concerns).
 * Format per line: WORD|Category|Definition. The definition must never contain the word.
 * Difficulty: easy = everyday words, normal = common words, hard = trickier words.
 * Bump WORDS_VERSION whenever an entry changes (it changes which puzzle a seed yields).
 */
import type { Difficulty, WordEntry } from '../core/types';

export const WORDS_VERSION = 'w2';

const FOUR_RAW: Record<Difficulty, string> = {
  easy: `
BIRD|Animal|A feathered creature that lays eggs and usually flies
FISH|Animal|A creature that lives and swims in water
FROG|Animal|A green jumper that begins life as a tadpole
BEAR|Animal|A large furry animal that sleeps through winter
LION|Animal|A big cat known as the king of the jungle
DUCK|Animal|A water bird that quacks
GOAT|Animal|A horned farm animal that likes to climb
WOLF|Animal|A wild relative of the dog that howls
LAMB|Animal|A young sheep
TREE|Plant|A tall plant with a trunk and branches
LEAF|Plant|A flat green part that grows on a branch
ROSE|Plant|A flower with thorns and a sweet scent
SEED|Plant|A small thing you plant to grow something new
CAKE|Food|A sweet baked treat for birthdays
MILK|Food|A white drink that comes from cows
RICE|Food|Small white grains eaten around the world
SOUP|Food|A hot liquid dish eaten with a spoon
CORN|Food|Yellow kernels that grow on a cob
BEAN|Food|A seed that grows inside a pod
PEAR|Food|A sweet fruit that is narrow at the top
MEAT|Food|Animal flesh used as food
SALT|Food|A white seasoning found in the sea
HAND|Body|You have five fingers on each one
FOOT|Body|The part of your body you stand on
HEAD|Body|The top part of your body, home of the brain
NOSE|Body|You smell with it
HAIR|Body|It grows on your head and needs brushing
FACE|Body|The front of your head
BOOK|Object|Pages bound together for reading
DOOR|Home|You open it to enter a room
LAMP|Object|It gives light on a desk
DESK|Home|A table for writing or studying
BELL|Object|It rings when struck
SHOE|Clothing|You wear it on your foot
SOCK|Clothing|Worn inside a shoe
COAT|Clothing|A warm outer garment
MOON|Nature|It lights the night sky and circles the Earth
STAR|Nature|A bright dot in the night sky
SNOW|Weather|Cold white flakes that fall in winter
RAIN|Weather|Water falling from clouds
WIND|Weather|Moving air you can feel but not see
SAND|Nature|Tiny grains found on a beach
LAKE|Nature|A large body of fresh water surrounded by land
HILL|Nature|A small raised area of land
FIRE|Nature|It burns and gives heat and light
`,
  normal: `
CARD|Object|A small piece of stiff paper, like one you send on a birthday
COIN|Object|A small round piece of metal money
DISH|Home|A plate or bowl for food
FORK|Object|A tool with prongs for eating
BOWL|Home|A deep round dish for soup or cereal
WALL|Home|It holds up a ceiling and separates rooms
ROOF|Home|The top covering of a house
YARD|Place|The grassy area around a house
GATE|Object|A door in a fence
BANK|Place|A place that keeps your money safe
SHOP|Place|A place where things are sold
PATH|Place|A narrow way for walking
TEAM|Group|People who play or work together
CLUB|Group|A group of people with a shared interest
BAND|Music|A group of musicians
FILM|Art|A story you watch at the cinema
NEWS|Media|Reports about recent events
MAIL|Object|Letters delivered to your house
NOTE|Writing|A short message written down
PAGE|Object|One side of a sheet in a book
WORD|Language|It is made of letters and has a meaning
IDEA|Mind|A thought or plan in your head
PLAN|Mind|Steps you decide on before doing something
WORK|Action|A job you do, or the effort of doing it
TOOL|Object|A hammer or a saw, for example
DATA|Computer|Facts and numbers stored in a computer
FILE|Computer|A named document on a computer
LINK|Computer|A clickable connection to another web page
CODE|Computer|Instructions written for computers
TEXT|Language|Written letters on a page or screen
SIGN|Object|A board with a message on a road or shop
RULE|Mind|Something that says what you may or may not do
CALM|Feeling|Peaceful and not worried
DARK|Quality|What a room is like when there is no light
DEEP|Quality|Going far down, like the sea
HUGE|Quality|Extremely big
SOFT|Quality|Pleasant to touch, not hard
WILD|Quality|Living in nature, not tamed
DAWN|Time|The first light of the morning
DUSK|Time|The time just before night begins
MIST|Weather|A thin cloud of tiny drops near the ground
COAL|Nature|A black rock burned for fuel
IRON|Nature|A strong metal used to make tools and nails
TIDE|Nature|The rise and fall of the sea
CAVE|Nature|A large hole in a hillside or cliff
PEAK|Nature|The pointed top of a mountain
MOSS|Plant|A soft green plant that covers rocks and trees
PLUM|Food|A purple fruit with a stone inside
LIME|Food|A sour green citrus fruit
TUNA|Animal|A big ocean fish often put in sandwiches
CRAB|Animal|A sea creature that walks sideways
SEAL|Animal|A sea mammal with flippers that barks
DEER|Animal|A forest animal; the male grows antlers
HAWK|Animal|A bird of prey with sharp eyes
SWAN|Animal|A large white bird with a long curved neck
TOAD|Animal|A bumpy cousin of the frog
`,
  hard: `
JAZZ|Music|A lively style of music born in New Orleans
QUIZ|Game|A short test of knowledge
JOKE|Language|Something said to make people laugh
ZONE|Place|An area set apart for a purpose
ZINC|Nature|A bluish-white metal used to coat steel
YARN|Object|Thick thread used for knitting
YOGA|Sport|Stretching and breathing exercise from India
VASE|Home|A container for cut flowers
VOID|Space|An empty space with nothing in it
VEIL|Clothing|Thin cloth worn over the face
WHIM|Mind|A sudden, playful impulse
YAWN|Body|What you do with your mouth when you are sleepy
ZEAL|Feeling|Great energy and enthusiasm
ZOOM|Action|To rush by quickly with a humming sound
GLOW|Light|A soft steady light, like from embers
GUST|Weather|A sudden short rush of wind
HAZY|Weather|Not clear because of mist or smoke
JADE|Nature|A green stone used in carving
JOLT|Action|A sudden rough shake or jerk
KNOB|Object|A round handle on a door
LYNX|Animal|A wild cat with tufted ears
MAZE|Game|A puzzle of winding paths to escape from
NOOK|Place|A small, cozy corner
SWAY|Action|To move gently from side to side
TWIG|Plant|A tiny thin branch
WRAP|Action|To cover a gift in paper
YELP|Sound|A sharp, short cry of pain, like a puppy's
ZEST|Food|The outer peel of a lemon, grated for flavor
AXLE|Object|The rod a wheel turns around
BLUR|Quality|Something unclear or smeared
`,
};

const THREE_RAW: Record<Difficulty, string> = {
  easy: `
CAT|Animal|A furry pet that purrs
DOG|Animal|A pet that barks and wags its tail
PIG|Animal|A pink farm animal that oinks
COW|Animal|A farm animal that gives milk
HEN|Animal|A female chicken
FOX|Animal|A clever red wild animal with a bushy tail
BAT|Animal|A flying mammal that sleeps upside down
ANT|Animal|A tiny insect that lives in colonies
BEE|Animal|An insect that makes honey
EGG|Food|Laid by a hen and often eaten for breakfast
SUN|Nature|The star our planet circles
SKY|Nature|The blue space above us
SEA|Nature|A huge body of salt water
HAT|Clothing|You wear it on your head
CUP|Home|You drink tea from it
BED|Home|You sleep in it
PEN|Object|You write with ink using it
BOX|Object|A container with straight sides and a lid
CAR|Vehicle|A road vehicle with four wheels
BUS|Vehicle|A large vehicle that carries many passengers
BAG|Object|You carry things in it
MAP|Object|A drawing that shows places
KEY|Object|It opens a lock
TEA|Food|A hot drink made from dried leaves
JAM|Food|Sweet fruit spread for toast
ARM|Body|It connects your shoulder to your hand
EYE|Body|You see with it
EAR|Body|You hear with it
LEG|Body|You walk on one of two
TOE|Body|One of five at the end of your foot
`,
  normal: `
OWL|Animal|A night bird with big eyes that hoots
RAT|Animal|A small rodent with a long tail
OAK|Plant|A tree that grows acorns
FIG|Food|A soft sweet fruit with many tiny seeds
NUT|Food|A hard-shelled seed like an almond
PIE|Food|A baked dish with a pastry crust
PEA|Food|A small round green vegetable in a pod
TIN|Object|A soft silvery metal used to make cans
TUB|Home|A large container for bathing
VAN|Vehicle|A box-shaped vehicle for carrying goods
WEB|Nature|A spider's trap made of silk
FAN|Home|It spins to move air and cool you
GEM|Object|A precious polished stone
INK|Object|Colored liquid in a pen
JAR|Home|A glass container with a screw lid
LID|Home|A cover on top of a pot
MOP|Home|A tool for washing floors
RUG|Home|A small carpet
WIG|Object|Fake hair worn on the head
ZIP|Object|A fastener on jackets that slides up and down
`,
  hard: `
AXE|Object|A tool for chopping wood
ELF|Fantasy|A small magical being with pointed ears
ELM|Plant|A tall shade tree
EMU|Animal|A large flightless Australian bird
GNU|Animal|An African antelope also called a wildebeest
IVY|Plant|A climbing evergreen vine
JAW|Body|The bone that holds your lower teeth
SKI|Sport|A long board you glide on over snow
SPY|Person|Someone who secretly gathers information
YAK|Animal|A long-haired mountain ox of Tibet
ZOO|Place|A place where wild animals are kept for visitors
JET|Vehicle|A fast aircraft with powerful engines
AWE|Feeling|A feeling of wonder and respect
HUB|Object|The center of a wheel
`,
};

function parse(raw: Record<Difficulty, string>, len: number): Record<Difficulty, WordEntry[]> {
  const seen = new Set<string>();
  const out: Record<Difficulty, WordEntry[]> = { easy: [], normal: [], hard: [] };
  for (const d of ['easy', 'normal', 'hard'] as const) {
    for (const line of raw[d].trim().split('\n')) {
      const [word, category, definition] = line.split('|').map((x) => x.trim());
      if (!word || word.length !== len || !/^[A-Z]+$/.test(word) || seen.has(word)) continue;
      seen.add(word);
      out[d].push({ id: word.toLowerCase(), word, category, definition, difficulty: d });
    }
  }
  return out;
}

export const FOUR = parse(FOUR_RAW, 4);
export const THREE = parse(THREE_RAW, 3);

/** Entries usable at a difficulty (easy: easy; normal: easy+normal; hard: normal+hard). */
export function poolFor(list: Record<Difficulty, WordEntry[]>, difficulty: Difficulty): WordEntry[] {
  switch (difficulty) {
    case 'easy':
      return list.easy;
    case 'normal':
      return [...list.easy, ...list.normal];
    case 'hard':
      return [...list.normal, ...list.hard];
  }
}
