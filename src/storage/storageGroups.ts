/**
 * One list of everything Atlas keeps on the phone, for the Storage screen. Each kind of thing (models, voices,
 * voice samples, maps, recordings) answers for itself through the service that owns it, so the screen never knows
 * where any of it lives. Adding a new kind of stored thing means adding one entry here.
 */
export interface StorageItem {
  id: string;
  name: string;
  bytes: number;
  detail?: string;
  /** What stops working if this is deleted, shown before the person confirms. */
  warning?: string;
  remove: () => Promise<void>;
}
export interface StorageGroup { id: string; title: string; items: StorageItem[] }

type Provider = () => Promise<StorageGroup>;

const textModels: Provider = async () => {
  const { useAppStore } = require('../stores/appStore');
  const { modelManager } = require('../services');
  const models: Array<{ id: string; name: string; fileSize?: number; mmProjFileSize?: number; quantization?: string }> = useAppStore.getState().downloadedModels;
  return { id: 'models', title: 'Language models', items: models.map((m) => ({
    id: m.id, name: m.name, bytes: (m.fileSize ?? 0) + (m.mmProjFileSize ?? 0), detail: m.quantization,
    warning: 'It has to be downloaded again to use it.', remove: () => modelManager.deleteModel(m.id),
  })) };
};

const imageModels: Provider = async () => {
  const { useAppStore } = require('../stores/appStore');
  const { modelManager } = require('../services');
  const models: Array<{ id: string; name: string; size?: number; style?: string }> = useAppStore.getState().downloadedImageModels;
  return { id: 'image-models', title: 'Image models', items: models.map((m) => ({
    id: m.id, name: m.name, bytes: m.size ?? 0, detail: m.style, warning: 'It has to be downloaded again to use it.',
    remove: () => modelManager.deleteImageModel(m.id),
  })) };
};

const voices: Provider = async () => {
  const { useNeuralVoices, deleteVoice, voiceCatalog } = require('../atlasVoice/neural');
  const installed: Record<string, number> = useNeuralVoices.getState().installed;
  const names = new Map<string, string>((voiceCatalog(installed) as Array<{ id: string; name: string }>).map((v) => [v.id, v.name]));
  return { id: 'voices', title: 'Natural voices', items: Object.entries(installed).map(([id, bytes]) => ({
    id, name: names.get(id) ?? id, bytes: Number(bytes) || 0,
    warning: 'Anything that speaks with this voice goes back to the phone voice.', remove: () => deleteVoice(id),
  })) };
};

const voiceSamples: Provider = async () => {
  const { useCloneReferences, deleteCloneReference } = require('../atlasVoice/cloneStore');
  const refs: Array<{ id: string; name: string; seconds: number }> = useCloneReferences.getState().references;
  // A sample is a small file (16 kHz, 16-bit, mono), so its size follows from its length.
  return { id: 'voice-samples', title: 'Cloned voice samples', items: refs.map((r) => ({
    id: r.id, name: r.name, bytes: Math.round(r.seconds * 16000 * 2), detail: `${r.seconds.toFixed(1)} s`,
    warning: 'That cloned voice stops working. Your other cloned voices are not affected.', remove: () => deleteCloneReference(r.id),
  })) };
};

const maps: Provider = async () => {
  const { installedMaps, deleteMap } = require('../atlasMaps/maps');
  const list: Array<{ path: string; name: string; size: number }> = await installedMaps();
  return { id: 'maps', title: 'Offline maps', items: list.map((m) => ({
    id: m.path, name: m.name, bytes: m.size, warning: 'That area has no map until it is downloaded again.', remove: () => deleteMap(m.path),
  })) };
};

const recordings: Provider = async () => {
  const RNFS = require('react-native-fs').default ?? require('react-native-fs');
  const { useRecordings } = require('../atlasRecorder/store');
  const { recorderService } = require('../atlasRecorder/recorderService');
  const recs: Array<{ id: string; title: string; audioPath: string; durationSec: number }> = useRecordings.getState().recordings;
  const items: StorageItem[] = [];
  for (const r of recs) {
    const bytes = await RNFS.stat(r.audioPath).then((s: { size: number | string }) => Number(s.size)).catch(() => 0);
    items.push({ id: r.id, name: r.title, bytes, detail: `${Math.round(r.durationSec)} s`,
      warning: 'The audio and its transcript are deleted.', remove: () => recorderService.remove(r.id) });
  }
  return { id: 'recordings', title: 'Recordings', items };
};

const PROVIDERS: Provider[] = [textModels, imageModels, voices, voiceSamples, maps, recordings];

/** Every group that has something in it, biggest group first. A kind that cannot be read is left out, not fatal. */
export async function loadStorageGroups(): Promise<StorageGroup[]> {
  const groups: StorageGroup[] = [];
  for (const provider of PROVIDERS) {
    try { groups.push(await provider()); } catch { /* this kind of storage is not in this build */ }
  }
  const total = (g: StorageGroup) => g.items.reduce((sum, i) => sum + i.bytes, 0);
  return groups.filter((g) => g.items.length > 0).sort((a, b) => total(b) - total(a));
}
