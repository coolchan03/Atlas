/**
 * Titles for tunes the built-in composer writes, so a track is not just "Jazz" every time. Each style has its own words (a cafe, a
 * lantern, a long drive) joined in a few patterns, chosen at random for each new tune. Pure and seedable, so it is tested without a device.
 */
import type { StyleGroup } from './styleTypes';

const GENERAL_ADJECTIVES = ['Quiet', 'Golden', 'Velvet', 'Midnight', 'Gentle', 'Distant', 'Warm', 'Silver', 'Hidden', 'Slow', 'Bright', 'Faded', 'Paper', 'Amber', 'Hollow', 'Lazy', 'Soft', 'Wandering', 'Early', 'Late'];
const GENERAL_NOUNS = ['Morning', 'Window', 'Harbor', 'Lantern', 'Garden', 'Horizon', 'Train', 'River', 'Evening', 'Postcard', 'Orchard', 'Compass', 'Hallway', 'Blanket', 'Skyline', 'Echo', 'Meadow', 'Ferry', 'Letter', 'Porch'];

/** Words that belong to one style, mixed into its titles. */
const FLAVOR: Record<string, { adjectives: string[]; nouns: string[] }> = {
  focus: { adjectives: ['Steady', 'Clear', 'Open', 'Deep', 'Still'], nouns: ['Desk', 'Page', 'Thread', 'Study', 'Margin', 'Lamp'] },
  film: { adjectives: ['Epic', 'Rising', 'Final', 'Lost', 'Vast'], nouns: ['Frontier', 'Credits', 'Voyage', 'Overture', 'Horizon', 'Return'] },
  electro: { adjectives: ['Neon', 'Digital', 'Pulse', 'Chrome', 'Electric'], nouns: ['Circuit', 'Signal', 'Grid', 'Current', 'Satellite', 'Wire'] },
  jazz: { adjectives: ['Smoky', 'Blue', 'Late-Night', 'Swinging', 'Mellow'], nouns: ['Cafe', 'Corner', 'Alley', 'Quartet', 'Speakeasy', 'Set', 'Saxophone Lane'] },
  vaporwave: { adjectives: ['Plastic', 'Pastel', 'Glass', 'Mall', 'Sunset'], nouns: ['Plaza', 'Palm', 'Fountain', 'Escalator', 'Dream', 'Arcade'] },
  eerie: { adjectives: ['Pale', 'Creeping', 'Foggy', 'Whispering', 'Cold'], nouns: ['Mist', 'Moor', 'Lantern', 'Cellar', 'Hush', 'Shadow'] },
  bossa: { adjectives: ['Sunlit', 'Easy', 'Seaside', 'Soft'], nouns: ['Terrace', 'Beach Walk', 'Veranda', 'Rio Evening', 'Cafezinho'] },
  lofi: { adjectives: ['Sleepy', 'Rainy', 'Cozy', 'Dusty', 'Late'], nouns: ['Notebook', 'Cassette', 'Tea', 'Attic', 'Study Break', 'Bus Ride'] },
  noir: { adjectives: ['Rain-Soaked', 'Dark', 'Neon', 'Cold', 'Lonely'], nouns: ['Case File', 'Alibi', 'Back Alley', 'Informant', 'Trench Coat', 'Stakeout'] },
  space: { adjectives: ['Drifting', 'Orbiting', 'Silent', 'Far', 'Cosmic'], nouns: ['Nebula', 'Station', 'Starlight', 'Voyager', 'Comet', 'Void'] },
  rain: { adjectives: ['Gray', 'Soft', 'Steady', 'Gentle'], nouns: ['Raindrops', 'Umbrella', 'Puddles', 'Downpour', 'Windowpane', 'Drizzle'] },
  spa: { adjectives: ['Calm', 'Peaceful', 'Floating', 'Serene'], nouns: ['Retreat', 'Breath', 'Stillwater', 'Bamboo', 'Stones', 'Sunrise'] },
  campfire: { adjectives: ['Crackling', 'Starlit', 'Smoky', 'Open-Air'], nouns: ['Embers', 'Campsite', 'Trail', 'Sing-Along', 'Pines', 'Lakeshore'] },
  chiptune: { adjectives: ['Pixel', 'Bonus', 'Level', 'Hidden', 'High-Score'], nouns: ['Quest', 'Dungeon', 'Cartridge', 'Warp Zone', 'Boss Stage', 'Arcade'] },
  western: { adjectives: ['Dusty', 'Lone', 'Desert', 'Sundown'], nouns: ['Trail', 'Saloon', 'Canyon', 'Showdown', 'Ranch', 'Drifter'] },
  winter: { adjectives: ['Frosted', 'Snowy', 'White', 'Silent'], nouns: ['Sleigh Ride', 'Snowfall', 'Fireside', 'Icicle', 'Lodge', 'Cocoa'] },
  christmas: { adjectives: ['Twinkling', 'Merry', 'Silver', 'Snowy'], nouns: ['Sleigh Bells', 'Tree Lights', 'Fireplace', 'Stockings', 'Carolers', 'Evergreen'] },
  halloween: { adjectives: ['Haunted', 'Spooky', 'Crooked', 'Midnight'], nouns: ['Pumpkin Patch', 'Graveyard', 'Cauldron', 'Mansion', 'Black Cat', 'Moonlight'] },
  classical: { adjectives: ['Courtly', 'Graceful', 'Spring', 'Little'], nouns: ['Minuet', 'Sonatina', 'Waltz', 'Nocturne', 'Fantasia', 'Rondo'] },
  blues: { adjectives: ['Low-Down', 'Delta', 'Midnight', 'Rainy'], nouns: ['Crossroads', 'Porch Song', 'Railroad', 'Shuffle', 'Bottleneck', 'Back Road'] },
  rock: { adjectives: ['Loud', 'Open-Road', 'Electric', 'Burning'], nouns: ['Highway', 'Garage', 'Amp', 'Encore', 'Stage Lights', 'Riff'] },
  pop: { adjectives: ['Sparkling', 'Summer', 'Golden', 'Bright'], nouns: ['Radio', 'Daydream', 'Dance Floor', 'Rooftop', 'Chorus', 'Sunshine'] },
};

