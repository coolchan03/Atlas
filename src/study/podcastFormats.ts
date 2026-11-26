/**
 * Podcast formats as data. A format says who speaks, how the episode is shaped, and how each part is written. The episode
 * writer (engine.ts) reads it and fills the shape from the sources and the chosen length, so adding a format is a new entry
 * here and nothing else. Facts always come from the sources; a format only changes the voice and the shape.
 */

export type PodcastStyle = 'casual' | 'deep' | 'debate' | 'interview' | 'beginner' | 'news' | 'lecture' | 'entertaining' | 'story';

export interface PodcastFormat {
  id: PodcastStyle;
  label: string;
  /** One line shown under the picker. */
  blurb: string;
  /** The style sentence given to the planner and the writer. */
  style: string;
  /** Set when the format only works with this many speakers (a lecture is one teacher). Unset = the person chooses. */
  hosts?: 1 | 2 | 3;
  /** Fewest speakers the format makes sense with (a debate needs two sides). With one installed voice the two are told apart by pitch. */
  minHosts?: 2;
  /** Guidance for the planner on how the parts add up to this kind of episode. Empty = the plain plan. */
  plan: string;
  /** Guidance for the writer of each part. Empty = the plain writing prompt. */
  write: string;
}

export const PODCAST_FORMATS: Record<PodcastStyle, PodcastFormat> = {
  casual: {
    id: 'casual', label: 'Two friends', blurb: 'Relaxed chat. One knows more, the other asks the "wait, why?" questions.',
    minHosts: 2,
    style: 'friendly and relaxed, like two friends chatting',
    plan: '',
    write: 'Keep it a real conversation: short turns, one host reacts or asks a follow-up before the other explains, and they may drift to a related thought and come back.',
  },
  lecture: {
    id: 'lecture', label: 'Lecture', blurb: 'One teacher. A clear structure with examples and a recap after each idea.',
    style: 'a lecture: one teacher explaining clearly, in order, to students who want to learn it properly',
    hosts: 1,
    plan: 'Shape it as a lecture. The first part opens with a hook and a roadmap of what will be taught. Every middle part teaches exactly ONE idea, builds on the one before, and uses a concrete example from the sources. The last part summarizes and says what to remember. A short episode teaches fewer ideas; a long one teaches more. It never pads.',
    write: 'One teacher speaks (A), in complete explanatory sentences, never asking a co-host anything. State the idea, explain it, give the example, then end the part with a one-sentence recap. Use signposts such as "first", "next" and "so far".',
  },
  entertaining: {
    id: 'entertaining', label: 'Entertaining', blurb: 'Jokes, analogies and banter. Every fact still comes from your sources.',
    minHosts: 2,
    style: 'entertaining and playful: banter, vivid analogies and light jokes, while every fact stays accurate',
    plan: 'Make each part have its own surprising angle on the material. If the sources allow, include one part that sorts myth from fact and one where the hosts quiz each other. The final part lands a memorable takeaway.',
    write: 'Be funny without being wrong: use analogies, playful teasing between the hosts and one running joke across the episode. Jokes never state new facts. Every real claim must come from the sources.',
  },
  deep: {
    id: 'deep', label: 'Deep dive', blurb: 'Careful and detailed, connecting ideas.',
    style: 'a deep dive: careful, detailed, connecting ideas',
    plan: '', write: '',
  },
  debate: {
    id: 'debate', label: 'Debate', blurb: 'The hosts take different sides and weigh the evidence.',
    minHosts: 2,
    style: 'a friendly debate: the hosts take different sides and weigh the evidence',
    plan: 'Shape it as a debate: opening positions, then rounds where each side answers the other\'s strongest point, then a closing where each says what the evidence supports.',
    write: 'The hosts disagree politely and answer each other\'s last point directly. Each side may only argue from the sources. Do not let them simply agree.',
  },
  interview: {
    id: 'interview', label: 'Interview', blurb: 'An interviewer questions an expert guest.',
    minHosts: 2,
    style: 'an interview: A is the interviewer, B is the expert guest',
    plan: '', write: '',
  },
  story: {
    id: 'story', label: 'Story', blurb: 'One narrator tells the topic as a story with a beginning, middle and end.',
    style: 'a story told by one narrator, with a beginning, a turning point and an ending',
    hosts: 1,
    plan: 'Shape it as a story: the first part sets the scene and the question, the middle parts build toward a turning point, and the last part resolves it and says what it means. Only use events and facts from the sources.',
    write: 'One narrator (A) tells it in the present or past tense with vivid, plain detail, and never invents a character, date or place that the sources do not give.',
  },
  beginner: {
    id: 'beginner', label: 'For beginners', blurb: 'Simple words, everyday examples, no jargon.',
    style: 'for complete beginners: simple words, everyday examples, no jargon',
    plan: '', write: '',
  },
  news: {
    id: 'news', label: 'News show', blurb: 'Story by story, each explained simply.',
    style: 'a friendly daily news show: story by story, each explained simply, upbeat but accurate',
    plan: '', write: '',
  },
};

