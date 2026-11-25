export default {
  start: async () => { throw new Error('stub'); }, stop: async () => undefined, cancel: async () => undefined, destroy: async () => undefined,
  isAvailable: async () => false, removeAllListeners: () => undefined,
};
export type SpeechResultsEvent = { value?: string[] };
export type SpeechErrorEvent = { error?: { code?: string; message?: string } };
export type SpeechStartEvent = object;
export type SpeechEndEvent = object;
export type SpeechVolumeChangeEvent = { value?: number };
