/**
 * What the learner does when it keeps failing its own practice questions. Testing the same thing again every few hours only records
 * the same failure, so after a few misses a question is taken out of the tests for a while and studied again instead, with more of the
 * stored notes in front of it. A whole batch that mostly fails also widens the notes for the next batch. Pure.
 */
import type { DueConcept, Outcome } from './masteryStore';
import { numbersIn, opposes, similarity, unitConflict } from './claimText';

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

/** What kind of mistake an answer made, found by comparing it with the stored claims (no model). */
export type MissKind = 'no-answer' | 'wrong-sign' | 'wrong-number' | 'wrong-unit' | 'opposite' | 'missing-fact';
export interface Diagnosis { kind: MissKind; /** The stored claim the answer got wrong, shortened. */ claim?: string; /** What was different, in plain words. */ detail: string }

const sentencesOf = (text: string): string[] => text.match(/[^.!?\n]+[.!?]*/g) ?? [text];
const clip = (t: string): string => t.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);

/**
 * Why an answer was missed, one finding per kind of mistake, the most specific first: a wrong sign, a wrong figure, the right figure in
 * the wrong unit, the opposite of the claim, or simply a missing fact. An answer that says nothing is its own kind. Pure and deterministic.
 */
export function diagnoseMiss(answer: string, claims: string[]): Diagnosis[] {
  if (!answer.trim() || /\b(?:do not|don't|does not|doesn't) (?:answer|say|know|cover)|cannot answer|no information\b/i.test(answer)) {
    return [{ kind: 'no-answer', detail: 'the answer said nothing about it' }];
  }
  const have = new Set(numbersIn(answer));
  const found = new Map<MissKind, Diagnosis>();
  const add = (d: Diagnosis) => { if (!found.has(d.kind)) found.set(d.kind, d); };
  for (const claim of claims) {
    const text = clip(claim);
    const wanted = numbersIn(claim.replace(/\[\d+\]/g, ''));
    const missing = wanted.filter((n) => !have.has(n));
    const closest = sentencesOf(answer).reduce((top, s) => (similarity(claim, s) > similarity(claim, top) ? s : top), sentencesOf(answer)[0]);
    const flipped = missing.filter((n) => have.has(n.startsWith('-') ? n.slice(1) : `-${n}`));
    // The unit is checked whatever the figures did: the right number in the wrong unit has no missing figure at all.
    if (unitConflict(claim, closest)) add({ kind: 'wrong-unit', claim: text, detail: wanted[0] ? `the figure ${wanted[0]} was given in a different unit` : 'a quantity was given in a different unit' });
    if (flipped.length) add({ kind: 'wrong-sign', claim: text, detail: `the figure ${flipped[0]} was given with the opposite sign` });
    else if (missing.length) add({ kind: 'wrong-number', claim: text, detail: `the figure ${missing[0]} is missing or different` });
    else if (opposes(claim, closest) && similarity(claim, closest) >= 0.4) add({ kind: 'opposite', claim: text, detail: 'the answer says the opposite of what the source says' });
    else if (similarity(claim, answer) < 0.4) add({ kind: 'missing-fact', claim: text, detail: 'the answer leaves out what the source says' });
  }
  const order: MissKind[] = ['wrong-sign', 'wrong-number', 'wrong-unit', 'opposite', 'missing-fact'];
  const out = order.map((k) => found.get(k)).filter((d): d is Diagnosis => !!d);
  return out.length ? out : [{ kind: 'missing-fact', detail: 'the answer does not say what the source says' }];
}

/** How the same thing is explained the 1st, 2nd and 3rd time it is missed: a different way each time, not the same words again. */
const APPROACHES = ['with one small worked example', 'by contrast with the mistake that was made', 'step by step in plain words, one idea at a time'];

/**
 * The study question that replaces a generic "key facts" one after a miss: it says what to look at (from the diagnosis) and explains it a
 * different way each time the question is missed. Never the same wording twice for the same question.
 */
export function restudyQuestionFor(question: string, diagnosis: Diagnosis[], misses: number): string {
  const first = diagnosis[0];
  const focus = first.kind === 'no-answer' ? 'what the sources say about it, since the last answer said nothing'
    : first.kind === 'missing-fact' ? 'the fact that was left out'
    : `the exact figures and signs (${first.detail})`;
  return `${restudyQuestion(question)} Look closely at ${focus}, and explain it ${APPROACHES[Math.max(0, misses - 1) % APPROACHES.length]}.`;
}