/** Formats offered when making an episode, in the order shown. (The news show is made by the daily briefing, not picked.) */
export const PICKER_STYLES: PodcastStyle[] = ['casual', 'lecture', 'entertaining', 'deep', 'debate', 'interview', 'story', 'beginner'];

/** The format for a style, falling back to the plain one so an old saved style still works. */
export const formatOf = (style: PodcastStyle | undefined): PodcastFormat => PODCAST_FORMATS[style ?? 'casual'] ?? PODCAST_FORMATS.casual;

// ---------------------------------------------------------------- length

/** Shortest and longest episode a person can ask for. */
export const MIN_PODCAST_MINUTES = 2;
export const MAX_PODCAST_MINUTES = 90;
/** Quick picks shown beside the free length control. */
export const PODCAST_MINUTE_PRESETS = [3, 5, 10, 15, 20, 30, 45, 60];

/** Each written part is about 1.5 minutes of speech. */
const MINUTES_PER_PART = 1.5;
/** Normal speaking speed. */
const WORDS_PER_MINUTE = 155;

/** Number of written parts for an episode length. */
export const podcastParts = (minutes: number): number => Math.max(1, Math.min(MAX_PODCAST_MINUTES / MINUTES_PER_PART, Math.round(minutes / MINUTES_PER_PART)));

/** A length put inside the allowed range (a typed 0, 500 or "abc" cannot reach the writer). */
export const clampMinutes = (minutes: number): number => {
  const m = Math.round(Number(minutes));
  return Number.isFinite(m) ? Math.max(MIN_PODCAST_MINUTES, Math.min(MAX_PODCAST_MINUTES, m)) : 5;
};

export interface LengthPlan { minutes: number; parts: number; words: number; /** Rough time to write it, in minutes. */ writeMinutes: number }

/**
 * What a chosen length means: parts, spoken words and a rough time to write it. `tokensPerSecond` is the loaded model's
 * measured speed when known; without it a typical phone speed is assumed.
 */
export function lengthPlan(minutes: number, tokensPerSecond?: number): LengthPlan {
  const m = clampMinutes(minutes);
  const parts = podcastParts(m);
  const words = Math.round(m * WORDS_PER_MINUTE);
  const tps = tokensPerSecond && tokensPerSecond > 0 ? tokensPerSecond : 8;
  // About 1.4 tokens a word, plus a few seconds of reading the sources for each part.
  const seconds = (words * 1.4) / tps + parts * 6;
  return { minutes: m, parts, words, writeMinutes: Math.max(1, Math.round(seconds / 60)) };
}

/** The most speakers a format allows when the person asked for `wanted` (a format may fix the number). */
export const hostsFor = (style: PodcastStyle | undefined, wanted: 1 | 2 | 3 | undefined): 1 | 2 | 3 => {
  const f = formatOf(style);
  return f.hosts ?? Math.max(f.minHosts ?? 1, wanted ?? 2) as 1 | 2 | 3;
};
