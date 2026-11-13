/**
 * Curated, family-friendly word lists (hand-written for this project, no third-party list,
 * so there are no licensing concerns). Tier 1 = very common, tier 2 = common,
 * tier 3 = less common / trickier letters. Tiers are disjoint (enforced below).
 * Bump WORDS_VERSION whenever a list changes.
 */
export const WORDS_VERSION = 'w1';

export type Tier = 1 | 2 | 3;

const split = (s: string) => s.trim().split(/\s+/);

function disjointTiers(raw: Record<Tier, string>, len: number): Record<Tier, string[]> {
  const seen = new Set<string>();
  const out = { 1: [], 2: [], 3: [] } as Record<Tier, string[]>;
  for (const tier of [1, 2, 3] as const) {
    for (const w of split(raw[tier])) {
      if (w.length !== len || !/^[A-Z]+$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      out[tier].push(w);
    }
  }
  return out;
}

export const FOUR = disjointTiers(
  {
    1: `BIRD FISH TREE FROG BEAR LION DUCK GOAT WOLF CAKE MILK RICE SOUP FOOD CORN BEAN PEAR LAMB
      HAND FOOT HEAD NOSE HAIR FACE BACK BOOK DOOR ROOM HOME LAMP DESK BELL SHOE SOCK COAT RING GIFT
      BALL GAME PLAY SONG MOON STAR SNOW RAIN WIND SAND LAKE POND HILL ROCK WAVE FIRE COLD WARM COOL
      BLUE PINK GOLD ROAD TOWN CITY PARK FARM BARN SHIP BOAT BIKE TIME YEAR WEEK LOVE HOPE LIFE KIND
      GOOD BEST FAST SLOW TALL WALK JUMP SWIM READ SING LOOK HELP OPEN STOP COME GIVE TAKE MAKE LIKE
      FIVE NINE LEAF ROSE SEED CAMP KITE SALT MEAT CHIP`,
    2: `CARD COIN DISH FORK BOWL WALL ROOF HALL YARD GATE BANK SHOP MARK PATH TRIP TOUR TEAM CLUB BAND
      ROLE FILM NEWS TALK CALL MAIL NOTE PAGE WORD LINE FORM IDEA PLAN WORK TASK TOOL DATA FILE LINK
      CODE TEXT FONT ICON MENU DIAL SIGN RULE VOTE BOLD CALM DARK DEEP FAIR FINE FREE FULL GLAD HARD
      HUGE JUST KEEN LATE LAZY LEAN LONG LOUD MILD NEAT NICE PALE PURE RARE RICH RUDE SAFE SOFT SURE
      TINY VAST WIDE WILD WISE ZERO HERO DAWN DUSK MIST HAZE COAL IRON TIDE REEF DUNE CAVE PEAK VALE
      MOSS VINE HERB PLUM LIME DATE BEET LEEK KALE MINT SAGE DILL TUNA CRAB CLAM SEAL DEER MOLE HAWK
      DOVE SWAN CROW TOAD NEWT WORM WASP MOTH`,
    3: `JAZZ QUIZ JOKE ZONE ZINC YARN YOGA VASE VOID VEIL WAXY WHIM YAWN ZEAL ZOOM FLUX GLOW GUST HAZY
      JADE JOLT KNOB LYNX MAZE NOOK OBEY PLUS QUIT SWAY TWIG UNIT WRAP YELP ZEST AXLE BLUR DRIP ENVY
      GRIP HYMN IDLE JINX LIMP MYTH NUMB OVAL PLOT QUIP RUSH SKIM THAW URGE VIBE WHIP YOLK ZANY BULB
      CLUE DOZE ECHO FOLK GAZE HUSK INKY JEST KNIT LUSH MOCK NOVA OPAL QUAY RUBY SNUG TUSK VARY WISP`,
  },
  4,
);

export const THREE = disjointTiers(
  {
    1: `CAT DOG SUN HAT CUP BED PEN BOX CAR BUS BAG EGG PIG COW RED BIG RUN SIT EAT FUN TOP MAP KEY
      BOY ONE TWO SIX TEN SKY SEA TEA JAM HEN FOX BAT ANT BEE ARM LEG EYE EAR LIP TOE`,
    2: `MUD NET OWL RAT RAY ICE OAK FIR FIG NUT OIL OAR OAT PEA PIE POT SAW SOY TIN TUB VAN WAX WEB
      YAM ZIP FAN FLY GEM GYM HIP INK JAR JOY LAB LID MOP NAP PAD RUG SAD TAG WIG`,
    3: `AXE AWE EBB ELF ELM EMU GNU HUB IVY JAW JET JIG KEG LAX MIX NAG OAF PUB RIB SKI SPY VEX WRY
      YAK ZAP ZOO HEX`,
  },
  3,
);

/** Words usable per difficulty (weighted selection happens in the generator). */
export function poolFor(list: Record<Tier, string[]>, difficulty: 'easy' | 'normal' | 'hard'): string[] {
  switch (difficulty) {
    case 'easy':
      return list[1];
    case 'normal':
      return [...list[1], ...list[2]];
    case 'hard':
      return [...list[2], ...list[3]];
  }
}
