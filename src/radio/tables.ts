/**
 * The dice tables of the AI radio. Everything a show is made of is picked from these lists, so a new genre, topic or subject is one line
 * of data and needs no code. `tags` are the words a station theme can match to make an entry more likely ("haunted" favours the ghost
 * topics and the eerie genres). `style` is one of the Music Studio styles, so a genre always has a real tune behind it.
 */
import type { Energy, StyleMood } from '../music/styles';

export interface Genre { id: string; label: string; style: StyleMood; /** Soft enough for "calm songs only" (sleep, reading). */ calm?: boolean; /** Makes the tune livelier or calmer than the style's own. */ energy?: Energy; /** Instruments to lean on (Music Studio instrument ids). */ lean?: string[]; tags: string[] }
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
  { id: 'jazz', label: 'jazz', style: 'jazz', calm: true, tags: ['jazz', 'smoky', 'night', 'cafe', 'lounge'] },
  { id: 'hiphop', label: 'hip hop', style: 'hiphop', tags: ['hip hop', 'rap', 'beat', 'city'] },
  { id: 'edm', label: 'dance', style: 'edm', energy: 'lively', tags: ['dance', 'club', 'edm', 'party', 'electronic'] },
  { id: 'lofi', label: 'lo-fi', style: 'lofi', calm: true, tags: ['lofi', 'chill', 'study', 'rain', 'cozy'] },
  { id: 'classical', label: 'classical', style: 'classical', calm: true, tags: ['classical', 'orchestra', 'elegant', 'old'] },
  { id: 'bossa', label: 'bossa nova', style: 'bossa', calm: true, tags: ['bossa', 'brazil', 'cafe', 'sunny'] },
  { id: 'western', label: 'western', style: 'western', tags: ['western', 'cowboy', 'desert', 'saloon'] },
  { id: 'chiptune', label: '8-bit', style: 'chiptune', tags: ['chiptune', 'game', 'arcade', 'robot', 'retro'] },
  { id: 'synthwave', label: 'synthwave', style: 'retro80s', tags: ['80s', 'synth', 'neon', 'retro', 'night drive'] },
  { id: 'surf', label: 'surf rock', style: 'surf', tags: ['surf', 'beach', 'ocean', 'summer', 'sea'] },
  { id: 'folk', label: 'folk', style: 'campfire', calm: true, tags: ['folk', 'campfire', 'acoustic', 'forest', 'story'] },
  { id: 'electro', label: 'electronic', style: 'electro', tags: ['electronic', 'synth', 'space', 'robot', 'future'] },
  { id: 'lullaby', label: 'lullaby', style: 'lullaby', calm: true, energy: 'calm', tags: ['lullaby', 'sleep', 'calm', 'baby', 'bedtime'] },
  { id: 'shanty', label: 'sea shanty', style: 'shanty', tags: ['pirate', 'sea', 'ship', 'sailor', 'ocean'] },
  { id: 'spooky', label: 'spooky', style: 'halloween', tags: ['haunted', 'ghost', 'spooky', 'horror', 'night', 'dark'] },
  { id: 'cinematic', label: 'cinematic', style: 'film', tags: ['epic', 'movie', 'hero', 'adventure', 'dramatic'] },
  // Every other Music Studio style is a genre too, so the radio can play anything the studio can make.
  { id: 'focus', label: 'focus music', style: 'focus', calm: true, tags: ['focus', 'study', 'work', 'quiet', 'desk'] },
  { id: 'vaporwave', label: 'vaporwave', style: 'vaporwave', calm: true, tags: ['vaporwave', 'mall', 'retro', 'dream', 'pastel'] },
  { id: 'eerie', label: 'eerie ambient', style: 'eerie', tags: ['eerie', 'fog', 'creepy', 'dark', 'haunted', 'mist'] },
  { id: 'noir', label: 'noir jazz', style: 'noir', calm: true, tags: ['noir', 'detective', 'mystery', 'rain', 'night', 'city'] },
  { id: 'space', label: 'space ambient', style: 'space', calm: true, tags: ['space', 'stars', 'cosmic', 'galaxy', 'future', 'night'] },
  { id: 'rain', label: 'rainy-day piano', style: 'rain', calm: true, tags: ['rain', 'storm', 'window', 'cozy', 'sad', 'gray'] },
  { id: 'spa', label: 'spa music', style: 'spa', calm: true, energy: 'calm', tags: ['spa', 'calm', 'relax', 'yoga', 'meditation', 'sleep'] },
  { id: 'spring', label: 'spring tune', style: 'spring', tags: ['spring', 'flowers', 'garden', 'bloom', 'morning'] },
  { id: 'summer', label: 'summer tune', style: 'summer', tags: ['summer', 'beach', 'sun', 'holiday', 'road trip'] },
  { id: 'fall', label: 'autumn tune', style: 'fall', calm: true, tags: ['fall', 'autumn', 'leaves', 'harvest', 'cozy', 'rain'] },
  { id: 'winter', label: 'winter waltz', style: 'winter', calm: true, tags: ['winter', 'snow', 'cold', 'frost', 'fireside'] },
  { id: 'thanksgiving', label: 'thanksgiving', style: 'thanksgiving', calm: true, tags: ['thanksgiving', 'harvest', 'family', 'dinner', 'grateful'] },
  { id: 'christmas', label: 'christmas', style: 'christmas', tags: ['christmas', 'holiday', 'snow', 'sleigh', 'santa', 'winter'] },
  { id: 'newyear', label: 'new year party', style: 'newyear', energy: 'lively', tags: ['new year', 'party', 'countdown', 'celebration', 'midnight'] },
  { id: 'valentines', label: 'love song', style: 'valentines', calm: true, tags: ['love', 'romance', 'valentine', 'heart', 'tender'] },
  { id: 'easter', label: 'spring festival', style: 'easter', tags: ['easter', 'spring', 'festival', 'eggs', 'bells'] },
  { id: 'july4', label: 'fourth of july', style: 'july4', tags: ['july', 'fireworks', 'parade', 'summer', 'independence', 'marching'] },
  { id: 'stpatricks', label: 'irish jig', style: 'stpatricks', tags: ['irish', 'jig', 'green', 'pub', 'dance', 'folk'] },
  { id: 'lunarnewyear', label: 'lunar new year', style: 'lunarnewyear', tags: ['lunar', 'new year', 'lantern', 'festival', 'dragon', 'family'] },
  { id: 'cincodemayo', label: 'fiesta', style: 'cincodemayo', tags: ['fiesta', 'mexico', 'party', 'guitar', 'dance', 'celebration'] },
  { id: 'italian', label: 'italian tarantella', style: 'italian', tags: ['italian', 'pasta', 'cafe', 'dinner', 'old world', 'accordion'] },
  { id: 'frenchcafe', label: 'french cafe', style: 'frenchcafe', calm: true, tags: ['french', 'paris', 'cafe', 'accordion', 'romance', 'morning'] },
  { id: 'tiki', label: 'tiki lounge', style: 'tiki', tags: ['tiki', 'island', 'cocktail', 'beach', 'exotic', 'palm'] },
  { id: 'tavern', label: 'tavern song', style: 'tavern', tags: ['tavern', 'medieval', 'pub', 'bard', 'castle', 'ale'] },
  { id: 'carnival', label: 'carnival', style: 'carnival', energy: 'lively', tags: ['carnival', 'circus', 'fair', 'clown', 'ride', 'funfair'] },
  { id: 'twenties', label: '1920s jazz', style: 'twenties', tags: ['1920s', 'roaring', 'speakeasy', 'gatsby', 'charleston', 'old'] },
  { id: 'fifties', label: '1950s rock and roll', style: 'fifties', tags: ['1950s', 'diner', 'sock hop', 'rock and roll', 'jukebox', 'retro'] },
  { id: 'march', label: 'marching band', style: 'march', tags: ['march', 'parade', 'band', 'soldier', 'brass', 'drums'] },
  { id: 'metal', label: 'heavy metal', style: 'metal', energy: 'lively', lean: ['driven', 'bass'], tags: ['metal', 'loud', 'dark', 'angry', 'dragon', 'war'] },
  { id: 'ska', label: 'ska', style: 'ska', energy: 'lively', tags: ['ska', 'skank', 'upbeat', 'dance', 'horns', 'summer'] },
  { id: 'techno', label: 'techno', style: 'techno', energy: 'lively', tags: ['techno', 'club', 'warehouse', 'robot', 'night', 'electronic'] },
  { id: 'house', label: 'house music', style: 'house', tags: ['house', 'club', 'dance', 'party', 'night', 'electronic'] },
  { id: 'trap', label: 'trap beat', style: 'trap', tags: ['trap', 'hip hop', 'city', 'night', 'street', 'beat'] },
  { id: 'soul', label: 'soul', style: 'soul', tags: ['soul', 'r&b', 'love', 'motown', 'smooth', 'heart'] },
  { id: 'gospel', label: 'gospel', style: 'gospel', tags: ['gospel', 'church', 'choir', 'hope', 'sunday', 'praise'] },
  { id: 'flamenco', label: 'flamenco', style: 'flamenco', tags: ['flamenco', 'spain', 'guitar', 'passion', 'dance', 'fire'] },
  { id: 'tango', label: 'tango', style: 'tango', tags: ['tango', 'argentina', 'passion', 'dance', 'night', 'drama'] },
  { id: 'waltz', label: 'waltz', style: 'waltz', calm: true, tags: ['waltz', 'ballroom', 'elegant', 'old', 'dance', 'palace'] },
  { id: 'bluegrass', label: 'bluegrass', style: 'bluegrass', tags: ['bluegrass', 'banjo', 'hills', 'barn', 'farm', 'fiddle'] },
  { id: 'afrobeat', label: 'afrobeat', style: 'afrobeat', tags: ['afrobeat', 'africa', 'groove', 'dance', 'sun', 'drums'] },
  { id: 'dreampop', label: 'dream pop', style: 'dreampop', calm: true, tags: ['dream', 'hazy', 'soft', 'night', 'floating', 'shoegaze'] },
  { id: 'cyberpunk', label: 'cyberpunk', style: 'cyberpunk', tags: ['cyberpunk', 'neon', 'city', 'robot', 'future', 'rain', 'night'] },
  { id: 'sunrise', label: 'sunrise', style: 'sunrise', calm: true, tags: ['sunrise', 'morning', 'dawn', 'hope', 'bird', 'new day'] },
  { id: 'fantasy', label: 'fantasy quest', style: 'fantasy', tags: ['fantasy', 'quest', 'dragon', 'elf', 'wizard', 'castle', 'forest', 'adventure'] },
  { id: 'ocean', label: 'under the sea', style: 'ocean', calm: true, tags: ['ocean', 'underwater', 'sea', 'whale', 'coral', 'deep', 'sleep'] },
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

