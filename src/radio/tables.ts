/**
 * The dice tables of the AI radio. Everything a show is made of is picked from these lists, so a new genre, topic or subject is one line
 * of data and needs no code. `tags` are the words a station theme can match to make an entry more likely ("haunted" favours the ghost
 * topics and the eerie genres). `style` is one of the Music Studio styles, so a genre always has a real tune behind it.
 */
import type { Energy, StyleMood } from '../music/styles';

export interface Genre { id: string; label: string; style: StyleMood; /** Makes the tune livelier or calmer than the style's own. */ energy?: Energy; /** Instruments to lean on (Music Studio instrument ids). */ lean?: string[]; tags: string[] }
export interface Entry { id: string; text: string; tags: string[] }

export const GENRES: Genre[] = [
  { id: 'pop', label: 'pop', style: 'pop', tags: ['pop', 'catchy', 'radio'] },
  { id: 'punk', label: 'punk', style: 'rock', energy: 'lively', lean: ['driven', 'bass'], tags: ['punk', 'angry', 'loud', 'garage'] },
  { id: 'rock', label: 'rock', style: 'rock', tags: ['rock', 'guitar', 'loud'] },
  { id: 'funk', label: 'funk', style: 'funk', tags: ['funk', 'groove', 'dance'] },
  { id: 'disco', label: 'disco', style: 'disco', tags: ['disco', 'dance', '70s', 'party'] },
  { id: 'reggae', label: 'reggae', style: 'reggae', tags: ['reggae', 'island', 'beach', 'chill'] },
  { id: 'country', label: 'country', style: 'country', tags: ['country', 'farm', 'truck', 'small town', 'cowboy'] },
  { id: 'blues', label: 'blues', style: 'blues', tags: ['blues', 'sad', 'lonely', 'night'] },
  { id: 'jazz', label: 'jazz', style: 'jazz', tags: ['jazz', 'smoky', 'night', 'cafe', 'lounge'] },
  { id: 'hiphop', label: 'hip hop', style: 'hiphop', tags: ['hip hop', 'rap', 'beat', 'city'] },
  { id: 'edm', label: 'dance', style: 'edm', energy: 'lively', tags: ['dance', 'club', 'edm', 'party', 'electronic'] },
  { id: 'lofi', label: 'lo-fi', style: 'lofi', tags: ['lofi', 'chill', 'study', 'rain', 'cozy'] },
  { id: 'classical', label: 'classical', style: 'classical', tags: ['classical', 'orchestra', 'elegant', 'old'] },
  { id: 'bossa', label: 'bossa nova', style: 'bossa', tags: ['bossa', 'brazil', 'cafe', 'sunny'] },
  { id: 'western', label: 'western', style: 'western', tags: ['western', 'cowboy', 'desert', 'saloon'] },
  { id: 'chiptune', label: '8-bit', style: 'chiptune', tags: ['chiptune', 'game', 'arcade', 'robot', 'retro'] },
  { id: 'synthwave', label: 'synthwave', style: 'retro80s', tags: ['80s', 'synth', 'neon', 'retro', 'night drive'] },
  { id: 'surf', label: 'surf rock', style: 'surf', tags: ['surf', 'beach', 'ocean', 'summer', 'sea'] },
  { id: 'folk', label: 'folk', style: 'campfire', tags: ['folk', 'campfire', 'acoustic', 'forest', 'story'] },
  { id: 'electro', label: 'electronic', style: 'electro', tags: ['electronic', 'synth', 'space', 'robot', 'future'] },
  { id: 'lullaby', label: 'lullaby', style: 'lullaby', energy: 'calm', tags: ['lullaby', 'sleep', 'calm', 'baby', 'bedtime'] },
  { id: 'shanty', label: 'sea shanty', style: 'shanty', tags: ['pirate', 'sea', 'ship', 'sailor', 'ocean'] },
  { id: 'spooky', label: 'spooky', style: 'halloween', tags: ['haunted', 'ghost', 'spooky', 'horror', 'night', 'dark'] },
  { id: 'cinematic', label: 'cinematic', style: 'film', tags: ['epic', 'movie', 'hero', 'adventure', 'dramatic'] },
];

const e = (text: string, ...tags: string[]): Entry => ({ id: text.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), text, tags });

