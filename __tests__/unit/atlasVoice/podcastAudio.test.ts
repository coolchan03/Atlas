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
  readDir: jest.fn(async () => []),
  unlink: jest.fn(async () => undefined),
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


it('plays a newly selected episode ahead of an older pre-render backlog', async () => {
  const { playLine, preRenderEpisode } = require('../../../src/atlasVoice/podcastAudio');
  const module = NativeModules.AtlasTts as any;
  const previous = module.synthesizeToFile.getMockImplementation();
  let releaseFirst!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const order: string[] = [];
  module.synthesizeToFile.mockImplementation(async (text: string, path: string) => {
    order.push(text);
    if (text === 'old-0') { started(); await held; }
    mockFiles.add(path);
    return path;
  });
  try {
    const old = Array.from({ length: 9 }, (_, i) => ({ text: `old-${i}`, pitch: 1, voice: 'sid:0' }));
    preRenderEpisode('old-episode-priority', old);
    await entered;
    const selected = [{ text: 'selected-now', pitch: 1, voice: 'sid:0' }];
    const playback = playLine('new-episode-priority', selected, 0);
    releaseFirst();
    expect(await playback).toBe(true);
    expect(order.slice(0, 2)).toEqual(['old-0', 'selected-now']);
  } finally { releaseFirst(); module.synthesizeToFile.mockImplementation(previous); }
});


it('does not replay a different neural engine from an old cache filename', async () => {
  const { playLine } = require('../../../src/atlasVoice/podcastAudio');
  const { useAtlasVoiceStore } = require('../../../src/atlasVoice/store');
  const previous = useAtlasVoiceStore.getState();
  const items = [{ text: 'Voice fingerprint regression line', pitch: 1, voice: 'sid:0' }];
  try {
    useAtlasVoiceStore.getState().setNeural('kokoro-en', 0);
    expect(await playLine('voice-change-test', items, 0)).toBe(true);
    const first = mockPlayed[mockPlayed.length - 1];
    useAtlasVoiceStore.getState().setNeural('kitten-nano-en', 0);
    expect(await playLine('voice-change-test', items, 0)).toBe(true);
    const second = mockPlayed[mockPlayed.length - 1];
    expect(first).not.toBe(second);
  } finally {
    useAtlasVoiceStore.getState().setNeural(previous.neuralVoice, previous.neuralSid);
  }
});


it('bounds disposable WAV cache without deleting new or unrelated files', async () => {
  const RNFS = require('react-native-fs');
  const { prunePodcastCache } = require('../../../src/atlasVoice/podcastAudio');
  const now = Date.UTC(2026, 9, 22);
  const root = '/cache/podcast-audio';
  const day = 24 * 60 * 60 * 1000;
  const directories = [
    { name: 'stale', mtime: new Date(now - 30 * day), size: 180 * 1024 * 1024 },
    { name: 'recent', mtime: new Date(now - day), size: 140 * 1024 * 1024 },
    { name: 'unrelated', mtime: new Date(now - 30 * day), size: 40 * 1024 * 1024 },
  ];
  RNFS.readDir.mockImplementation(async (path: string) => {
    if (path === root) return directories.map(d => ({ ...d, isDirectory: () => true }));
    const folder = directories.find(d => path === `${root}/${d.name}`);
    if (!folder) return [];
    return [{ name: folder.name === 'unrelated' ? 'keep.txt' : '0-0123456789ab.wav',
      mtime: folder.mtime, size: folder.size, isFile: () => true }];
  });
  RNFS.unlink.mockClear();
  try {
    expect(await prunePodcastCache(now)).toBe(1);
    expect(RNFS.unlink).toHaveBeenCalledWith(`${root}/stale`);
    expect(RNFS.unlink).not.toHaveBeenCalledWith(`${root}/recent`);
    expect(RNFS.unlink).not.toHaveBeenCalledWith(`${root}/unrelated`);
  } finally { RNFS.readDir.mockReset().mockResolvedValue([]); }
});
