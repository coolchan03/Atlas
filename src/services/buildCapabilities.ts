/**
 * What this build of Atlas can do. The APK carries only the native libraries made for its CPU type (arm64-v8a, armeabi-v7a, x86_64 or x86), and
 * several features exist only as native code: the on-device AI engine, the NPU and GPU engines, image generation, the LiteRT engine, the voices.
 * Instead of assuming from the CPU type, the Android app lists the libraries it actually contains (DeviceMemoryModule constants, same contract on iOS) and
 * each feature below says which library it needs, so a feature that is not in this build is shown as missing, with the reason, wherever it is offered.
 * The rules are pure (tested); `buildCapabilities()` reads the app once.
 */
import { NativeModules, Platform } from 'react-native';

export type BuildFeatureId =
  | 'localAi' | 'npu' | 'openclText' | 'vulkanText' | 'imageGeneration' | 'liteRt' | 'neuralVoices' | 'whisper';

export interface BuildInfo { abi: string; nativeLibs: string[] }
export interface BuildFeature { id: BuildFeatureId; label: string; available: boolean; /** Why it is missing, and what to do (empty when available). */ missing: string }
export interface BuildCapabilities { abi: string; abiName: string; /** True when the library list could not be read: nothing is marked missing, as before. */ unknown: boolean; features: BuildFeature[] }

const ABI_NAMES: Record<string, string> = { 'arm64-v8a': '64-bit ARM', 'armeabi-v7a': '32-bit ARM', x86_64: '64-bit x86 (emulators)', x86: '32-bit x86 (emulators)', arm64: '64-bit ARM' };
const abiName = (abi: string): string => ABI_NAMES[abi] ?? abi;

interface Rule { id: BuildFeatureId; label: string; needs: (libs: string[]) => boolean; why: string }
const has = (libs: string[], re: RegExp): boolean => libs.some((l) => re.test(l));

const RULES: Rule[] = [
  { id: 'localAi', label: 'On-device AI models', needs: (l) => has(l, /^librnllama/), why: 'The on-device AI engine is not built into this version, so models cannot run on this phone. Connect a remote server, or install the 64-bit ARM version of Atlas.' },
  { id: 'npu', label: 'NPU acceleration (Snapdragon)', needs: (l) => has(l, /^librnllama.*hexagon/), why: 'NPU acceleration is only built into the 64-bit ARM version of Atlas.' },
  { id: 'openclText', label: 'OpenCL GPU acceleration', needs: (l) => has(l, /^librnllama.*opencl/), why: 'OpenCL GPU acceleration is only built into the 64-bit ARM version of Atlas.' },
  { id: 'vulkanText', label: 'Vulkan GPU text engine', needs: (l) => l.includes('libllamakt.so'), why: 'The Vulkan text engine is only built into the 64-bit ARM version of Atlas.' },
  { id: 'imageGeneration', label: 'Image generation', needs: (l) => l.includes('libatlas_sdcli.so') || l.includes('libatlas_sdcli_opencl.so') || l.includes('libstable_diffusion_core.so'), why: 'Image generation is only built into the 64-bit ARM version of Atlas.' },
  { id: 'liteRt', label: 'LiteRT models', needs: (l) => has(l, /^liblitertlm/), why: 'The LiteRT engine is not built into this version of Atlas.' },
  { id: 'neuralVoices', label: 'Natural voices', needs: (l) => has(l, /^libsherpa-onnx|^libonnxruntime/), why: 'The natural-voice engine is not built into this version of Atlas. The phone\'s own voice is used instead.' },
  { id: 'whisper', label: 'Offline transcription (Whisper)', needs: (l) => has(l, /^librnwhisper/), why: 'Offline transcription is not built into this version of Atlas. The phone\'s own speech recognizer is used where it has one.' },
];

/** The features of a build, from its CPU type and the native libraries it contains. An unreadable list marks nothing missing. */
export function capabilitiesFor(info: BuildInfo | null): BuildCapabilities {
  if (!info || !Array.isArray(info.nativeLibs) || info.nativeLibs.length === 0) {
    return { abi: info?.abi ?? 'unknown', abiName: abiName(info?.abi ?? 'unknown'), unknown: true, features: RULES.map((r) => ({ id: r.id, label: r.label, available: true, missing: '' })) };
  }
  return {
    abi: info.abi, abiName: abiName(info.abi), unknown: false,
    features: RULES.map((r) => { const available = r.needs(info.nativeLibs); return { id: r.id, label: r.label, available, missing: available ? '' : r.why }; }),
  };
}

let cached: BuildCapabilities | null = null;

/** This build's capabilities (read once). iOS builds, and an Android build that cannot list its libraries, mark nothing missing. */
export function buildCapabilities(): BuildCapabilities {
  if (cached) return cached;
  let info: BuildInfo | null = null;
  try { if (Platform.OS === 'android') info = (NativeModules.DeviceMemoryModule?.buildInfo as BuildInfo | undefined) ?? null; } catch { info = null; }
  cached = capabilitiesFor(info);
  return cached;
}

/** One feature of this build. */
export function buildFeature(id: BuildFeatureId): BuildFeature {
  return buildCapabilities().features.find((f) => f.id === id) as BuildFeature;
}

/** For tests: forget what was read. */
export function resetBuildCapabilities(): void { cached = null; }
