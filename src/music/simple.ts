/**
 * The simple side of Music Studio: say what you want in a few words, pick how lively it is, and get a track. The style is picked
 * from your words when they name one ("a rainy day jazz cafe" is jazz), and the page says which instruments will play, so nobody has
 * to choose a sound. Pure, so it is tested without a device.
 */
import { STYLES, specFor, type StyleMood } from './styles';

/** Words people use for each style. The first style whose word appears in the description wins, so the specific ones come first. */
const WORDS: Array<[StyleMood, RegExp]> = [
  ['jazz', /\b(jazz|swing|bebop|sax|saxophone|speakeasy)\b/i], ['bossa', /\b(bossa|samba)\b/i], ['blues', /\bblues\b/i], ['lofi', /\b(lo-?fi|chill ?hop|study beats)\b/i],
  ['noir', /\b(noir|detective|mystery)\b/i], ['classical', /\b(classical|baroque|orchestra|mozart|sonata)\b/i], ['lullaby', /\b(lullaby|sleep|bedtime|baby)\b/i],
  ['rock', /\b(rock|guitar solo|metal)\b/i], ['funk', /\bfunk/i], ['disco', /\bdisco\b/i], ['reggae', /\breggae\b/i], ['country', /\bcountry\b/i], ['hiphop', /\b(hip ?hop|boom bap|rap beat)\b/i],
  ['edm', /\b(edm|dance|club|house music|techno)\b/i], ['electro', /\b(electronic|synth|electro)\b/i], ['retro80s', /\b(80s|eighties|synthwave)\b/i], ['chiptune', /\b(8-?bit|chiptune|video ?game|arcade)\b/i],
  ['christmas', /\b(christmas|xmas|holiday season)\b/i], ['halloween', /\b(halloween|spooky|haunted)\b/i], ['italian', /\b(italian|pizzeria|trattoria)\b/i], ['frenchcafe', /\b(french|paris|cafe|café)\b/i],
  ['tavern', /\b(tavern|medieval|renaissance|fantasy)\b/i], ['shanty', /\b(pirate|shanty|sailor)\b/i], ['western', /\b(western|cowboy|saloon)\b/i], ['campfire', /\b(campfire|folk|acoustic)\b/i],
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
const PERC_WORDS = { none: '', soft: 'soft drums', four: 'four-on-the-floor drums', swing: 'swing drums', sleigh: 'sleigh bells', industrial: 'industrial drums', backbeat: 'backbeat drums', offbeat: 'offbeat drums' } as const;

/** In plain words, which instruments play in a style: "piano, bass, swing drums". */
export function instrumentsOf(mood: StyleMood): string {
  const spec = specFor(mood);
  const band = spec.band ?? { melody: 'piano', pad: 'pad', bass: 'bass' };
  const names = [...new Set([band.melody, band.pad, band.bass].map((v) => VOICE_WORDS[v as keyof typeof VOICE_WORDS] ?? v))];
  const drums = PERC_WORDS[spec.perc];
  return [...names, ...(drums ? [drums] : [])].join(', ');
}

export const styleLabel = (mood: StyleMood): string => STYLES[mood].label;
