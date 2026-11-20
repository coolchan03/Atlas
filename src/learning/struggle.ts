/**
 * What the learner does when it keeps failing its own practice questions. Testing the same thing again every few hours only records
 * the same failure, so after a few misses a question is taken out of the tests for a while and studied again instead, with more of the
 * stored notes in front of it. A whole batch that mostly fails also widens the notes for the next batch. Pure.
 */
import type { DueConcept, Outcome } from './masteryStore';

/** A question missed this many times, with no recall since, stops being tested and is studied again. */
export const GIVE_UP_AFTER = 3;
/** Days it rests from the tests after that, before it is tried once more. */
export const REST_DAYS = 3;

export const isStruggling = (c: Pick<DueConcept, 'attempts' | 'streak' | 'strength'>): boolean => c.attempts >= GIVE_UP_AFTER && c.streak === 0 && c.strength < 0.25;

/** True when most of a batch of practice answers (at least three) were wrong: the notes the learner is given are not enough. */
export const batchStruggled = (outcomes: Outcome[]): boolean => outcomes.length >= 3 && outcomes.filter((o) => o === 'wrong').length / outcomes.length >= 2 / 3;

/** How many times wider the notes are made for the next practice: up to double after bad batches, back to normal after a good one. */
export function nextNotesBoost(current: number, outcomes: Outcome[]): number {
  if (batchStruggled(outcomes)) return Math.min(2, current + 0.5);
  return outcomes.length && outcomes.filter((o) => o === 'wrong').length === 0 ? 1 : current;
}

/** The study question that replaces the test: the same thing asked for in simple terms, from the sources. */
export const restudyQuestion = (question: string): string => `In simple terms, what are the key facts needed to answer this: ${question}`;
