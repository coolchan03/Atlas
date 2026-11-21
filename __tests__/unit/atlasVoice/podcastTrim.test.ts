/** A rendered briefing line has the silence at its ends trimmed once, and a problem while trimming never loses the line. */
import { wavBytes, toBase64 } from '../../../src/atlasVoice/jingles';
import { fromBase64, readPcm16 } from '../../../src/atlasVoice/wavTrim';

const RATE = 22050;
const mockFiles = new Map<string, string>(); // path -> base64
let mockFailRead = false;
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  exists: jest.fn(async (p: string) => mockFiles.has(p)),
  mkdir: jest.fn(async () => undefined),
  readDir: jest.fn(async () => []),
  unlink: jest.fn(async (p: string) => { mockFiles.delete(p); }),
  writeFile: jest.fn(async (p: string, data: string) => { mockFiles.set(p, data); }),
  readFile: jest.fn(async (p: string) => { if (mockFailRead) throw new Error('cannot read'); const d = mockFiles.get(p); if (d === undefined) throw new Error('missing'); return d; }),
  moveFile: jest.fn(async (from: string, to: string) => { mockFiles.set(to, mockFiles.get(from) as string); mockFiles.delete(from); }),
  copyFile: jest.fn(async (from: string, to: string) => { mockFiles.set(to, mockFiles.get(from) as string); }),
}));
jest.mock('../../../src/atlasVoice/neural', () => ({
  ...jest.requireActual('../../../src/atlasVoice/neural'),
  withVoice: jest.fn(async (_choice: unknown, job: () => Promise<unknown>) => job()),
  restoreSavedVoice: jest.fn(async () => undefined),
}));

import { NativeModules, Platform } from 'react-native';

function spoken(lead: number, speech: number, tail: number): string {
  const s = new Int16Array(Math.round((lead + speech + tail) * RATE));
  for (let i = 0; i < speech * RATE; i++) s[Math.round(lead * RATE) + i] = Math.round(Math.sin((2 * Math.PI * 200 * i) / RATE) * 10000);
  return toBase64(wavBytes(s, RATE));
}
const seconds = (b64: string): number => { const b = fromBase64(b64); const p = readPcm16(b)!; return p.dataLength / 2 / p.rate; };

beforeAll(() => {
  Platform.OS = 'android';
  NativeModules.AtlasTts = {
    setRate: jest.fn(async () => true), setPitch: jest.fn(async () => true), setVoice: jest.fn(async () => true),
    synthesizeToFile: jest.fn(async (_t: string, out: string) => { mockFiles.set(out, spoken(0.6, 1.5, 0.7)); return out; }),
    addListener: jest.fn(), removeListeners: jest.fn(),
  };
});
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };

it('stores each rendered line with its long silence trimmed, and leaves no temporary file behind', async () => {
  mockFailRead = false; mockFiles.clear();
  const { preRenderEpisode } = require('../../../src/atlasVoice/podcastAudio');
  preRenderEpisode('trim-ep', [{ text: 'First story.', pitch: 1 }, { text: 'Second story.', pitch: 1 }]);
  await settle();
  const lines = [...mockFiles.keys()].filter((p) => p.endsWith('.wav'));
  expect(lines).toHaveLength(2);
  for (const p of lines) {
    expect(seconds(mockFiles.get(p) as string)).toBeCloseTo(0.12 + 1.5 + 0.08, 1); // from 2.8 s as the voice made it
  }
  expect([...mockFiles.keys()].some((p) => p.endsWith('.trim'))).toBe(false);
});

it('a line that cannot be read for trimming is kept exactly as the voice made it', async () => {
  mockFailRead = true; mockFiles.clear();
  const { preRenderEpisode } = require('../../../src/atlasVoice/podcastAudio');
  preRenderEpisode('trim-ep-2', [{ text: 'Only story.', pitch: 1 }]);
  await settle();
  const lines = [...mockFiles.keys()].filter((p) => p.endsWith('.wav'));
  expect(lines).toHaveLength(1);
  expect(seconds(mockFiles.get(lines[0]) as string)).toBeCloseTo(2.8, 1);
});