export const TONES = ['silly', 'tender', 'dramatic', 'deadpan', 'hopeful', 'grumpy', 'dreamy', 'boastful', 'mournful', 'cheerful', 'mysterious', 'playful', 'wistful', 'sarcastic', 'eerie', 'triumphant', 'romantic', 'nostalgic', 'rebellious', 'sleepy'] as const;
export type Tone = typeof TONES[number];
/** The tones used when only calm songs are wanted. */
export const CALM_TONES: readonly Tone[] = ['tender', 'dreamy', 'hopeful', 'mournful', 'mysterious', 'wistful', 'nostalgic', 'sleepy'];

/** The shape of a poem: stanzas, lines in each, and which line ends rhyme. */
export interface Form { id: string; stanzas: number; lines: number; scheme: 'AABB' | 'ABAB' | 'ABCB' | 'AA' }
export const FORMS: Form[] = [
  { id: '2x4-aabb', stanzas: 2, lines: 4, scheme: 'AABB' },
  { id: '2x4-abab', stanzas: 2, lines: 4, scheme: 'ABAB' },
  { id: '3x4-aabb', stanzas: 3, lines: 4, scheme: 'AABB' },
  { id: '3x4-abcb', stanzas: 3, lines: 4, scheme: 'ABCB' },
  { id: '4x2-aa', stanzas: 4, lines: 2, scheme: 'AA' },
  { id: '1x4-aabb', stanzas: 1, lines: 4, scheme: 'AABB' },
  { id: '3x2-aa', stanzas: 3, lines: 2, scheme: 'AA' },
  { id: '2x4-abcb', stanzas: 2, lines: 4, scheme: 'ABCB' },
  { id: '1x4-abab', stanzas: 1, lines: 4, scheme: 'ABAB' },
];

/** How long the song plays before the next one, in seconds. The tune is short and loops until this time is up (never more than five minutes). */
export const SONG_SECONDS = [60, 90, 120, 150, 180, 240, 300] as const;
export const MAX_SONG_SECONDS = 300;

export const ENERGIES: Energy[] = ['calm', 'medium', 'medium', 'lively'];
/** Instruments a roll can ask the tune to lean on (Music Studio ids). Matched with the genre's own `lean` list. */
export const SPOTLIGHTS = ['piano', 'sax', 'violin', 'flute', 'trumpet', 'harp', 'marimba', 'vibes', 'kalimba', 'organ', 'banjo', 'harmonica', 'cello', 'accordion', 'steeldrum', 'bell'] as const;
