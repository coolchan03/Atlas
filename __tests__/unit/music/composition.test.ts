import type { MusicMood, SoundPreset } from '../../../src/music/composition';
import { composeInstrumental, parseMusicScore, renderMusic } from '../../../src/music/composition';

const source = 'TITLE: Morning study\nBPM: 110\nNOTE C4 0 1 0.8 pad\nNOTE E4 1 1 0.6\nNOTE G4 2 1 0.7\nNOTE C5 3 2 0.8\nLYRIC: should be ignored';

describe('Original instrumental music (no singing/lyrics)', () => {
  it('parses a bounded note score, never records lyrics', () => {
    const score = parseMusicScore(source);
    expect(score.notes).toHaveLength(4);
    expect(score.notes[0].role).toBe('pad');
    expect(score.bpm).toBe(110);
    expect('lyrics' in score).toBe(false);
  });
  it('rejects unstructured and unsafe-long scores', () => {
    expect(() => parseMusicScore('Great song!')).toThrow(/instrumental/);
    expect(() => parseMusicScore('NOTE Z4 0 1')).toThrow();
    expect(() => parseMusicScore(source.replace('110', '60').replace('NOTE C5 3 2', 'NOTE C5 96 12'))).toThrow(/limit/);
  });
  it('composes deterministic, multi-part notes without needing an AI model', () => {
    const a = composeInstrumental('Quiet music for reading', 'ambient');
    const b = composeInstrumental('Quiet music for reading', 'ambient');
    expect(a).toEqual(b);
    expect(a.notes.some((n) => n.role === 'pad')).toBe(true);
    expect(a.notes.some((n) => n.role === 'bass')).toBe(true);
    expect(a.notes.some((n) => n.role === 'melody')).toBe(true);
  });
  it('renders non-silent 30-second audio with no clipped samples and clean fade', () => {
    const pcm = renderMusic(composeInstrumental('Focus', 'study'), { preset: 'ambient', seconds: 30 });
    expect(pcm.length).toBe(720000);
    expect(pcm.some((sample) => sample !== 0)).toBe(true);
    expect(pcm[0]).toBe(0);
    expect(pcm[pcm.length - 1]).toBe(0);
    let peak = 0;
    for (const n of pcm) peak = Math.max(peak, Math.abs(n));
    expect(peak).toBeLessThan(32767);
  });
  it('caps runtime output and refuses extreme duration', () => {
    expect(() => renderMusic(parseMusicScore(source), { seconds: 200 })).toThrow(/duration/);
  });
});

describe('Style presets (jazz, vaporwave, eerie, seasons, holidays, eras and places)', () => {
  const { STYLES } = require('../../../src/music/styles') as { STYLES: Record<string, { label: string; sound: SoundPreset }> };
  it.each(Object.keys(STYLES))('%s makes a deterministic, playable tune', (style) => {
    const a = composeInstrumental('a quiet evening', style as MusicMood);
    expect(composeInstrumental('a quiet evening', style as MusicMood)).toEqual(a);
    expect(a.title).toContain(STYLES[style].label);
    expect(a.notes.some((n: { role?: string }) => n.role === 'pad')).toBe(true);
    expect(a.notes.some((n: { role?: string }) => n.role === 'melody')).toBe(true);
    expect(a.bpm).toBeGreaterThanOrEqual(60);
    expect(a.bpm).toBeLessThanOrEqual(165);
  });
  it.each(['jazz', 'rock', 'vaporwave', 'edm', 'christmas', 'country'])('%s renders to audio that does not clip', (style) => {
    const pcm = renderMusic(composeInstrumental('x', style as MusicMood), { preset: STYLES[style].sound, seconds: 6 });
    let peak = 0;
    for (const v of pcm) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(1000);
    expect(peak).toBeLessThan(32767);
  });
  it('keeps each style apart: jazz swings, Christmas has sleigh ticks, eerie holds a drone, rock has a backbeat', () => {
    expect(composeInstrumental('x', 'jazz').notes.some((n) => n.role === 'melody' && !Number.isInteger(n.beat * 2))).toBe(true);
    expect(composeInstrumental('x', 'christmas').notes.some((n) => n.role === 'perc')).toBe(true);
    expect(composeInstrumental('x', 'eerie').notes.filter((n) => n.role === 'bass')).toHaveLength(16);
    const rock = composeInstrumental('x', 'rock').notes.filter((n) => n.role === 'perc');
    expect(rock.some((n) => n.pitch < 60)).toBe(true); // a kick
    expect(rock.some((n) => n.pitch >= 60 && n.pitch < 86)).toBe(true); // a snare
  });
});

