/** What the player does for an episode: the tunes (briefing only) and what happens around each line. */
export interface EpisodePlan {
  count: number;
  from: number;
  /** Tunes before, between stories and after the show. Left out for anything that is not a briefing. */
  tunes?: { storyStarts: number[]; /** play the opening tune even when starting part-way (resuming); left out, only a start from line 0 has it */ intro?: boolean; /** quiet gap after the chime before each story, in seconds */ pauseSeconds?: number };
}

export interface EpisodeHooks {
  /** True once playback was stopped or a newer play took over. */
  stopped: () => boolean;
  /** Plays a tune; false means playback was stopped while it played. */
  jingle: (kind: 'intro' | 'chime' | 'outro') => Promise<boolean>;
  /** Waits (quietly) this many seconds; false means playback was stopped meanwhile. */
  pause?: (seconds: number) => Promise<boolean>;
  /** The line about to play (to show it and remember the place). */
  onLine: (i: number) => void;
  /** Plays a line; false means playback was stopped or the line could not be played. */
  line: (i: number) => Promise<boolean>;
}

/** Plays the lines of an episode in order. Resolves true when the last line finished. */
export async function playEpisode(plan: EpisodePlan, hooks: EpisodeHooks): Promise<boolean> {
  const first = Math.max(0, plan.from);
  if (plan.tunes && (plan.tunes.intro ?? first === 0) && !(await hooks.jingle('intro'))) return false;
  let finished = false;
  for (let i = first; i < plan.count; i++) {
    if (hooks.stopped()) break;
    // A soft chime, then a quiet beat, when the next story begins (not when playback starts or is moved to a line).
    if (plan.tunes && i > first && plan.tunes.storyStarts.includes(i) && !(await storyBreak(plan.tunes, hooks))) break;
    hooks.onLine(i);
    if (!(await hooks.line(i)) || hooks.stopped()) break;
    finished = i === plan.count - 1;
  }
  if (finished && plan.tunes && !hooks.stopped()) await hooks.jingle('outro');
  return finished;
}

/** The chime and the quiet beat between two stories. False when playback was stopped during either. */
async function storyBreak(tunes: NonNullable<EpisodePlan['tunes']>, hooks: EpisodeHooks): Promise<boolean> {
  if (!(await hooks.jingle('chime'))) return false;
  return !tunes.pauseSeconds || !hooks.pause || (await hooks.pause(tunes.pauseSeconds));
}
