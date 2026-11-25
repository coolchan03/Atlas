import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { seedApp } from '../../harness/monkeySeed';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
let mockParams: Record<string, unknown> = {};
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); } }));

/** A short speech-like WAV (24 kHz, 16-bit mono, half a second of tone) as base64: what the voice engine would leave in a file. */
const lineWav = (rate: number): string => {
  const frames = rate / 2;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + frames * 2, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) bytes.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), 44 + i * 2);
  return bytes.toString('base64');
};

it('the briefing can be saved as one audio file, then shared', async () => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const { NativeModules, Platform } = require('react-native');
  Platform.OS = 'android';
  const shared: unknown[] = [];
  NativeModules.AtlasDevice = { shareFile: jest.fn(async (file: string) => { shared.push(file); return true; }) };
  NativeModules.AtlasTts = {
    stop: jest.fn(async () => true), cancelSynthesis: jest.fn(async () => true), setVoice: jest.fn(async () => true), setPitch: jest.fn(async () => true), setRate: jest.fn(async () => true),
    synthesizeToFile: jest.fn(async (_text: string, out: string) => { await require('react-native-fs').writeFile(out, lineWav(24000), 'base64'); return out; }),
    addListener: jest.fn(), removeListeners: jest.fn(),
  };
  const rtl = requireRTL();
  const React = require('react');
  const ids = seedApp('full');
  const { useStudyStore } = require('../../../src/study/engine');
  const { BRIEF_PROJECT } = require('../../../src/atlasTools/dailyBrief');
  useStudyStore.getState().add(BRIEF_PROJECT, {
    kind: 'podcast', createdAt: 23, topic: 'News', title: 'Briefing', sources: [], hosts: 2, minutes: 1, storyStarts: [1],
    headlines: [{ title: 'Story', source: 'BBC', interest: 'news', url: 'https://example.com/s' }],
    podcast: [{ host: 'A', text: 'Good morning.' }, { host: 'B', text: 'First story.' }, { host: 'A', text: 'Second.' }],
  });
  void ids;
  mockParams = { projectId: BRIEF_PROJECT, openAt: 23 };
  const { StudyScreen } = require('../../../src/screens/StudyScreen');
  const view = rtl.render(React.createElement(StudyScreen));
  rtl.fireEvent.press(await view.findByTestId('export-briefing-audio'));
  await rtl.waitFor(() => expect(view.getByTestId('briefing-audio-ready')).toBeTruthy(), { timeout: 8000 });
  expect(view.queryByTestId('briefing-audio-error')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('share-briefing-audio'));
  await rtl.waitFor(() => expect(shared).toHaveLength(1));
  // One file holding all three lines (1.5 s of speech) plus the tunes: longer than the speech alone, and a real WAV.
  const RNFS = require('react-native-fs');
  const file = String(shared[0]);
  expect(file).toMatch(/briefing-audio\/.*\.wav$/);
  const bytes = Buffer.from(await RNFS.readFile(file, 'base64'), 'base64');
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
  expect(bytes.readUInt32LE(40) / 2 / bytes.readUInt32LE(24)).toBeGreaterThan(1.5);
}, 30000);
