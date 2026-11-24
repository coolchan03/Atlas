/**
 * Teach it back: you explain a topic in your own words, and Atlas shows which points of the source you covered and which you missed.
 * The key points are picked from the source and the match is decided in code (closeness in meaning by the document-search model,
 * shared words when that model is not there). The AI is not asked who is right: it only words the follow-up (feedback.ts).
 */
import { embeddingService } from '../services/rag/embedding';
import { cosineSimilarity } from '../services/rag/vectorMath';
import { salientSentences } from '../workflows/longText';

const MAX_POINTS = 8;
const COVERED_AT = 0.5;
const WORDS_COVERED_AT = 0.4;

export interface PointCheck { point: string; covered: boolean; /** How close the nearest sentence of the explanation was (0 to 1). */ score: number }

/** The key points of a source, up to eight, in order: every sentence when there are few, else the most fact-like sentence of each stretch. Pure. */
export function keyPoints(source: string): string[] {
  const sentences = source.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length >= 20);
  if (sentences.length <= MAX_POINTS) return sentences;
  const size = Math.ceil(sentences.length / MAX_POINTS);
  return Array.from({ length: MAX_POINTS }, (_, i) => sentences.slice(i * size, (i + 1) * size).join(' ')).filter(Boolean).flatMap((g) => salientSentences(g, 1));
}

const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter((s) => s.length > 3);
const content = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3).map((w) => w.replace(/(ing|ed|es|s)$/, ''));

/** Share of the point's content words that the explanation uses. Pure. */
function wordShare(point: string, explanation: string): number {
  const used = new Set(content(explanation));
  const want = content(point);
  return want.length ? want.filter((w) => used.has(w)).length / want.length : 0;
}

/** Which points your explanation covers. */
export async function checkCoverage(points: string[], explanation: string): Promise<PointCheck[]> {
  const said = sentencesOf(explanation);
  let vectors: Array<number[] | null> | null = null;
  let point: Array<number[] | null> = [];
  try {
    await embeddingService.load();
    vectors = await Promise.all(said.map((s) => embeddingService.embed(s).catch(() => null)));
    point = await Promise.all(points.map((p) => embeddingService.embed(p).catch(() => null)));
  } catch { vectors = null; }
  return points.map((p, i) => {
    const byMeaning = vectors && point[i] ? Math.max(0, ...vectors.map((v) => (v ? cosineSimilarity(point[i]!, v) : 0))) : null;
    if (byMeaning !== null) return { point: p, covered: byMeaning >= COVERED_AT, score: byMeaning };
    const share = wordShare(p, explanation);
    return { point: p, covered: share >= WORDS_COVERED_AT, score: share };
  });
}
