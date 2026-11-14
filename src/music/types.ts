/** `perc` (a kick or a noise tick) is made by the built-in composer only; a model's score cannot ask for it. */
export type MusicRole = 'melody' | 'pad' | 'bass' | 'perc';
export interface MusicNote { pitch: number; beat: number; length: number; gain: number; role?: MusicRole; /** The instrument this note is played on. A pitched instrument for most notes, or a drum for a `perc` note. When absent the tune's band decides. */ voice?: Voice | DrumKind }
export interface MusicScore { title: string; bpm: number; notes: MusicNote[]; /** The band the tune was written for; used when the instrument choice is "Style band". */ band?: Partial<Record<'melody' | 'pad' | 'bass', Voice>> }

/** The instrument the whole tune is played on. */
export type SoundPreset = 'keys' | 'bell' | 'synth' | 'ambient' | 'epiano' | 'guitar' | 'overdrive' | 'organ' | 'band';

/** The instruments the composer can play, by name. */
export type Voice = 'piano' | 'epiano' | 'pluck' | 'driven' | 'organ' | 'bell' | 'saw' | 'pad' | 'bass' | 'sine'
  | 'flute' | 'clarinet' | 'oboe' | 'violin' | 'cello' | 'trumpet' | 'horn' | 'sax' | 'harp' | 'marimba' | 'vibes' | 'glock' | 'kalimba' | 'musicbox'
  | 'accordion' | 'harmonica' | 'banjo' | 'steeldrum' | 'choir' | 'harpsichord' | 'upright' | 'squarelead' | 'synthpluck' | 'warmpad' | 'glasspad';
/** The percussion a `perc` note can ask for by name. */
export type DrumKind = 'kick' | 'snare' | 'hat' | 'openhat' | 'clap' | 'tom' | 'rim' | 'cowbell' | 'shaker' | 'crash';
/** Which instrument plays each part of a tune. */
export type Band = Record<'melody' | 'pad' | 'bass', Voice>;
