/** A score the AI composer writes names its instruments; when real instruments (a SoundFont) are installed each note must be played on the one it named. */
const mockAsked: Array<{ voice: unknown; name: string; role: unknown }> = [];
jest.mock('../../../src/music/sampled', () => ({
  ...jest.requireActual('../../../src/music/sampled'),
  sampledNote: (note: any, name: string) => { mockAsked.push({ voice: note.voice, name, role: note.role }); return null; }, // null: the built-in synth plays instead
}));

import { composeMusic } from '../../../src/music/composerAgent';
import { renderMusic } from '../../../src/music/composition';

// Eight bars of a simple tune: a bass and a pad on each chord, a melody on flute, answered by a sax and sparkled by vibes, and a beat.
const bars = Array.from({ length: 8 }, (_, bar) => [
  `NOTE C3 ${bar * 4} 4 0.45 upright`, `NOTE C4 ${bar * 4} 4 0.25 warmpad`,
  `NOTE E5 ${bar * 4} 1.5 0.55 flute`, `NOTE D5 ${bar * 4 + 1.5} 0.5 0.5 flute`, `NOTE C5 ${bar * 4 + 2} 1 0.5 sax`, `NOTE G5 ${bar * 4 + 3} 1 0.3 vibes`,
  `DRUM kick ${bar * 4} 0.6`, `DRUM hat ${bar * 4 + 0.5} 0.3`,
]).flat();
const SCORE = ['TITLE: Window Rain', 'BPM: 84', ...bars].join('\n');

it('plays each note of the AI composer\'s score on the instrument it named, through the SoundFont renderer', async () => {
  const composed = await composeMusic('rainy jazz cafe', { ask: async () => SCORE, style: 'jazz', seconds: 20 });
  expect(composed.via).toBe('composer');
  mockAsked.length = 0;
  renderMusic(composed.score, { preset: 'band', seconds: 12 });
  const pitched = mockAsked.filter((a) => a.role !== 'perc');
  expect(new Set(pitched.map((a) => a.name))).toEqual(new Set(['upright', 'warmpad', 'flute', 'sax', 'vibes']));
  // The drums are asked for by kind, so the kit's own kick and hat sound.
  expect(new Set(mockAsked.filter((a) => a.role === 'perc').map((a) => a.voice))).toEqual(new Set(['kick', 'hat']));
});
