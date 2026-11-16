import { buildVoiceChoices, profileIdFor } from '../../../src/atlasVoice/voiceChoices';

const voices: any[] = [{ id: 'kokoro-v1-en', name: 'Kokoro', speakers: [{ sid: 0, name: 'Default' }, { sid: 12, name: 'Echo' }] }, { id: 'sherpa-onnx-pocket-tts-int8', name: 'Pocket TTS' }];
const installed = { 'kokoro-v1-en': 1, 'sherpa-onnx-pocket-tts-int8': 1 };

it('lists saved voices, unsaved cloned voices, the phone voice and installed speakers, without repeats', () => {
  const profile: any = { id: 'p1', name: 'Echo', voiceId: 'kokoro-v1-en', sid: 12, rate: 1, createdAt: '' };
  const choices = buildVoiceChoices({ profiles: [profile], references: [{ id: 'r1', name: 'Dad', seconds: 10, createdAt: '' }], voices, installed });
  const keys = choices.map((c) => c.key);
  expect(keys).toContain('p1');
  expect(keys).toContain('clone:r1');
  expect(keys).toContain('engine::0');
  expect(keys).toContain('engine:kokoro-v1-en:0');
  expect(keys).not.toContain('engine:kokoro-v1-en:12'); // already saved as a profile
  expect(keys.some((k) => k.includes('pocket'))).toBe(false); // a cloning engine needs a reference, so it is not a voice by itself
});

it('saves a voice that was never saved when it is picked, and reuses a saved one', () => {
  const choices = buildVoiceChoices({ profiles: [], references: [], voices, installed });
  const added: any[] = [];
  const add = (p: any) => { const full = { ...p, id: `new${added.length}`, createdAt: '' }; added.push(full); return full;};
  expect(profileIdFor(choices.find((c) => c.key === 'engine:kokoro-v1-en:12')!, add)).toBe('new0');
  expect(added[0]).toMatchObject({ name: 'Kokoro Echo', voiceId: 'kokoro-v1-en', sid: 12 });
  expect(profileIdFor({ key: 'p', label: 'x', group: 'saved', profile: { id: 'p9' } as any }, add)).toBe('p9');
});

import { repairProfiles } from '../../../src/atlasVoice/profiles';

describe('choosing a voice highlights only that voice', () => {
  const profile = (id: any, name: string): any => ({ id, name, voiceId: 'v', sid: 0, rate: 1, createdAt: '' });

  it('gives a saved voice with no id, or a repeated id, its own id', () => {
    const fixed = repairProfiles([profile('a', 'One'), profile(undefined, 'Two'), profile('a', 'Three'), profile('', 'Four')]);
    expect(fixed.map((p) => p.name)).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(new Set(fixed.map((p) => p.id)).size).toBe(4);
    expect(fixed[0].id).toBe('a');
  });

  it('leaves healthy profiles exactly as they are', () => {
    const ok = [profile('a', 'One'), profile('b', 'Two')];
    expect(repairProfiles(ok)).toEqual(ok);
  });
});

describe('voices added in one go each get their own id', () => {
  it('ready-made voices added together never share an id, so choosing one highlights only that one', () => {
    const { useVoiceProfiles } = require('../../../src/atlasVoice/profiles');
    const original = (global as any).crypto;
    (global as any).crypto = undefined; // Hermes on Android has no Web Crypto: the old fallback made the same id inside one millisecond
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      useVoiceProfiles.setState({ profiles: [] });
      const added = useVoiceProfiles.getState().addPresets(Array.from({ length: 12 }, (_, i) => ({ name: `Voice ${i}`, voiceId: 'kokoro', sid: i, rate: 1 })));
      expect(added).toBe(12);
      const ids = useVoiceProfiles.getState().profiles.map((p: any) => p.id);
      expect(new Set(ids).size).toBe(12);
    } finally { now.mockRestore(); (global as any).crypto = original; }
  });
});
