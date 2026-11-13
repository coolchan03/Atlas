import { composeStyled, specFor } from '../../../src/music/styles';
import { instrumentsOf, styleFromText, POPULAR } from '../../../src/music/simple';

it('jazz is a piano, upright bass and swing drums', () => {
  const band = specFor('jazz').band!;
  expect(band.melody).toBe('piano');
  expect(band.pad).toBe('piano');
  expect(band.bass).toBe('bass');
  expect(specFor('jazz').perc).toBe('swing');
  expect(instrumentsOf('jazz')).toBe('piano, bass, swing drums');
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
