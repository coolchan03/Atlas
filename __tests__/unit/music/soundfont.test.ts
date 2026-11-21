import { buildSf2 } from '../../helpers/buildSf2';
import { findPreset, parseSf2, renderNote } from '../../../src/music/soundfont';
import { PROGRAM, DRUM_KEY, loadSoundfontBytes, sampledNote, setActiveSoundfont } from '../../../src/music/sampled';
import { fromBase64, looksLikeSoundfont } from '../../../src/music/soundfontFiles';

/** The pitch of a sound, from where it crosses zero going up. */
function hzOf(wave: Float32Array, rate: number, from = 500, to = 4000): number {
  let first = -1; let last = -1; let n = 0;
  for (let i = from + 1; i < to; i++) if (wave[i - 1] < 0 && wave[i] >= 0) { if (first < 0) first = i; last = i; n++; }
  return n > 1 ? (n - 1) * rate / (last - first) : 0;
}

describe('SoundFont playback', () => {
  const sf = parseSf2(buildSf2());
  afterEach(() => setActiveSoundfont(null));

  it('reads the file: its name, presets and the drum kit', () => {
    expect(sf.name).toBe('Test font');
    expect(sf.presets.map((p) => `${p.bank}:${p.program}`)).toEqual(['0:0', '128:0']);
    expect(findPreset(sf, 0, 0)?.name).toBe('Sine Piano');
    expect(findPreset(sf, 0, 40)).toBeNull(); // no violin in this font
  });

  it('plays a note at the pitch asked for (a recording of A440 played an octave up sounds at 880), and a note that is held keeps sounding', () => {
    const a4 = renderNote(sf, { bank: 0, program: 0, key: 69, velocity: 100, held: 0.5, rate: 22050 })!;
    const a5 = renderNote(sf, { bank: 0, program: 0, key: 81, velocity: 100, held: 0.5, rate: 22050 })!;
    expect(hzOf(a4, 22050)).toBeGreaterThan(430); expect(hzOf(a4, 22050)).toBeLessThan(450);
    expect(hzOf(a5, 22050)).toBeGreaterThan(865); expect(hzOf(a5, 22050)).toBeLessThan(895);
    const energy = (w: Float32Array, a: number, b: number) => w.slice(a, b).reduce((s, x) => s + Math.abs(x), 0);
    expect(energy(a4, 9000, 10000)).toBeGreaterThan(100); // still sounding at 0.4 s: the sample is looped, not played once and stopped
    expect(Math.abs(a4[a4.length - 1])).toBeLessThan(0.01); // and it fades after the note ends
  });

  it('plays a drum from the drum kit by its key, once through, and has nothing for a key the kit lacks', () => {
    const kick = renderNote(sf, { bank: 128, program: 0, key: 36, velocity: 100, held: 0.1, rate: 22050, oneShot: true })!;
    expect(Math.max(...kick)).toBeGreaterThan(0.3);
    expect(renderNote(sf, { bank: 128, program: 0, key: 60, velocity: 100, held: 0.1, rate: 22050, oneShot: true })).toBeNull();
  });

  it('maps the composer\'s instruments and drums to General MIDI, brings each note to a common level, and falls back to the synthesiser when nothing fits', () => {
    expect(PROGRAM.piano).toBe(0); expect(PROGRAM.violin).toBe(40); expect(PROGRAM.bass).toBe(33); expect(DRUM_KEY.kick).toBe(36); expect(DRUM_KEY.snare).toBe(38);
    expect(sampledNote({ pitch: 69, beat: 0, length: 1, gain: 1 }, 'piano', { samples: 11025, rate: 22050 })).toBeNull(); // no SoundFont in use
    loadSoundfontBytes(buildSf2());
    const piano = sampledNote({ pitch: 69, beat: 0, length: 1, gain: 1 }, 'piano', { samples: 11025, rate: 22050 })!;
    expect(Math.max(...piano)).toBeCloseTo(0.55, 1);
    const soft = sampledNote({ pitch: 69, beat: 0, length: 1, gain: 0.5 }, 'piano', { samples: 11025, rate: 22050 })!;
    expect(Math.max(...soft)).toBeCloseTo(0.275, 1);
    expect(sampledNote({ pitch: 69, beat: 0, length: 1, gain: 1 }, 'violin', { samples: 11025, rate: 22050 })).toBeNull(); // this font has no violin: the synthesiser plays it
    expect(sampledNote({ pitch: 48, beat: 0, length: 0.25, gain: 1, role: 'perc', voice: 'kick' }, 'bass', { samples: 5000, rate: 22050 })).not.toBeNull();
  });

  it('refuses a file that is not a SoundFont, and reads base64', () => {
    expect(() => parseSf2(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toThrow(/not a SoundFont/);
    expect(looksLikeSoundfont(buildSf2().slice(0, 12))).toBe(true);
    expect(looksLikeSoundfont(new Uint8Array(12))).toBe(false);
    expect(Array.from(fromBase64('SGVsbG8='))).toEqual([72, 101, 108, 108, 111]);
  });
});
