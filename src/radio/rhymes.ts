/**
 * Words that rhyme, in groups. The radio does not ask a tiny model to find rhymes (spelling is not sound, and small models are poor at it):
 * the dice give each line a few words to end with, from these groups, and the model writes the rest of the line. Every word in a group
 * rhymes with every other, and all are short, common words. A new group is one more string.
 */
const RHYME_GROUPS: string[] = [
  'night light sight bright right flight white tonight',
  'day way say play stay gray away today',
  'sea free tree me be key three see tea knee bee flea',
  'heart part start art apart',
  'love above dove glove',
  'rain train again pain lane chain plane main',
  'home roam foam dome gnome',
  'time rhyme climb chime lime prime',
  'moon soon tune june spoon noon balloon',
  'sky high fly by try cry why goodbye pie lie die tie dry',
  'ground sound round found around bound hound',
  'town down brown crown clown gown frown',
  'door more floor shore roar four store before',
  'stone alone bone phone known grown throne',
  'fire higher wire desire choir tire',
  'song long strong along wrong belong',
  'blue true new you through view crew grew',
  'go slow know show glow flow snow low below',
  'hand land stand sand band grand',
  'cat hat mat sat flat chat',
  'dog log fog frog jog',
  'bed head said red instead ahead',
  'dream stream team seem cream beam',
  'road load toad showed owed',
  'name game same flame came fame',
  'tall ball wall call all fall small hall',
  'face place space race grace lace',
  'hill still will fill chill thrill',
  'cold old gold told hold bold',
  'bell tell well spell yell sell',
  'mine line fine shine sign wine pine',
  'cake make take lake wake shake',
  'bear care share air hair there stair chair prayer spare',
  'seat feet street meet sweet beat heat',
  'boat coat float note goat wrote',
  'bus fuss plus us discuss',
  'mouse house louse spouse',
  'wind find kind mind behind blind',
  'deep sleep keep sheep creep weep',
  'bite kite height tight write fight quite',
  'jump bump lump pump dump',
  'ship trip slip grip drip',
  'ring sing king wing spring string thing bring',
  'smile mile while style pile',
  'lead need speed seed read weed',
  'turn learn burn return earn',
  'storm warm form swarm',
  'wave brave save gave cave grave',
  'cloud loud proud crowd allowed',
  'pool cool rule school fool',
  'green seen clean mean queen between',
  'spin win grin begin thin skin',
  'toast coast most host ghost post',
  'soul whole role goal control',
  'wish fish dish',
  'hot spot lot pot dot not got',
  'beach reach teach each speech peach',
  'clock rock sock block lock knock shock',
  'run sun fun one done begun',
];

const GROUPS = RHYME_GROUPS.map((g) => g.split(' '));

/** The group a word is in, or -1. */
const groupOf = (word: string): number => GROUPS.findIndex((g) => g.includes(word));

/** True when both words are in one group (a sure rhyme). */
export function sureRhyme(a: string, b: string): boolean {
  const g = groupOf(a);
  return g >= 0 && a !== b && GROUPS[g].includes(b);
}

/** The words in a random order. */
function shuffled(words: string[], rng: () => number): string[] {
  const out = [...words];
  for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/**
 * The words each line may end with. Lines that must rhyme (the same letter in a stanza's scheme) draw from one group, and the group is
 * split between them, so each line has a few words of its own to choose from and no two lines can end in the same word. The model picks
 * the word that fits its line best; the grammar allows only these words, so the rhyme always holds.
 */
export function pickRhymeGroups(scheme: string, stanzas: number, rng: () => number): string[][] {
  const used = new Set<number>();
  const lines: string[][] = [];
  const fresh = (): number => { let g = Math.floor(rng() * GROUPS.length); for (let i = 0; i < GROUPS.length && used.has(g); i += 1) g = (g + 1) % GROUPS.length; used.add(g); return g; };
  for (let s = 0; s < stanzas; s += 1) {
    const stanza: string[][] = scheme.split('').map(() => []);
    for (const letter of new Set(scheme)) {
      const at = scheme.split('').flatMap((l, i) => (l === letter ? [i] : []));
      const words = shuffled(GROUPS[fresh()], rng);
      at.forEach((line, k) => { stanza[line] = words.filter((_, w) => w % at.length === k); });
    }
    lines.push(...stanza);
  }
  return lines;
}
