import { composeStyled, specFor } from '../../../src/music/styles';
import { instrumentsOf, styleFromText, POPULAR } from '../../../src/music/simple';

it('jazz is a piano, bass and swing drums, with a saxophone, vibraphone and trumpet joining in', () => {
  const band = specFor('jazz').band!;
  expect(band.melody).toBe('piano');
  expect(band.pad).toBe('piano');
  expect(band.bass).toBe('bass');
  expect(specFor('jazz').perc).toBe('swing');
  expect(instrumentsOf('jazz')).toBe('piano, bass, saxophone, vibraphone, muted trumpet, swing drums');
  // The extra players really write notes, each on its own instrument.
  const voices = new Set(composeStyled('x', 'jazz').notes.map((n) => n.voice).filter(Boolean));
  expect([...voices].sort()).toEqual(['sax', 'trumpet', 'vibes']);
});

it('every popular style names the instruments it plays', () => {
  for (const id of POPULAR) expect(instrumentsOf(id).length).toBeGreaterThan(3);
});

it('picks a style from the words used', () => {
  expect(styleFromText('a rainy day jazz cafe')).toBe('jazz');
  expect(styleFromText('quiet music for reading')).toBe('focus');
  expect(styleFromText('pirate sea shanty')).toBe('shanty');
  expect(styleFromText('xyzzy')).toBeNull();
});

it('energy changes the tempo, and another variant is another tune in the same style', () => {
  const calm = composeStyled('x', 'jazz', { energy: 'calm' });
  const lively = composeStyled('x', 'jazz', { energy: 'lively' });
  expect(calm.bpm).toBeLessThan(lively.bpm);
  const a = composeStyled('x', 'jazz');
  const b = composeStyled('x', 'jazz', { variant: 1 });
  expect(JSON.stringify(a.notes)).not.toBe(JSON.stringify(b.notes));
  expect(composeStyled('x', 'jazz').notes).toEqual(a.notes); // same words, same tune
  expect(Math.max(...a.notes.map((n) => n.beat + n.length)) * 60 / a.bpm).toBeLessThan(120);
});

it('gives a tune a made-up title for its style when no words were given, and the person\'s own words when they were', () => {
  const { randomTitle, seededRandom } = require('../../../src/music/titles');
  const titles = new Set(Array.from({ length: 40 }, (_, i) => randomTitle('jazz', 'Moods and genres', seededRandom(i))));
  expect(titles.size).toBeGreaterThan(25);
  expect(randomTitle('jazz', 'Moods and genres', seededRandom(3))).toBe(randomTitle('jazz', 'Moods and genres', seededRandom(3)));
  expect(composeStyled('', 'jazz', { random: seededRandom(5) }).title).toMatch(/\(Jazz\)$/);
  expect(composeStyled('rainy cafe', 'jazz').title).toBe('rainy cafe (Jazz)');
});

it('every style, including every extra player, makes notes the renderer can play', () => {
  const { STYLES } = require('../../../src/music/styles');
  for (const mood of Object.keys(STYLES)) {
    const tune = composeStyled('t', mood as any);
    expect(tune.notes.length).toBeGreaterThan(20);
    expect(tune.notes.every((n: any) => Number.isFinite(n.pitch) && n.pitch > 0 && n.length > 0 && n.gain > 0)).toBe(true);
  }
});
