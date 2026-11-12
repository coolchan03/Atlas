/**
 * A briefing host can be a saved or cloned voice. Its lines are rendered with that voice loaded; a line in an ordinary voice
 * never comes from a borrowed engine; the normal voice comes back when rendering is done. Fakes only the voice engine and files.
 */
const mockFiles = new Set<string>();
const mockEvents: string[] = [];
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  exists: jest.fn(async (p: string) => mockFiles.has(p)),
  mkdir: jest.fn(async () => undefined),
  readDir: jest.fn(async () => []),
  unlink: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
}));
jest.mock('../../../src/atlasVoice/neural', () => ({
  ...jest.requireActual('../../../src/atlasVoice/neural'),
  loadVoiceForSpeech: jest.fn(async (id: string, sid: number, ref?: string) => { mockEvents.push(`load ${id}#${sid}#${ref ?? ''}`); }),
  restoreSavedVoice: jest.fn(async () => { mockEvents.push('restore'); }),
}));

import { NativeModules, Platform } from 'react-native';

beforeAll(() => {
  Platform.OS = 'android';
  NativeModules.AtlasTts = {
    setRate: jest.fn(async () => true),
    setPitch: jest.fn(async () => true),
    setVoice: jest.fn(async (v: string) => { (NativeModules.AtlasTts as any).voice = v; return true; }),
    synthesizeToFile: jest.fn(async (text: string, out: string) => { mockEvents.push(`render "${text}" voice="${(NativeModules.AtlasTts as any).voice}"`); mockFiles.add(out); return out; }),
    addListener: jest.fn(), removeListeners: jest.fn(),
  };
});

const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

it('renders a cloned host with its voice loaded, ordinary hosts in the saved voice, and puts the normal voice back at the end', async () => {
  const { preRenderEpisode } = require('../../../src/atlasVoice/podcastAudio');
  const { useVoiceProfiles } = require('../../../src/atlasVoice/profiles');
  const mom = useVoiceProfiles.getState().addProfile({ name: 'Mom', voiceId: 'pocket', sid: 0, rate: 1, referenceId: 'ref-1' });
  const key = `profile:${mom.id}`;
  preRenderEpisode('brief', [
    { text: 'Hello from mom.', pitch: 1, voice: key },
    { text: 'Hello from the anchor.', pitch: 1, voice: 'sid:0' },
    { text: 'Mom again.', pitch: 1, voice: key },
  ]);
  await settle();
  expect(mockEvents).toEqual([
    'load pocket#0#ref-1', 'render "Hello from mom." voice=""',
    'restore', 'render "Hello from the anchor." voice="sid:0"',
    'load pocket#0#ref-1', 'render "Mom again." voice=""',
    'restore',
  ]);
});

it('does not reuse an old file for a profile whose recording changed', async () => {
  mockEvents.length = 0;
  const { preRenderEpisode } = require('../../../src/atlasVoice/podcastAudio');
  const { useVoiceProfiles } = require('../../../src/atlasVoice/profiles');
  const profile = useVoiceProfiles.getState().addProfile({ name: 'Dad', voiceId: 'pocket', sid: 0, rate: 1, referenceId: 'old' });
  const line = [{ text: 'Same words.', pitch: 1, voice: `profile:${profile.id}` }];
  preRenderEpisode('changed', line);
  await settle();
  useVoiceProfiles.getState().removeProfile(profile.id);
  const again = useVoiceProfiles.getState().addProfile({ name: 'Dad', voiceId: 'pocket', sid: 0, rate: 1, referenceId: 'new' });
  mockEvents.length = 0;
  preRenderEpisode('changed', [{ text: 'Same words.', pitch: 1, voice: `profile:${again.id}` }]);
  await settle();
  expect(mockEvents.filter((e) => e.startsWith('render'))).toEqual(['render "Same words." voice=""']);
});
