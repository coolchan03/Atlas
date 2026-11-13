/** `perc` (a kick or a noise tick) is made by the built-in composer only; a model's score cannot ask for it. */
export type MusicRole = 'melody' | 'pad' | 'bass' | 'perc';
export interface MusicNote { pitch: number; beat: number; length: number; gain: number; role?: MusicRole }
export interface MusicScore { title: string; bpm: number; notes: MusicNote[] }

/** The instrument the whole tune is played on. */
export type SoundPreset = 'keys' | 'bell' | 'synth' | 'ambient' | 'epiano' | 'guitar' | 'overdrive' | 'organ';
