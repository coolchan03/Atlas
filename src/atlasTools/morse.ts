/** Morse code for light signalling (screen or torch). Standard timing: dot = 1 unit. */
const CODE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
  M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...',
  8: '---..', 9: '----.',
};

export const toMorse = (text: string) => text.toUpperCase().split('').map((c) => (c === ' ' ? '/' : CODE[c] ?? '')).filter(Boolean).join(' ');

/**
 * On/off durations in units: dot 1 on, dash 3 on, 1 off between parts, 3 off
 * between letters, 7 off between words. SOS is sent as one prosign (no letter gaps).
 */
export function morseTimeline(text: string, sosProsign = false): { on: boolean; units: number }[] {
  const out: { on: boolean; units: number }[] = [];
  const push = (on: boolean, units: number) => {
    const last = out[out.length - 1];
    if (last && last.on === on) last.units += units; else out.push({ on, units });
  };
  const words = text.toUpperCase().trim().split(/\s+/);
  words.forEach((w, wi) => {
    const letters = sosProsign && w === 'SOS' ? ['...---...'] : w.split('').map((c) => CODE[c] ?? '').filter(Boolean);
    letters.forEach((code, li) => {
      code.split('').forEach((sym, si) => {
        push(true, sym === '-' ? 3 : 1);
        if (si < code.length - 1) push(false, 1);
      });
      if (li < letters.length - 1) push(false, 3);
    });
    if (wi < words.length - 1) push(false, 7);
  });
  push(false, 7); // pause before repeating
  return out;
}
