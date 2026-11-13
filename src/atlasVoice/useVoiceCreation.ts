import { useState } from 'react';
import { Alert, NativeModules } from 'react-native';
import { useAtlasVoiceStore } from './store';
import { loadVoiceForSpeech, restoreSavedVoice, selectVoice } from './neural';
import { useVoiceProfiles } from './profiles';
import { analyzeCloneReference, useCloneReferences, type VoiceReference } from './cloneStore';
import { voiceReferenceName } from './cloneRouting';
import { previewProfile } from './VoiceProfilesCard';
import { stop as stopSpeech } from './tts';

/** What a speed result means for a hands-free call, in plain words. `rtf` is seconds of work per second of speech. */
export function callVerdict(rtf: number): string {
  if (rtf < 0.8) return 'Fast enough for phone calls.';
  if (rtf < 1.1) return 'Borderline for phone calls: expect short pauses. Try a lower step setting.';
  return 'Too slow for phone calls on this phone. Use a natural voice for calls and keep this one for reading aloud.';
}

interface Inputs { model: string; reference: VoiceReference | undefined; name: string; rate: number; onError: (e: unknown) => void }

/** Trying a cloned voice, saving it under a name, and measuring how fast it speaks. */
export function useVoiceCreation({ model, reference, name, rate, onError }: Inputs) {
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
      previewProfile({ name: voiceName, voiceId: model, sid: 0, rate, referenceId: reference.id }));
  };

  const save = (ref: VoiceReference) => {
    const { profiles, addProfile, renameProfile, setRate } = useVoiceProfiles.getState();
    // Pressing Create again for the same sample renames its voice instead of adding a copy.
    const existing = profiles.find((p) => p.referenceId === ref.id);
    if (existing) { renameProfile(existing.id, voiceName); setRate(existing.id, rate); }
    else addProfile({ name: voiceName, voiceId: model, sid: 0, rate, referenceId: ref.id });
  };

  const finish = (ref: VoiceReference) => {
    save(ref);
    useCloneReferences.getState().rename(ref.id, voiceName);
    Alert.alert('Voice created', `${voiceName} is ready. Give it to an agent in Agents, then Edit, or use it for everything now.`, [
      { text: 'Not now' },
      { text: 'Use it everywhere', onPress: () => { selectVoice(model, 0, ref.id).catch(onError); } },
    ]);
  };

  /** Creates the voice, first warning if the sample is too noisy, quiet or clipped to clone well. A check that cannot run does not block. */
  const create = async (): Promise<boolean> => {
    if (!reference) return false;
    const quality = await analyzeCloneReference(reference.id).catch(() => null);
    if (quality?.rating === 'needs-recording') {
      Alert.alert('This sample may sound poor', `${quality.advice.slice(0, 2).join(' ') || 'It is noisy, quiet or clipped.'} A new recording usually clones much better.`, [
        { text: 'Record again', style: 'cancel' },
        { text: 'Create anyway', onPress: () => finish(reference) },
      ]);
      return false;
    }
    finish(reference);
    return true;
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
