/**
 * Cloned voices across two paired phones: both phones' voice lists are kept, and the sample audio goes
 * across once, checked, and never over a sample the other phone already has. Fakes only the voice engine
 * (device boundary): each "phone" is a map of sample files.
 */
import { NativeModules, Platform } from 'react-native';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function engine(files: Map<string, string>) {
  return {
    listVoiceReferences: jest.fn(async () => [...files.keys()]),
    readVoiceReference: jest.fn(async (id: string) => files.get(id)),
    writeVoiceReference: jest.fn(async (id: string, data: string) => {
      if (files.has(id)) return false;
      files.set(id, data);
      return true;
    }),
  };
}

const { combine, syncedStoreKeys } = require('../../../src/services/nearbySync/stores');
const { sendMissingVoiceRefs, receiveVoiceRef, voiceRefsOnPhone } = require('../../../src/services/nearbySync/voiceReferences');

const profile = (id: string, name: string, referenceId: string) => ({ id, name, voiceId: 'pocket', sid: 0, rate: 1, referenceId, createdAt: '2026-11-12' });
const store = (key: string, field: string, items: unknown[]) => JSON.stringify({ state: { [field]: items }, version: 0 });

it('keeps the voices made on each phone, in both the voice list and the sample list', () => {
  expect(syncedStoreKeys()).toEqual(expect.arrayContaining(['atlas-voice-profiles', 'atlas-voice-reference-metadata-v1']));
  const mine = store('atlas-voice-profiles', 'profiles', [profile('p1', 'Mom', A)]);
  const theirs = store('atlas-voice-profiles', 'profiles', [profile('p2', 'Dad', B)]);
  const merged = JSON.parse(combine('atlas-voice-profiles', { local: mine, remote: theirs }));
  expect(merged.state.profiles.map((p: { name: string }) => p.name).sort()).toEqual(['Dad', 'Mom']);
  const refs = JSON.parse(combine('atlas-voice-reference-metadata-v1', {
    local: store('r', 'references', [{ id: A, name: 'Mom', seconds: 12, createdAt: 'x' }]),
    remote: store('r', 'references', [{ id: B, name: 'Dad', seconds: 9, createdAt: 'y' }]),
  }));
  expect(refs.state.references.map((r: { id: string }) => r.id).sort()).toEqual([A, B]);
});

it('sends the other phone only the voice samples it lacks, and it keeps them', async () => {
  Platform.OS = 'android';
  const phone1 = new Map([[A, Buffer.from('mom sample').toString('base64')], [B, Buffer.from('dad sample').toString('base64')]]);
  const phone2 = new Map([[B, Buffer.from('dad sample').toString('base64')]]);
  const sent: Array<{ id: string }> = [];

  (NativeModules as any).AtlasTts = engine(phone1);
  const theirs = [...phone2.keys()];
  expect(await voiceRefsOnPhone()).toEqual([A, B]);
  const chunks: any[] = [];
  expect(await sendMissingVoiceRefs(theirs, async (c: any) => { chunks.push(c); sent.push(c); })).toBe(1);
  expect(sent.map((c) => c.id)).toEqual([A]);

  (NativeModules as any).AtlasTts = engine(phone2);
  expect(await receiveVoiceRef(chunks[0])).toBe(true);
  expect(phone2.get(A)).toBe(phone1.get(A));
  // A second delivery never overwrites what the phone has.
  expect(await receiveVoiceRef(chunks[0])).toBe(false);
});

it('refuses a damaged or tampered sample', async () => {
  Platform.OS = 'android';
  (NativeModules as any).AtlasTts = engine(new Map());
  const chunk = { kind: 'voiceref', id: A, data: Buffer.from('abc').toString('base64'), checksum: 'a'.repeat(64) };
  await expect(receiveVoiceRef(chunk)).rejects.toThrow(/checksum/i);
  await expect(receiveVoiceRef({ ...chunk, id: '../../etc/passwd' })).rejects.toThrow(/Damaged/);
});
