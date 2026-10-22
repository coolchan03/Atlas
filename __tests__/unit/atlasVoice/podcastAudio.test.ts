/**
 * Podcast and briefing lines play from audio saved ahead of time, in each host's voice,
 * rendered a few lines ahead of what is playing, so there is no wait before a line. Fakes
 * only the device boundary: the voice engine, files and the audio output.
 */
const mockFiles = new Set<string>();
const mockRendered: string[] = [];
const mockPlayed: string[] = [];
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  exists: jest.fn(async (p: string) => mockFiles.has(p)),
  mkdir: jest.fn(async () => undefined),
}));
jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn().mockImplementation(() => ({
    destination: {},
    decodeAudioData: jest.fn(async (path: string) => ({ path })),
    createBufferSource: jest.fn(() => {
      const node: any = { connect: jest.fn(), stop: jest.fn(), onEnded: null, buffer: null };
      node.start = jest.fn(() => { mockPlayed.push(node.buffer.path); setTimeout(() => node.onEnded?.(), 0); });
      return node;
    }),
  })),
}));

import { NativeModules, Platform } from 'react-native';

beforeAll(() => {
  Platform.OS = 'android';
  NativeModules.AtlasTts = {
    setRate: jest.fn(async () => true),
    setVoice: jest.fn(async (v: string) => { (NativeModules.AtlasTts as any).voice = v; return true; }),
    synthesizeToFile: jest.fn(async (text: string, out: string) => {
      mockRendered.push(`${(NativeModules.AtlasTts as any).voice}:${text}`);
      mockFiles.add(out);
      return out;
    }),
    addListener: jest.fn(), removeListeners: jest.fn(),
  };
});

it('plays each line from a file rendered ahead in its host voice, without rendering it twice', async () => {
  const { playLine } = require('../../../src/atlasVoice/podcastAudio');
  const items = [
    { text: 'Welcome to the news.', pitch: 1, voice: 'sid:0' },
    { text: 'Thanks, here is the first story.', pitch: 1, voice: 'sid:9' },
    { text: 'And the second one.', pitch: 1, voice: 'sid:0' },
    { text: 'Goodbye.', pitch: 1, voice: 'sid:9' },
    { text: 'Extra line.', pitch: 1, voice: 'sid:0' },
  ];
  expect(await playLine('daily-brief-1', items, 0)).toBe(true);
  // Line 0 plus the next three, in order, each in its own voice.
  await new Promise((r) => setTimeout(r, 10));
  expect(mockRendered).toEqual([
    'sid:0:Welcome to the news.', 'sid:9:Thanks, here is the first story.', 'sid:0:And the second one.', 'sid:9:Goodbye.',
  ]);
  expect(mockPlayed[0]).toMatch(/^\/cache\/podcast-audio\/daily-brief-1\/0-/);
  expect(await playLine('daily-brief-1', items, 1)).toBe(true);
  await new Promise((r) => setTimeout(r, 10));
  expect(mockRendered).toHaveLength(5); // only the new line ahead (4) was rendered
  expect(mockPlayed[1]).toMatch(/\/1-/);
});
