/** Pure policies for original instrumental music playing beneath speech. */
export const MIN_MUSIC_VOLUME = 0;
export const MAX_MUSIC_VOLUME = 1;
export const SPEECH_DUCK_FACTOR = 0.2;
export const CROSSFADE_SECONDS = 0.7;
export function clampMusicVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(MIN_MUSIC_VOLUME, Math.min(MAX_MUSIC_VOLUME, volume)) : 0.45;
}
export function effectiveMusicGain(volume: number, speechActive: boolean): number {
  return clampMusicVolume(volume) * (speechActive ? SPEECH_DUCK_FACTOR : 1);
}
export function playbackOffset(secondsElapsed: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(secondsElapsed)) return 0;
  return Math.max(0, secondsElapsed % duration);
}
