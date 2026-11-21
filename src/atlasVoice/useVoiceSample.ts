import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { audioRecorderService } from '../services/audioRecorderService';
import {
  analyzeCloneReference, improveCloneReference, importCloneReference, useCloneReferences, type VoiceReference, type VoiceReferenceQuality,
} from './cloneStore';

/** Recordings made in the app may run up to three minutes; the clearest 12 seconds are kept. */
const MAX_RECORDING_SECONDS = 180;
const MIN_SECONDS = 3;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Tells the person when a long recording was cut down to its clearest part. */
function reportTrim(reference: VoiceReference & { sourceSeconds: number }): void {
  if (reference.sourceSeconds > reference.seconds + 1) {
    Alert.alert('Sample ready', `Atlas used the clearest ${Math.round(reference.seconds)} seconds of your ${clock(reference.sourceSeconds)} recording.`);
  }
}

/** Getting a voice sample into Atlas: record one, choose an audio file, check its quality, improve it. */
export function useVoiceSample(name: string, onError: (e: unknown) => void) {
  const references = useCloneReferences((s) => s.references);
  const [chosenId, setChosenId] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [quality, setQuality] = useState<VoiceReferenceQuality | null>(null);
  const started = useRef(0);
  const own = useRef(false);
  // The newest sample is used until the person taps another one.
  const selected = references.find((r) => r.id === chosenId) ?? references[0];

  useEffect(() => () => { if (own.current && audioRecorderService.isCurrentlyRecording()) audioRecorderService.cancelRecording(); }, []);
  useEffect(() => {
    if (!recording) return;
    setRecordSeconds(0);
    const timer = setInterval(() => setRecordSeconds(Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [recording]);

  const choose = (id: string) => { setChosenId(id); setQuality(null); };
  const added = (reference: VoiceReference & { sourceSeconds: number }) => { setChosenId(reference.id); setQuality(null); reportTrim(reference); };

  const startRecording = async () => {
    if (audioRecorderService.isCurrentlyRecording()) { Alert.alert('Recorder busy', 'Finish the current voice note or call first.'); return; }
    try {
      await audioRecorderService.startRecording();
      own.current = true;
      started.current = Date.now();
      setRecording(true);
    } catch (e) { onError(e); }
  };
  const stopRecording = async () => {
    own.current = false;
    setRecording(false);
    setBusy(true);
    let path = '';
    try {
      const result = await audioRecorderService.stopRecording();
      path = result.path.replace(/^file:\/\//, '');
      const seconds = result.durationSeconds || (Date.now() - started.current) / 1000;
      if (seconds < MIN_SECONDS || seconds > MAX_RECORDING_SECONDS) throw new Error('Record between 3 seconds and 3 minutes. About 10 seconds of clear speech is best.');
      added(await importCloneReference(result.path.startsWith('file:') ? result.path : `file://${result.path}`, name));
    } catch (e) { onError(e); }
    finally {
      // The temporary recording is always erased; only the private imported copy stays.
      if (path) await require('@dr.pogodin/react-native-fs').unlink(path).catch(() => undefined);
      setBusy(false);
    }
  };
  const chooseFile = async () => {
    setBusy(true);
    try {
      const [file] = await pick({ mode: 'open', allowMultiSelection: false, type: ['audio/*'] });
      if (file) added(await importCloneReference(file.uri, name));
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) onError(e);
    } finally { setBusy(false); }
  };
  const check = async () => {
    if (!selected) return;
    setBusy(true); setQuality(null);
    try { setQuality(await analyzeCloneReference(selected.id)); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const improve = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const copy = await improveCloneReference(selected.id);
      setChosenId(copy.id);
      setQuality(await analyzeCloneReference(copy.id));
      Alert.alert('Improved copy saved', 'A trimmed, evened-out copy was saved next to your original. Try both before choosing.');
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return { references, selected, quality, recording, recordSeconds, busy, choose, startRecording, stopRecording, chooseFile, check, improve };
}