const GROUP_FLAVOR: Record<StyleGroup, { adjectives: string[]; nouns: string[] }> = {
  'Moods and genres': { adjectives: [], nouns: [] },
  'Eras and genres': { adjectives: ['Vintage', 'Retro', 'Classic'], nouns: ['Record', 'Jukebox', 'Dance Hall', 'Radio'] },
  'Seasons and holidays': { adjectives: ['Festive', 'Seasonal', 'Cheerful'], nouns: ['Celebration', 'Gathering', 'Parade', 'Tradition'] },
  'Places and settings': { adjectives: ['Local', 'Old-Town', 'Cozy'], nouns: ['Square', 'Market', 'Doorway', 'Courtyard'] },
};

const PATTERNS: Array<(a: string, n: string, n2: string) => string> = [
  (a, n) => `${a} ${n}`,
  (_a, n, n2) => `${n} and ${n2}`,
  (a, n) => `The ${a} ${n}`,
  (_a, n) => `${n} at Dusk`,
  (a, n) => `${n} in ${a} Light`,
  (_a, n) => `Over the ${n}`,
  (a, n) => `${a} ${n} Suite`,
];

/** A small seeded random number generator (mulberry32), so a title can be reproduced in a test. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** A random title for a tune in this style, e.g. "Smoky Corner" or "Late-Night Cafe Suite". */
export function randomTitle(style: string, group: StyleGroup, random: () => number = Math.random): string {
  const flavor = FLAVOR[style];
  const g = GROUP_FLAVOR[group];
  const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)];
  // Mostly the style's own words, with the general ones mixed in so titles do not run out.
  const adjectives = [...(flavor?.adjectives ?? []), ...(flavor?.adjectives ?? []), ...g.adjectives, ...GENERAL_ADJECTIVES];
  const nouns = [...(flavor?.nouns ?? []), ...(flavor?.nouns ?? []), ...g.nouns, ...GENERAL_NOUNS];
  const noun = pick(nouns);
  let second = pick(nouns);
  for (let i = 0; i < 5 && second === noun; i++) second = pick(nouns);
  return pick(PATTERNS)(pick(adjectives), noun, second);
}
