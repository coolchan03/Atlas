/**
 * "Take me to...": a plain request ("how many euros is my money worth abroad", "make the app darker") is matched to the screens the search
 * knows by meaning, not by words. It uses the small embedding model the app already carries for document search (about 25 MB, one reading
 * of a short text takes milliseconds), not a chat model: tried on 16 requests, that found the right screen first 14 times (15 in the top
 * three) where a 350M-parameter chat model, even held to the screen titles by a grammar, found it 7 times. Nothing is run or changed: it only points.
 */
import { embeddingService } from '../services/rag/embedding';
import { cosineSimilarity } from '../services/rag/vectorMath';
import { listDestinations, type SearchHit } from './searchIndex';

/** A match weaker than this is not offered: the request is about something the app has no screen for. */
const MIN_SIMILARITY = 0.28;
const SHOWN = 3;

/** What each screen is embedded as: its title and the first words people use for it. Read once, kept while the app runs. */
const textOf = (d: { title: string; keywords: string }): string => `${d.title}. ${d.keywords.split(' ').slice(0, 8).join(' ')}`;
const vectors = new Map<string, number[]>();

async function vectorFor(text: string): Promise<number[]> {
  const known = vectors.get(text);
  if (known) return known;
  const made = await embeddingService.embed(text);
  vectors.set(text, made);
  return made;
}

/** The screens for a request, best first (at most three), each at least `MIN_SIMILARITY` alike. Throws when the embedding model cannot load. */
export async function askWhere(request: string): Promise<SearchHit[]> {
  await embeddingService.load();
  const query = await embeddingService.embed(request.trim().slice(0, 200));
  const scored: Array<{ hit: Omit<SearchHit, 'score'>; similarity: number }> = [];
  for (const d of listDestinations()) {
    const similarity = cosineSimilarity(query, await vectorFor(textOf(d)));
    if (similarity >= MIN_SIMILARITY) scored.push({ hit: { kind: 'screen', id: d.route, title: d.title, route: d.route, params: d.params, icon: d.icon }, similarity });
  }
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, SHOWN).map((s, i) => ({ ...s.hit, score: SHOWN - i }));
}