/** What the song is about. */
export const TOPICS: Entry[] = [
  e('a love song', 'love', 'romance'), e('a breakup', 'sad', 'love'), e('revenge', 'angry', 'dark'), e('a road trip', 'travel', 'car', 'adventure'),
  e('a rainy day', 'rain', 'cozy', 'weather'), e('a midnight snack', 'night', 'food', 'funny'), e('lost keys', 'funny', 'home'), e('the first day of school', 'school', 'kids'),
  e('a long commute', 'city', 'work', 'train'), e('missing home', 'sad', 'home', 'travel'), e('sunrise', 'morning', 'hope'), e('a thunderstorm', 'weather', 'night', 'dark'),
  e('a haunted house', 'haunted', 'ghost', 'spooky', 'horror'), e('moving away', 'sad', 'travel'), e('a Monday morning', 'work', 'funny', 'morning'),
  e('a summer romance', 'love', 'summer', 'beach'), e('a birthday', 'party', 'happy'), e('an unlikely hero', 'hero', 'adventure', 'epic'),
  e('the last bus home', 'night', 'city', 'lonely'), e('a very tall tree', 'forest', 'nature'), e('a forgotten umbrella', 'rain', 'funny'),
  e('a small town', 'small town', 'country'), e('the big city', 'city', 'night'), e('campfire stories', 'campfire', 'forest', 'story'), e('the open sea', 'sea', 'ocean', 'ship', 'pirate'),
  e('the mountains', 'nature', 'adventure'), e('travelling to space', 'space', 'future', 'robot'), e('a time machine', 'future', 'adventure', 'space'),
  e('a robot learning to dance', 'robot', 'future', 'funny', 'dance'), e('a secret garden', 'nature', 'mystery'), e('the library at night', 'night', 'study', 'mystery', 'cozy'),
  e('a cup of coffee', 'cafe', 'morning', 'cozy'), e('a power cut', 'night', 'funny', 'dark'), e('laundry day', 'home', 'funny'), e('a traffic jam', 'city', 'car', 'funny', 'angry'),
  e('a lost sock', 'funny', 'home'), e('a wedding', 'love', 'party', 'happy'), e('an old friend coming back', 'friend', 'happy', 'sad'), e('a new year', 'party', 'hope'),
  e('a long nap', 'sleep', 'calm', 'cozy'), e('a stubborn mule', 'country', 'funny', 'farm'), e('a missing cat', 'funny', 'home', 'sad'), e('a lighthouse in a storm', 'sea', 'night', 'weather', 'lonely'),
  e('a noisy neighbour', 'funny', 'angry', 'home'), e('a lucky penny', 'hope', 'funny'), e('a broken phone', 'funny', 'angry', 'future'), e('the last slice of pizza', 'food', 'funny', 'party'),
  e('a dance in the kitchen', 'dance', 'love', 'home'), e('a treasure map', 'pirate', 'adventure', 'sea'), e('a night drive', 'night', 'car', 'neon', 'lonely'), e('the end of summer', 'sad', 'summer', 'beach'),
];

/** Who or what it is about. */
export const SUBJECTS: Entry[] = [
  e('my ex-husband', 'angry', 'love'), e('my dog', 'pet', 'happy', 'funny'), e('a best friend', 'friend', 'happy'), e('a grumpy cat', 'pet', 'funny'), e('a stranger on a train', 'train', 'mystery', 'city'),
  e('the neighbour', 'home', 'funny'), e('the moon', 'night', 'space', 'dream'), e('a pirate', 'pirate', 'sea', 'ship'), e('a robot', 'robot', 'future', 'space'), e('my grandmother', 'home', 'old', 'happy'),
  e('a mail carrier', 'small town', 'funny'), e('a taxi driver', 'city', 'night'), e('a lighthouse keeper', 'sea', 'lonely', 'night'), e('a ghost', 'ghost', 'haunted', 'spooky'), e('a farmer', 'farm', 'country'),
  e('a goldfish', 'pet', 'funny'), e('a rival', 'angry'), e('a teacher', 'school'), e('a dragon', 'adventure', 'epic', 'story'), e('an old friend', 'friend', 'sad'), e('a barista', 'cafe', 'city'),
  e('a truck driver', 'country', 'car', 'night'), e('a chef', 'food', 'funny'), e('a magician', 'mystery', 'funny'), e('a pigeon', 'city', 'funny'), e('the boss', 'work', 'angry', 'funny'),
  e('a twin sister', 'home', 'friend'), e('the mayor', 'small town', 'funny'), e('an astronaut', 'space', 'future', 'hero'), e('a snowman', 'winter', 'funny'), e('a clown', 'funny', 'spooky'),
  e('a knight', 'hero', 'epic', 'adventure'), e('a baby', 'sleep', 'calm', 'home'), e('a scarecrow', 'farm', 'spooky', 'country'), e('a detective', 'mystery', 'night', 'city'), e('a sailor', 'sea', 'ship', 'pirate'),
  e('the weatherman', 'weather', 'funny'), e('a travelling band', 'music', 'travel', 'party'), e('my little brother', 'home', 'funny', 'friend'), e('a stray puppy', 'pet', 'happy', 'sad'), e('a night watchman', 'night', 'lonely', 'mystery'),
];

export const TONES = ['silly', 'tender', 'dramatic', 'deadpan', 'hopeful', 'grumpy', 'dreamy', 'boastful', 'mournful', 'cheerful', 'mysterious', 'playful'] as const;
export type Tone = typeof TONES[number];

/** The shape of a poem: stanzas, lines in each, and which line ends rhyme. */
export interface Form { id: string; stanzas: number; lines: number; scheme: 'AABB' | 'ABAB' | 'ABCB' | 'AA' }
export const FORMS: Form[] = [
  { id: '2x4-aabb', stanzas: 2, lines: 4, scheme: 'AABB' },
  { id: '2x4-abab', stanzas: 2, lines: 4, scheme: 'ABAB' },
  { id: '3x4-aabb', stanzas: 3, lines: 4, scheme: 'AABB' },
  { id: '3x4-abcb', stanzas: 3, lines: 4, scheme: 'ABCB' },
  { id: '4x2-aa', stanzas: 4, lines: 2, scheme: 'AA' },
  { id: '1x4-aabb', stanzas: 1, lines: 4, scheme: 'AABB' },
];

/** How long the song plays before the next one, in seconds. The tune is short and loops until this time is up (never more than five minutes). */
export const SONG_SECONDS = [60, 90, 120, 150, 180, 240, 300] as const;
export const MAX_SONG_SECONDS = 300;

export const ENERGIES: Energy[] = ['calm', 'medium', 'medium', 'lively'];
/** Instruments a roll can ask the tune to lean on (Music Studio ids). Matched with the genre's own `lean` list. */
export const SPOTLIGHTS = ['piano', 'sax', 'violin', 'flute', 'trumpet', 'harp', 'marimba', 'vibes', 'kalimba', 'organ', 'banjo', 'harmonica', 'cello', 'accordion', 'steeldrum', 'bell'] as const;
