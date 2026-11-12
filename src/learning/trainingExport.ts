import type { PortableClaim } from './knowledgeInterchange';
import { similarity } from './claimText';

/**
 * A dataset a person can use for supervised fine-tuning or LoRA/QLoRA training elsewhere. Atlas never trains, uploads or
 * replaces a model. Only claims a person verified, with a stored source passage, become examples, so no label is invented.
 * Questions that are on the exam are left out, so a trained model cannot learn the exam.
 */
export interface SftExample {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Where the example came from, so it can be traced and withdrawn. */
  provenance: { claimId: string; reportId: string; sources: string[]; verifiedBy: string };
}
export type Split = 'train' | 'validation' | 'test';
export interface TrainingManifest {
  format: 'atlas-training-jsonl';
  schemaVersion: 1;
  createdAt: string;
  counts: Record<Split, number> & { eligible: number; excludedExamLeak: number; excludedNoPassage: number };
  /** The exact base model, which the person must supply: an adapter only fits the model it was trained on. */
  baseModel: string | null;
  estimatedTokens: number;
  notes: string[];
}
export interface TrainingSet { examples: Record<Split, SftExample[]>; manifest: TrainingManifest }

const SAME_QUESTION = 0.8;

/** A stable 0 to 9 bucket per question, so the same question always lands in the same split. */
export function bucketOf(question: string): number {
  let h = 2166136261;
  for (const ch of question.toLowerCase().replace(/\s+/g, ' ').trim()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 10;
}
const splitOf = (question: string): Split => { const b = bucketOf(question); return b === 0 ? 'test' : b === 1 ? 'validation' : 'train'; };

export function buildTrainingSet(input: { claims: PortableClaim[]; examQuestions: string[]; baseModel?: string; now?: Date }): TrainingSet {
  const examples: Record<Split, SftExample[]> = { train: [], validation: [], test: [] };
  let eligible = 0;
  let leak = 0;
  let noPassage = 0;
  for (const claim of input.claims) {
    if (claim.status !== 'verified') continue;
    eligible += 1;
    const passages = claim.citations.filter((c) => typeof c.passage === 'string' && (c.passage as string).trim());
    if (!passages.length) { noPassage += 1; continue; }
    if (input.examQuestions.some((q) => similarity(q, claim.question) >= SAME_QUESTION)) { leak += 1; continue; }
    examples[splitOf(claim.question)].push({
      messages: [{ role: 'user', content: claim.question }, { role: 'assistant', content: claim.claim.replace(/\s*\[\d+\]/g, '').trim() }],
      provenance: { claimId: claim.id, reportId: claim.reportId, sources: passages.map((p) => String(p.title ?? p.source_id ?? '')), verifiedBy: 'device-owner-review' },
    });
  }
  const all = [...examples.train, ...examples.validation, ...examples.test];
  const characters = all.reduce((n, e) => n + e.messages.reduce((m, x) => m + x.content.length, 0), 0);
  return {
    examples,
    manifest: {
      format: 'atlas-training-jsonl', schemaVersion: 1, createdAt: (input.now ?? new Date()).toISOString(),
      counts: { train: examples.train.length, validation: examples.validation.length, test: examples.test.length, eligible, excludedExamLeak: leak, excludedNoPassage: noPassage },
      baseModel: input.baseModel?.trim() || null, estimatedTokens: Math.ceil(characters / 4),
      notes: [
        'Atlas has not trained or changed any model. Its stored knowledge lives in a database, not in model weights.',
        'Training needs a GPU, on your own computer or a cloud service. Atlas does not start paid services: you decide where and whether to train.',
        'Train a versioned adapter, keep the original model, compare the adapter with the original on the held-out test split, and deploy it only if it is measurably better. Keep the original so you can roll back.',
        input.baseModel?.trim() ? `Base model: ${input.baseModel.trim()}.` : 'Choose the exact base model before training: an adapter only works with the model it was trained on.',
      ],
    },
  };
}

/** One example per line, ready to write to train.jsonl, validation.jsonl and test.jsonl. */
export const toSftJsonl = (examples: SftExample[]): string => examples.map((e) => JSON.stringify(e)).join('\n') + (examples.length ? '\n' : '');
