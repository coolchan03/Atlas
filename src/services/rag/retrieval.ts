import { RagSearchResult, ragDatabase } from './database';
import { isProtectedProject, knowledgeSource } from './knowledgeSource';
import { embeddingService } from './embedding';
import { cosineSimilarity } from './vectorMath';
import { rankChunks } from './rankChunks';
import { refScore, sectionRefs } from './sectionRefs';
import logger from '../../utils/logger';

/** Strip HTML-like tags without regex backtracking risk. */
function stripAngleBracketTags(text: string): string {
  let result = '';
  let inTag = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '<') { inTag = true; continue; }
    if (text[i] === '>') { inTag = false; continue; }
    if (!inTag) result += text[i];
  }
  return result;
}

interface SearchResult {
  chunks: RagSearchResult[];
  truncated: boolean;
}

/** Options for a search: how many passages, and which documents to look in (by name). */
export interface SearchOptions { topK?: number; include?: (docName: string) => boolean }

/** The stored embeddings of a project, kept in memory until a document is added, removed or switched, so a lesson (many searches in a row) does not read and decode every one each time. Not kept for a protected project, nor for a very large one. */
const embeddingCache = new Map<string, { version: number; stored: ReturnType<typeof ragDatabase.getEmbeddingsByProject> }>();
const MAX_CACHED = 40000;
/** Forgets the kept embeddings (for a test that swaps the database under the service). */
export const resetEmbeddingCache = (): void => embeddingCache.clear();
function embeddingsOf(projectId: string, source: ReturnType<typeof knowledgeSource>) {
  // No version to compare (or a protected project): read fresh every time.
  if (isProtectedProject(projectId) || typeof ragDatabase.version !== 'number') return source.getEmbeddingsByProject(projectId);
  const hit = embeddingCache.get(projectId);
  if (hit && hit.version === ragDatabase.version) return hit.stored;
  const stored = source.getEmbeddingsByProject(projectId);
  if (stored.length <= MAX_CACHED) embeddingCache.set(projectId, { version: ragDatabase.version, stored }); else embeddingCache.delete(projectId);
  return stored;
}

class RetrievalService {
  async search(projectId: string, query: string, options: number | SearchOptions = 5): Promise<SearchResult> {
    const { topK = 5, include } = typeof options === 'number' ? { topK: options } as SearchOptions : options;
    const exact = isProtectedProject(projectId) ? [] : this.exactMatches(projectId, query, { include, topK });
    const semantic = await this.searchSemantic(projectId, query, { topK, include });
    // A passage that carries the exact section asked about comes first; the meaning-based results fill the rest.
    const seen = new Set(exact.map((c) => `${c.doc_id}:${c.position}`));
    const chunks = [...exact, ...semantic.filter((c) => !seen.has(`${c.doc_id}:${c.position}`))].slice(0, Math.max(topK, exact.length));
    return { chunks, truncated: false };
  }

  /** Passages that contain a section, regulation, ASC topic, ASU, ruling or notice the question names, the ones that open with it first. */
  private exactMatches(projectId: string, query: string, { include, topK = 5 }: SearchOptions): RagSearchResult[] {
    const refs = sectionRefs(query);
    if (!refs.length) return [];
    try {
      // Chunks where the reference is a heading ("§ 179.") first, so a section's own text is not crowded out by the many chunks that only mention it.
      const needles = refs.flatMap((r) => r.needles);
      const headings = ragDatabase.findChunksContaining(projectId, needles.map((n) => `${n}.`), 40);
      const found = [...headings, ...ragDatabase.findChunksContaining(projectId, needles, 60)].filter((c, i, all) => all.findIndex((o) => o.doc_id === c.doc_id && o.position === c.position) === i).filter((c) => !include || include(c.name));
      return found.map((c) => ({ c, s: refScore(c.content, refs) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, Math.min(topK, 4)).map((x) => ({ ...x.c, score: 1 }));
    } catch { return []; }
  }

  private async searchSemantic(projectId: string, query: string, { include, topK = 5 }: SearchOptions): Promise<RagSearchResult[]> {
    if (!query.trim()) return [];

    const source = knowledgeSource(projectId);
    const stored = embeddingsOf(projectId, source).filter((e) => !include || include(e.name));
    if (stored.length === 0 && include) return []; // nothing of the kind asked for (for example no reference documents): not the first chunks of something else
    if (stored.length === 0) {
      // Fallback: return first chunks if no embeddings exist yet
      logger.log('[Retrieval] No embeddings found, returning first chunks as fallback');
      return source.getChunksByProject(projectId, topK);
    }

    if (!embeddingService.isLoaded()) {
      try {
        await embeddingService.load();
      } catch (err) {
        logger.error('[Retrieval] Failed to load embedding model, falling back', err);
        return source.getChunksByProject(projectId, topK);
      }
    }

    let queryVec: number[];
    try {
      queryVec = await embeddingService.embed(query);
    } catch (err) {
      logger.error('[Retrieval] Failed to embed query, falling back', err);
      return source.getChunksByProject(projectId, topK);
    }

    const scored = stored.map(entry => ({
      doc_id: entry.doc_id,
      name: entry.name,
      content: entry.content,
      position: entry.position,
      score: cosineSimilarity(queryVec, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    // Take extra candidates, then keep the ones that are about the question and spread them over the documents.
    return rankChunks(query, scored.slice(0, topK * 3), topK);
  }

  formatForPrompt(result: SearchResult): string {
    if (result.chunks.length === 0) return '';

    const sections = result.chunks.map((chunk, index) => {
      // Sanitize content to prevent prompt injection from user-uploaded documents
      const safeName = chunk.name.replaceAll(/[<>]/g, '');
      const safeContent = stripAngleBracketTags(chunk.content);
      return `[Source ${index + 1}: ${safeName} (part ${chunk.position + 1})]\n${safeContent}`;
    });

    return `<knowledge_base>\nThe following excerpts are from the user's project knowledge base. Use them to inform your response when relevant, and cite an excerpt you use by its source number in square brackets, like [1].\n\n${sections.join('\n\n---\n\n')}\n</knowledge_base>`;
  }

  estimateCharBudget(contextLengthTokens: number): number {
    // 25% of context window reserved for RAG; ~4 chars per token → simplifies to contextLength
    return Math.max(0, Math.floor(contextLengthTokens));
  }

  async searchWithBudget(params: { projectId: string; query: string; contextLength: number; topK?: number }): Promise<SearchResult> {
    const result = await this.search(params.projectId, params.query, params.topK ?? 5);
    const budget = this.estimateCharBudget(params.contextLength);

    let totalChars = 0;
    const fittingChunks: RagSearchResult[] = [];
    let truncated = false;

    for (const chunk of result.chunks) {
      totalChars += chunk.content.length;
      if (totalChars > budget) {
        truncated = true;
        break;
      }
      fittingChunks.push(chunk);
    }

    return { chunks: fittingChunks, truncated };
  }
}

export const retrievalService = new RetrievalService();
