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
