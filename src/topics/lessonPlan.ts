/**
 * Whether a lesson is written in one call or in pieces, and how many sections go in each piece, chosen from the speeds measured for the
 * model in use instead of one fixed rule. Every call has to READ its instructions and passages before it writes a word (on a slow phone that
 * is half a minute or more), so more pieces means more reading; but a call that runs too long fails or runs on. The plan estimates both costs
 * and takes the faster way that keeps every call a safe length. Pure: numbers in, a plan out.
 */
export interface LessonSpeeds { /** writing, tokens a second */ decode?: number; /** reading, tokens a second */ prefill?: number }
export interface LessonPlan {
  mode: 'whole' | 'pieces';
  /** Sections per call when written in pieces (see sectionsPerCall for the real number once the outline is known). */
  perCall: number;
  wholeSeconds: number;
  piecesSeconds: number;
  why: string;
}

/** What the model reads and writes, in tokens. A piece reads less than the whole lesson (fewer passages, a shorter instruction). */
const T = { wholePrompt: 3500, outlinePrompt: 1500, piecePrompt: 1800, finishPrompt: 700, section: 320, outlineOut: 200, finishOut: 280 };
/** A single call longer than this is not trusted to finish (or not to run on): the lesson is split. */
const SAFE_WHOLE_SECONDS = 8 * 60;
/** Each piece of a split lesson should finish well inside this. */
const SAFE_PIECE_SECONDS = 5 * 60;
const TYPICAL_SECTIONS = 6;

const seconds = (readTokens: number, writeTokens: number, s: Required<LessonSpeeds>): number => readTokens / s.prefill + writeTokens / s.decode;
const complete = (s: LessonSpeeds): Required<LessonSpeeds> | null => (s.decode && s.decode > 0 ? { decode: s.decode, prefill: s.prefill && s.prefill > 0 ? s.prefill : 60 } : null);

/** Estimated seconds to write a lesson of `sections` in one call. */
export const wholeSeconds = (sections: number, s: Required<LessonSpeeds>): number => seconds(T.wholePrompt, sections * T.section + T.finishOut, s);

/** Estimated seconds to write it in pieces of `perCall` sections: the outline, each piece, and the key points, each reading before it writes. */
export function piecesSeconds(sections: number, perCall: number, s: Required<LessonSpeeds>): number {
  const calls = Math.ceil(sections / Math.max(1, perCall));
  return seconds(T.outlinePrompt, T.outlineOut, s) + calls * seconds(T.piecePrompt, perCall * T.section, s) + seconds(T.finishPrompt, T.finishOut, s);
}

/** The seconds one piece of `perCall` sections takes. */
const pieceSeconds = (perCall: number, s: Required<LessonSpeeds>): number => seconds(T.piecePrompt, perCall * T.section, s);

/** How many sections per call, for a lesson whose outline has `sections`: the fastest split in which every piece stays a safe length (one at a time when even that is long). */
export function sectionsPerCall(sections: number, speeds: LessonSpeeds): number {
  const s = complete(speeds);
  if (!s || sections <= 1) return Math.max(1, sections);
  let best = 1;
  let bestTotal = Infinity;
  for (let k = 1; k <= sections; k++) {
    if (k > 1 && pieceSeconds(k, s) > SAFE_PIECE_SECONDS) break; // longer pieces only get longer
    const total = piecesSeconds(sections, k, s);
    if (total < bestTotal) { best = k; bestTotal = total; }
  }
  return best;
}

/**
 * One call for a model that writes a whole lesson in a safe time (the fewest reads, so the fastest); pieces for one that cannot. With no
 * measured speed the plan is one call, as before: nothing is split on a guess.
 */
export function planLesson(speeds: LessonSpeeds, sections = TYPICAL_SECTIONS): LessonPlan {
  const s = complete(speeds);
  if (!s) return { mode: 'whole', perCall: sections, wholeSeconds: 0, piecesSeconds: 0, why: 'No speed has been measured for this model, so the lesson is written in one call.' };
  const perCall = sectionsPerCall(sections, speeds);
  const whole = wholeSeconds(sections, s);
  const pieces = piecesSeconds(sections, perCall, s);
  if (whole <= SAFE_WHOLE_SECONDS) {
    return { mode: 'whole', perCall, wholeSeconds: whole, piecesSeconds: pieces, why: `One call is expected to take about ${Math.round(whole / 60)} min, inside the safe limit, and is ${whole <= pieces ? 'also faster' : 'the safer choice'} than splitting (${Math.round(pieces / 60)} min in ${Math.ceil(sections / perCall) + 2} calls).` };
  }
  return { mode: 'pieces', perCall, wholeSeconds: whole, piecesSeconds: pieces, why: `One call would take about ${Math.round(whole / 60)} min, too long to trust to finish, so the lesson is written in ${Math.ceil(sections / perCall) + 2} calls (about ${Math.round(pieces / 60)} min in all).` };
}