describe('instruments sound different from each other and behave like what they are', () => {
  const { noteWave } = require('../../../src/music/instruments');
  const RATE = 24000;
  const note = { pitch: 60, beat: 0, length: 2, gain: 1, role: 'melody' as const };
  const wave = (preset: SoundPreset, n = note) => noteWave(n, { samples: Math.round(n.length * RATE), rate: RATE, preset }) as Float32Array;
  const rms = (w: Float32Array, from: number, to: number) => { let e = 0; for (let i = from; i < to; i++) e += w[i] * w[i]; return Math.sqrt(e / (to - from)); };
  /** How much of the sound is high-frequency detail: the energy of the sample-to-sample change over the energy itself. */
  const brightness = (w: Float32Array) => { let d = 0; let e = 0; for (let i = 1; i < w.length; i++) { d += (w[i] - w[i - 1]) ** 2; e += w[i] ** 2; } return d / e; };

  it('a struck piano note dies away while an organ note holds', () => {
    const piano = wave('keys');
    const organ = wave('organ');
    expect(rms(piano, 0, 2400)).toBeGreaterThan(rms(piano, 24000, 26400) * 3);
    expect(rms(organ, 24000, 26400)).toBeGreaterThan(rms(organ, 0, 2400) * 0.7);
  });
  it('a guitar is brighter than a pad, and overdrive is squashed flatter than a clean guitar', () => {
    expect(brightness(wave('guitar'))).toBeGreaterThan(brightness(wave('ambient')) * 2);
    const crest = (w: Float32Array) => Math.max(...w.map(Math.abs)) / rms(w, 0, w.length);
    expect(crest(wave('overdrive'))).toBeLessThan(crest(wave('guitar')));
  });
  it('a kick is low, a snare is noisy and a hi-hat is bright', () => {
    const hit = (pitch: number) => wave('keys', { pitch, beat: 0, length: 0.5, gain: 1, role: 'perc' as any });
    expect(brightness(hit(91))).toBeGreaterThan(brightness(hit(80)));
    expect(brightness(hit(80))).toBeGreaterThan(brightness(hit(40)) * 5);
  });
  it('every instrument makes sound', () => {
    for (const p of ['keys', 'bell', 'synth', 'ambient', 'epiano', 'guitar', 'overdrive', 'organ'] as SoundPreset[]) expect(rms(wave(p), 0, 4800)).toBeGreaterThan(0.01);
  });
});

describe('the tunes are music, not noise: form, harmony, motifs, fills and a band', () => {
  const { STYLES, specFor } = require('../../../src/music/styles') as { STYLES: Record<string, any>; specFor: (m: string) => any };
  const { chordPitchClasses, seedFor, BARS } = require('../../../src/music/arrange');
  const tune = (style: string) => composeInstrumental('a quiet evening', style as MusicMood);
  const bar = (score: any, role: string, b: number, bpb: number) => score.notes.filter((n: any) => n.role === role && n.beat >= b * bpb && n.beat < (b + 1) * bpb).sort((x: any, y: any) => x.beat - y.beat);

  it.each(Object.keys(STYLES))('%s is 16 bars long, in two sections, with a different chord in the B section from the A section somewhere', (style) => {
    const spec = specFor(style);
    const score = tune(style);
    const end = Math.max(...score.notes.map((n: any) => n.beat));
    expect(end).toBeGreaterThan((BARS - 1) * spec.beatsPerBar);
    expect(end).toBeLessThan(BARS * spec.beatsPerBar);
    const seed = seedFor('a quiet evening', style);
    const a = Array.from({ length: 8 }, (_, i) => chordPitchClasses(spec, seed, i).join());
    const b = Array.from({ length: 8 }, (_, i) => chordPitchClasses(spec, seed, i + 8).join());
    expect(a.join('|')).not.toBe(b.join('|'));
  });
  it.each(['jazz', 'rock', 'country', 'pop', 'classical', 'bossa', 'funk', 'blues'])('%s: the first melody note of every bar is a note of that bar\'s chord', (style) => {
    const spec = specFor(style);
    const score = tune(style);
    const seed = seedFor('a quiet evening', style);
    for (let b = 0; b < BARS; b++) {
      const first = bar(score, 'melody', b, spec.beatsPerBar)[0];
      if (!first) continue;
      expect(chordPitchClasses(spec, seed, b)).toContain(first.pitch % 12);
    }
  });
  it('a melody repeats its shape: the up-and-down contour of bar 1 comes back in bar 5', () => {
    for (const style of ['jazz', 'rock', 'pop', 'country']) {
      const spec = specFor(style);
      const shape = (b: number) => { const ns = bar(tune(style), 'melody', b, spec.beatsPerBar); return ns.slice(1).map((n: any, i: number) => Math.sign(n.pitch - ns[i].pitch)).join(); };
      expect(shape(4)).toBe(shape(0));
    }
  });
  it('drums fill the last beat of each section', () => {
    for (const style of ['rock', 'pop', 'country', 'funk']) {
      const spec = specFor(style);
      const hits = (b: number) => bar(tune(style), 'perc', b, spec.beatsPerBar).filter((n: any) => n.beat >= (b + 1) * spec.beatsPerBar - 1).length;
      expect(hits(7)).toBeGreaterThan(hits(6));
      expect(hits(15)).toBeGreaterThan(hits(14));
    }
  });
  it('most styles use more than one instrument at once, and the bass is always its own instrument', () => {
    let multi = 0;
    for (const style of Object.keys(STYLES)) {
      const band = tune(style).band;
      if (band) { expect(band.bass).toBe('bass'); if (new Set(Object.values(band)).size >= 2) multi++; }
    }
    expect(multi).toBeGreaterThan(25);
  });
  it('the style band sounds different from one instrument for everything', () => {
    const score = tune('jazz');
    const band = renderMusic(score, { preset: 'band', seconds: 8 });
    const keys = renderMusic(score, { preset: 'keys', seconds: 8 });
    let diff = 0;
    for (let i = 0; i < band.length; i++) diff += Math.abs(band[i] - keys[i]);
    expect(diff / band.length).toBeGreaterThan(100);
  });
});
