/**
 * The simple side of Music Studio: say what you want in a few words, pick how lively it is, and get a track. The style is picked
 * from your words when they name one ("a rainy day jazz cafe" is jazz), and the page says which instruments will play, so nobody has
 * to choose a sound. Pure, so it is tested without a device.
 */
import { STYLES, specFor, type StyleMood } from './styles';

/** Words people use for each style. The first style whose word appears in the description wins, so the specific ones come first. */
const WORDS: Array<[StyleMood, RegExp]> = [
  ['metal', /\b(metal|thrash|heavy rock)\b/i], ['ska', /\bska\b/i], ['techno', /\btechno\b/i], ['house', /\bhouse music\b|\bdeep house\b/i], ['trap', /\btrap\b/i], ['soul', /\b(soul|r&b|rnb|motown)\b/i],
  ['gospel', /\b(gospel|choir)\b/i], ['flamenco', /\bflamenco\b/i], ['tango', /\btango\b/i], ['waltz', /\bwaltz\b/i], ['bluegrass', /\b(bluegrass|banjo)\b/i], ['afrobeat', /\bafrobeat\b/i],
  ['dreampop', /\b(dream ?pop|shoegaze)\b/i], ['cyberpunk', /\b(cyberpunk|blade runner|dystopi)/i], ['sunrise', /\b(sunrise|morning|dawn)\b/i], ['fantasy', /\b(fantasy|quest|dragon|elf|wizard)\b/i], ['ocean', /\b(underwater|ocean|under the sea|coral)\b/i],
  ['jazz', /\b(jazz|swing|bebop|sax|saxophone|speakeasy)\b/i], ['bossa', /\b(bossa|samba)\b/i], ['blues', /\bblues\b/i], ['lofi', /\b(lo-?fi|chill ?hop|study beats)\b/i],
  ['noir', /\b(noir|detective|mystery)\b/i], ['classical', /\b(classical|baroque|orchestra|mozart|sonata)\b/i], ['lullaby', /\b(lullaby|sleep|bedtime|baby)\b/i],
  ['rock', /\b(rock|guitar solo)\b/i], ['funk', /\bfunk/i], ['disco', /\bdisco\b/i], ['reggae', /\breggae\b/i], ['country', /\bcountry\b/i], ['hiphop', /\b(hip ?hop|boom bap|rap beat)\b/i],
  ['edm', /\b(edm|dance|club)\b/i], ['electro', /\b(electronic|synth|electro)\b/i], ['retro80s', /\b(80s|eighties|synthwave)\b/i], ['chiptune', /\b(8-?bit|chiptune|video ?game|arcade)\b/i],
  ['christmas', /\b(christmas|xmas|holiday season)\b/i], ['halloween', /\b(halloween|spooky|haunted)\b/i], ['italian', /\b(italian|pizzeria|trattoria)\b/i], ['frenchcafe', /\b(french|paris|cafe|café)\b/i],
  ['tavern', /\b(tavern|medieval|renaissance)\b/i], ['shanty', /\b(pirate|shanty|sailor)\b/i], ['western', /\b(western|cowboy|saloon)\b/i], ['campfire', /\b(campfire|folk|acoustic)\b/i],
  ['rain', /\b(rain|rainy|storm)\b/i], ['spa', /\b(spa|relax|calm|meditat|yoga|massage)\b/i], ['space', /\b(space|galaxy|cosmic|sci-?fi)\b/i], ['film', /\b(cinematic|epic|film|trailer|movie)\b/i],
  ['focus', /\b(focus|study|reading|work|concentrat|background)\b/i], ['pop', /\bpop\b/i], ['vaporwave', /\bvaporwave\b/i], ['eerie', /\b(eerie|fog|creepy)\b/i],
];

/** The style a description names, or null when it names none. */
export function styleFromText(text: string): StyleMood | null {
  return WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** The styles shown first. The rest are under "More styles". */
export const POPULAR: StyleMood[] = ['focus', 'jazz', 'lofi', 'classical', 'film', 'spa', 'rain', 'blues', 'bossa', 'electro', 'rock', 'campfire'];

const VOICE_WORDS = { piano: 'piano', epiano: 'electric piano', pluck: 'plucked guitar', driven: 'rock guitar', organ: 'organ', bell: 'bells', saw: 'synth', pad: 'warm pads', bass: 'bass', sine: 'soft tone' } as const;
/** Names for the extra players' instruments that are not in the list above. */
const EXTRA_WORDS: Record<string, string> = { sax: 'saxophone', vibes: 'vibraphone', trumpet: 'muted trumpet', flute: 'flute', cello: 'cello', violin: 'violin', horn: 'French horn', harp: 'harp', harmonica: 'harmonica', banjo: 'banjo', accordion: 'accordion', clarinet: 'clarinet', musicbox: 'music box', glock: 'glockenspiel', choir: 'choir', marimba: 'marimba', steeldrum: 'steel drum', synthpluck: 'synth pluck', glasspad: 'glass pad', warmpad: 'warm pad' };
const PERC_WORDS = { none: '', soft: 'soft drums', four: 'four-on-the-floor drums', swing: 'swing drums', sleigh: 'sleigh bells', industrial: 'industrial drums', backbeat: 'backbeat drums', offbeat: 'offbeat drums' } as const;

/** In plain words, which instruments play in a style: "piano, bass, swing drums". */
export function instrumentsOf(mood: StyleMood): string {
  const spec = specFor(mood);
  const band = spec.band ?? { melody: 'piano', pad: 'pad', bass: 'bass' };
  const names = [...new Set([band.melody, band.pad, band.bass].map((v) => VOICE_WORDS[v as keyof typeof VOICE_WORDS] ?? v))];
  const extras = (spec.extras ?? []).map((e) => VOICE_WORDS[e.voice as keyof typeof VOICE_WORDS] ?? EXTRA_WORDS[e.voice] ?? e.voice);
  const drums = PERC_WORDS[spec.perc];
  const all: string[] = [...new Set<string>([...names, ...extras])];
  return (drums ? [...all, drums] : all).join(', ');
}

export const styleLabel = (mood: StyleMood): string => STYLES[mood].label;
