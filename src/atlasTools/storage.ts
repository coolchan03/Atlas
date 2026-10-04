import RNFS from 'react-native-fs';
import { NativeModules } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where big downloads go: the phone, or an SD card. Android gives every app its own folder on
 * the SD card that needs no permission (it is removed if the app is uninstalled).
 */
export interface Volume { path: string; removable: boolean; state: string; free: number; total: number }

interface StoragePrefs { useSd: boolean; sdPath: string; set: (p: Partial<Omit<StoragePrefs, 'set'>>) => void }
export const useStoragePrefs = create<StoragePrefs>()(
  persist((set) => ({ useSd: false, sdPath: '', set: (p) => set(p) }), {
    name: 'atlas-storage-prefs',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ useSd: s.useSd, sdPath: s.sdPath }),
  }),
);

const Device: any = NativeModules.AtlasDevice;
const Tts: any = NativeModules.AtlasTts;

export async function listVolumes(): Promise<Volume[]> {
  try { return (await Device?.storageVolumes?.()) || []; } catch { return []; }
}

/** The SD card (if one is inserted and readable). */
export async function sdCard(): Promise<Volume | undefined> {
  const v = await listVolumes();
  return v.find((x) => x.removable && /mounted/.test(x.state) && !/read_only/.test(x.state));
}

/** Folder for big files (library, maps, voices): the SD card when chosen and present, else the phone. */
export function bigFilesBase(): string {
  const p = useStoragePrefs.getState();
  return p.useSd && p.sdPath ? p.sdPath : RNFS.ExternalDirectoryPath;
}

/** Both places, so files saved earlier on the other one are still found. */
export function allBases(): string[] {
  const p = useStoragePrefs.getState();
  return [...new Set([RNFS.ExternalDirectoryPath, ...(p.sdPath ? [p.sdPath] : [])])];
}

/** Tell the native side (voices) where to save. Called at start-up and when the setting changes. */
export function applyStoragePrefs(): void {
  const p = useStoragePrefs.getState();
  try { Tts?.setVoicesBase?.(p.useSd && p.sdPath ? p.sdPath : '').catch(() => undefined); } catch { /* old build */ }
}

export async function chooseSd(on: boolean): Promise<{ ok: boolean; message?: string }> {
  if (!on) { useStoragePrefs.getState().set({ useSd: false }); applyStoragePrefs(); return { ok: true }; }
  const sd = await sdCard();
  if (!sd) return { ok: false, message: 'No SD card found. Insert one (formatted as portable storage) and try again.' };
  useStoragePrefs.getState().set({ useSd: true, sdPath: sd.path });
  applyStoragePrefs();
  return { ok: true };
}

export const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
