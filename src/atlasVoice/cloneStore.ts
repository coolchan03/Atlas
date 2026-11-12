import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { voiceReferenceName } from './cloneRouting';
import { useAtlasVoiceStore } from './store';
import { selectVoice } from './neural';

/** Metadata only. Reference WAV samples remain private in the app's Android files directory. */
export interface VoiceReference {
  id: string;
  name: string;
  seconds: number;
  createdAt: string;
}
interface CloneStore {
  references: VoiceReference[];
  add: (reference: VoiceReference) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
}
export const useCloneReferences = create<CloneStore>()(persist((set) => ({
  references: [],
  add: (ref) => set((s) => ({ references: [ref, ...s.references.filter((r) => r.id !== ref.id)] })),
  remove: (id) => set((s) => ({ references: s.references.filter((r) => r.id !== id) })),
  rename: (id, name) => set((s) => ({ references: s.references.map((r) => r.id === id ? { ...r, name: voiceReferenceName(name) } : r) })),
}), {
  name: 'atlas-voice-reference-metadata-v1',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ references: s.references }),
}));

/** The user must explicitly import/record a sample; no web upload or telemetry. */
export async function importCloneReference(uri: string, name: string): Promise<VoiceReference> {
  if (Platform.OS !== 'android' || !NativeModules.AtlasTts?.importVoiceReference) {
    throw new Error('On-device Pocket TTS cloning is currently available on Android only.');
  }
  const result: { id: string; seconds: number } = await NativeModules.AtlasTts.importVoiceReference(uri, name);
  if (!result?.id || !Number.isFinite(result.seconds)) throw new Error('The audio sample could not be imported.');
  const reference: VoiceReference = { id: result.id, seconds: result.seconds, name: voiceReferenceName(name), createdAt: new Date().toISOString() };
  useCloneReferences.getState().add(reference);
  return reference;
}

export async function deleteCloneReference(id: string): Promise<void> {
  if (!NativeModules.AtlasTts?.deleteVoiceReference) throw new Error('Voice reference storage unavailable.');
  // Stop using the active recording before deleting it; no hidden fallback to stale audio.
  if (useAtlasVoiceStore.getState().neuralReferenceId === id) await selectVoice('');
  // Do not erase metadata unless the native file was deleted successfully.
  await NativeModules.AtlasTts.deleteVoiceReference(id);
  useCloneReferences.getState().remove(id);
}

/** Recording-quality feedback is diagnostic, not a claim that the audio is clean or authorized. */
export interface VoiceReferenceQuality {
  rating: 'good' | 'fair' | 'needs-recording';
  seconds: number; peak: number; rmsDb: number; noiseFloorDb: number;
  signalNoiseDb: number; clippedPercent: number; quietPercent: number;
  trimStartSeconds: number; trimEndSeconds: number; advice: string[];
}
export async function analyzeCloneReference(id: string): Promise<VoiceReferenceQuality> {
  if (!useCloneReferences.getState().references.some((r) => r.id === id)) throw new Error('Choose a saved voice reference first');
  if (!NativeModules.AtlasTts?.analyzeVoiceReference) throw new Error('Audio quality wizard requires the updated Android build');
  return NativeModules.AtlasTts.analyzeVoiceReference(id);
}
/** Creates a new reference; original and all current agent profiles remain unchanged. */
export async function improveCloneReference(id: string): Promise<VoiceReference> {
  const original = useCloneReferences.getState().references.find((r) => r.id === id);
  if (!original) throw new Error('Original reference was removed');
  if (!NativeModules.AtlasTts?.improveVoiceReference) throw new Error('Audio improvement requires the updated Android build');
  const result: { id: string; seconds: number } = await NativeModules.AtlasTts.improveVoiceReference(id);
  if (!result?.id || !Number.isFinite(result.seconds)) throw new Error('Audio improvement could not be saved');
  const reference: VoiceReference = { id: result.id, name: voiceReferenceName(`${original.name} (improved)`),
    seconds: result.seconds, createdAt: new Date().toISOString() };
  useCloneReferences.getState().add(reference);
  return reference;
}
