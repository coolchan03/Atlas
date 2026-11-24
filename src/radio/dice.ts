/**
 * The radio's dice. A show is rolled from the tables: genre, topic, subject, tone, poem shape, liveliness, how long the song plays,
 * an instrument to feature, and whether there is a poem at all. A station theme the person typed makes matching entries likelier (it never
 * removes the rest), and what was played lately is passed over, so a long listen does not repeat. The random source is passed in, so a
 * test (or a replay with the same seed) gets the same shows.
 */
import type { Energy } from '../music/styles';
import { styleFromText } from '../music/simple';
import { CALM_TONES, ENERGIES, FORMS, GENRES, MAX_SONG_SECONDS, SONG_SECONDS, SPOTLIGHTS, SUBJECTS, TONES, TOPICS, type Entry, type Form, type Genre, type Tone } from './tables';

export interface RadioSettings {
  /** What the station is about, in the person's own words ("a haunted lighthouse's late-night station"). Empty means anything. */
  theme: string;
  stationName: string;
  /** 0 to 1: how often a song has a poem read over it. */
  poemChance: number;
  /** Songs only: no poems at all. */
  musicOnly: boolean;
  /** The longest a song plays before the next one, 60 to 300. */
  maxSongSeconds: number;
  /** The host says what is coming over the start of each song. */
  host: boolean;
  /** Soft songs only: calm genres, calm tones, no lively tunes (for sleep or reading). */
  calmOnly: boolean;
}
export const DEFAULT_RADIO: RadioSettings = { theme: '', stationName: 'Atlas Radio', poemChance: 0.4, musicOnly: false, maxSongSeconds: 180, host: true, calmOnly: false };

export interface Show {
  genre: Genre; topic: Entry; subject: Entry; tone: Tone; form: Form; energy: Energy;
  /** How long the tune plays (it loops until this time is up). */
  seconds: number;
  spotlight: string | null;
  withPoem: boolean;
  /** Seconds into the song before the poem starts. */
  poemDelay: number;
  /** Seeds the tune, so the same show makes the same music. */
  seed: number;
}

export type Random = () => number;
/** A small seeded random source (mulberry32). */
/* eslint-disable no-bitwise -- the generator is bit arithmetic */
export function seeded(seed: number): Random {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* eslint-enable no-bitwise */

const pick = <T>(list: readonly T[], rng: Random): T => list[Math.floor(rng() * list.length) % list.length];

/** How much more likely an entry is for this theme: 1 for no match, 6 when a tag or word of the entry appears in the theme. */
function themeBoost(theme: string, tags: string[], text = ''): number {
  const t = theme.toLowerCase();
  if (!t.trim()) return 1;
  const words = text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  return tags.some((tag) => t.includes(tag)) || words.some((w) => t.includes(w)) ? 6 : 1;
}

function weighted<T>(list: readonly T[], weight: (item: T) => number, rng: Random): T {
  const weights = list.map(weight);
  let at = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i += 1) { at -= weights[i]; if (at < 0) return list[i]; }
  return list[list.length - 1];
}

/** `recent` holds the ids played lately (newest last); they are passed over unless nothing else is left. */
function pickFresh<T extends { id: string }>(list: readonly T[], recent: string[], weigh: (list: readonly T[]) => T): T {
  const fresh = list.filter((x) => !recent.includes(x.id));
  return weigh(fresh.length ? fresh : list);
}

export interface History { genres: string[]; topics: string[]; subjects: string[] }
export const EMPTY_HISTORY: History = { genres: [], topics: [], subjects: [] };

/** Rolls the next show. */
export function rollShow(settings: RadioSettings, rng: Random, history: History = EMPTY_HISTORY): Show {
  const themed = styleFromText(settings.theme);
  const pickBy = <T,>(weight: (item: T) => number) => (list: readonly T[]): T => weighted(list, weight, rng);
  const genres = settings.calmOnly ? GENRES.filter((g) => g.calm) : GENRES;
  const genre = pickFresh(genres, history.genres.slice(-3), pickBy((g) => themeBoost(settings.theme, g.tags, g.label) * (themed && g.style === themed ? 4 : 1)));
  const topic = pickFresh(TOPICS, history.topics.slice(-12), pickBy((t) => themeBoost(settings.theme, t.tags, t.text)));
  const subject = pickFresh(SUBJECTS, history.subjects.slice(-12), pickBy((s) => themeBoost(settings.theme, s.tags, s.text)));
  const poemDelay = 8 + Math.floor(rng() * 13);
  const cap = Math.min(MAX_SONG_SECONDS, Math.max(60, Math.round(settings.maxSongSeconds)));
  const lengths = SONG_SECONDS.filter((s) => s <= cap && s >= poemDelay + 45);
  const seconds = pick(lengths.length ? lengths : [60], rng);
  const spotlight = rng() < 0.5 ? pick(genre.lean ? [...genre.lean] : SPOTLIGHTS, rng) : null;
  return {
    genre, topic, subject, tone: pick(settings.calmOnly ? CALM_TONES : TONES, rng), form: pick(FORMS, rng), energy: settings.calmOnly ? 'calm' : genre.energy ?? pick(ENERGIES, rng),
    seconds, spotlight, withPoem: !settings.musicOnly && rng() < settings.poemChance, poemDelay, seed: Math.floor(rng() * 1e9),
  };
}

/** The sentence that describes a show to the models and to the listener: "a silly punk poem about revenge, about my ex-husband". */
export function describeShow(show: Show): string {
  return `${show.tone} ${show.genre.label} song about ${show.topic.text}, about ${show.subject.text}`;
}
