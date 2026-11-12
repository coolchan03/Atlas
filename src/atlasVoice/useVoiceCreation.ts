import { useState } from 'react';
import { Alert, NativeModules } from 'react-native';
import { useAtlasVoiceStore } from './store';
import { loadVoiceForSpeech, restoreSavedVoice, selectVoice } from './neural';
import { useVoiceProfiles } from './profiles';
import { useCloneReferences, type VoiceReference } from './cloneStore';
import { voiceReferenceName } from './cloneRouting';
import { previewProfile } from './VoiceProfilesCard';
import { stop as stopSpeech } from './tts';

/** What a speed result means for a hands-free call, in plain words. `rtf` is seconds of work per second of speech. */
export function callVerdict(rtf: number): string {
  if (rtf < 0.8) return 'Fast enough for phone calls.';
  if (rtf < 1.1) return 'Borderline for phone calls: expect short pauses. Try the Fast quality setting.';
  return 'Too slow for phone calls on this phone. Use a natural voice for calls and keep this one for reading aloud.';
}

interface Inputs { model: string; reference: VoiceReference | undefined; name: string; onError: (e: unknown) => void }

/** Trying a cloned voice, saving it under a name, and measuring how fast it speaks. */
export function useVoiceCreation({ model, reference, name, onError }: Inputs) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [benchmark, setBenchmark] = useState('');
  const steps = useAtlasVoiceStore((s) => s.cloneSteps);
  const setSteps = useAtlasVoiceStore((s) => s.setCloneSteps);
  const voiceName = voiceReferenceName(name);

  /** Runs one slow native step with a message on screen, and always clears it afterwards. */
  const working = async (message: string, job: () => Promise<void>) => {
    setBusy(true); setStatus(message);
    try { await job(); } catch (e) { onError(e); } finally { setBusy(false); setStatus(''); }
  };

  const tryIt = () => {
    if (!reference) return;
    stopSpeech();
    return working('Loading the voice. The first time can take a minute...', () =>
      previewProfile({ name: voiceName, voiceId: model, sid: 0, rate: 1, referenceId: reference.id }));
  };

  const create = () => {
    if (!reference) return;
    const { profiles, addProfile, renameProfile } = useVoiceProfiles.getState();
    // Pressing Create again for the same sample renames its voice instead of adding a copy.
    const existing = profiles.find((p) => p.referenceId === reference.id);
    if (existing) renameProfile(existing.id, voiceName);
    else addProfile({ name: voiceName, voiceId: model, sid: 0, rate: 1, referenceId: reference.id });
    useCloneReferences.getState().rename(reference.id, voiceName);
    Alert.alert('Voice created', `${voiceName} is ready. Give it to an agent in Agents, then Edit, or use it for everything now.`, [
      { text: 'Not now' },
      { text: 'Use it everywhere', onPress: () => { selectVoice(model, 0, reference.id).catch(onError); } },
    ]);
  };

  const changeSteps = async (count: number) => {
    try { await NativeModules.AtlasTts?.setVoiceCloneSteps?.(count); setSteps(count); setBenchmark(''); } catch (e) { onError(e); }
  };

  const speedTest = () => {
    if (!reference) return;
    stopSpeech();
    return working('Measuring generation speed on this phone...', async () => {
      try {
        await loadVoiceForSpeech(model, 0, reference.id);
        const result: { synthesisSeconds: number; audioSeconds: number; realTimeFactor: number } =
          await NativeModules.AtlasTts.benchmarkVoiceClone('Hello. I am testing the generation speed of this voice.');
        setBenchmark(`${result.audioSeconds.toFixed(1)}s of speech made in ${result.synthesisSeconds.toFixed(1)}s (${result.realTimeFactor.toFixed(2)} seconds of work per second of speech). ${callVerdict(result.realTimeFactor)}`);
      } finally { restoreSavedVoice().catch(() => undefined); }
    });
  };

  return { busy, status, benchmark, steps, tryIt, create, changeSteps, speedTest };
}
