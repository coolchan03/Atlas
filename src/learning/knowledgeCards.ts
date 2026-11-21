/**
 * Hot knowledge: short cards for the learner to search, built from the two stores Atlas keeps (see docs/teach-ai-data-map.md):
 * the claims ledger (`src/learning`, SQLite) and the reviewed findings (`src/knowledge`, files). A card is a SMALL VIEW of a record:
 * its status is copied from that record and is never raised by this module, so an unsupported assertion cannot become a "checked"
 * card; the card points back (`deep`) to the full record and its source passages, which stay in their own store and are fetched only
 * when needed. Pure apart from the two loaders at the bottom.
 */
import type { Finding, FindingStatus } from '../knowledge/schema';

type CardStatus = 'verified' | 'candidate' | 'disputed' | 'needs_review';
type CardOrigin = 'claim' | 'finding' | 'goal' | 'correction';

export interface KnowledgeCard {
  /** Stable: the record's own id, prefixed by its store. */
  id: string;
  origin: CardOrigin;
  topic: string;
  /** One short line naming the concept (the question it answers, else the start of the text). */
  title: string;
  /** At most CARD_CHARS characters of the record's own words. */
  text: string;
  status: CardStatus;
  /** Where it came from, for display: the document title or source names. */
  source?: string;
  /** What is uncertain about it, when the record says. */
  uncertainty?: string;
  /** Does the record have at least one source passage on file? A card without one cannot be shown as supported. */
  hasEvidence: boolean;
  /** Pointer to the full record in its own store. */
  deep: { origin: CardOrigin; id: string };
}

export const CARD_CHARS = 280;
const TITLE_CHARS = 80;
const clip = (t: string, n: number) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const FINDING_STATUS: Partial<Record<FindingStatus, CardStatus>> = {
  approved: 'verified', provisional: 'candidate', 'needs-review': 'needs_review', conflicted: 'disputed',
}; // rejected and superseded findings make no card

export function claimCard(c: { id: string; text: string; status: string; topic: string; question?: string; sources?: string[]; evidenceCount?: number }): KnowledgeCard | null {
  const status = (['verified', 'candidate', 'disputed', 'needs_review'] as const).find((s) => s === c.status);
  if (!status) return null; // rejected / superseded claims make no card
  return {
    id: `claim:${c.id}`, origin: 'claim', topic: c.topic, title: clip(c.question || c.text, TITLE_CHARS), text: clip(c.text, CARD_CHARS), status,
    source: c.sources?.length ? c.sources.slice(0, 2).join('; ') : undefined, hasEvidence: (c.evidenceCount ?? c.sources?.length ?? 0) > 0,
    deep: { origin: 'claim', id: c.id },
  };
}

export function findingCard(f: Pick<Finding, 'recordId' | 'topicId' | 'question' | 'finding' | 'status' | 'uncertainty' | 'documentTitle' | 'evidence'>, topic: string): KnowledgeCard | null {
  const status = FINDING_STATUS[f.status];
  if (!status) return null;
  return {
    id: `finding:${f.recordId}`, origin: 'finding', topic, title: clip(f.question || f.finding, TITLE_CHARS), text: clip(f.finding, CARD_CHARS), status,
    source: f.documentTitle || undefined, uncertainty: f.uncertainty ? clip(f.uncertainty, 120) : undefined,
    hasEvidence: f.evidence.length > 0, deep: { origin: 'finding', id: f.recordId },
  };
}

/** The learner's active goal: the person's objective and the Manager's current direction. A goal is an instruction, not a fact, so it has no evidence and is never counted as checked knowledge. */
export function goalCard(topic: string, objective: string, direction: string): KnowledgeCard | null {
  const text = [objective.trim() && `Objective: ${objective.trim()}`, direction.trim() && `Current direction: ${direction.trim()}`].filter(Boolean).join(' ');
  if (!text) return null;
  return { id: `goal:${norm(topic).replace(/ /g, '-') || 'goal'}`, origin: 'goal', topic, title: 'Active goal', text: clip(text, CARD_CHARS), status: 'candidate', source: 'Your objective', hasEvidence: false, deep: { origin: 'goal', id: topic } };
}

/** A mistake the learner made and its correction, so the same slip is not repeated. Never evidence for a fact. */
export function correctionCard(e: { id: string; topic: string; attempt: string; correction?: string | null }): KnowledgeCard | null {
  const fix = (e.correction ?? '').trim();
  if (!fix) return null;
  return { id: `correction:${e.id}`, origin: 'correction', topic: e.topic, title: clip(`Mistake: ${e.attempt}`, TITLE_CHARS), text: clip(`Earlier mistake: ${e.attempt}. Correction: ${fix}`, CARD_CHARS), status: 'candidate', source: 'A mistake it made', hasEvidence: false, deep: { origin: 'correction', id: e.id } };
}

/** The notes the working context reads: a goal is pinned, everything else is ranked by the question. */
export const cardNotes = (cards: KnowledgeCard[], withSource = false) => cards.map((k) => ({ id: k.id, text: k.text, status: k.status, topic: k.topic, pinned: k.origin === 'goal', ...(withSource ? { source: k.source } : {}) }));

const RANK: Record<CardStatus, number> = { verified: 3, candidate: 2, needs_review: 1, disputed: 0 };

/**
 * The same statement kept in both stores becomes one card. The card keeps the status of the record that is MORE trusted only when
 * that record itself carries it; a candidate never inherits "verified" from a neighbour, and a disputed record keeps the card disputed.
 */
export function mergeCards(cards: KnowledgeCard[]): KnowledgeCard[] {
  const byText = new Map<string, KnowledgeCard>();
  for (const c of cards) {
    const key = `${c.topic}|${norm(c.text)}`;
    const have = byText.get(key);
    if (!have) { byText.set(key, c); continue; }
    if (have.status === 'disputed' || c.status === 'disputed') { byText.set(key, { ...(have.status === 'disputed' ? have : c), hasEvidence: have.hasEvidence || c.hasEvidence }); continue; }
    const best = RANK[c.status] > RANK[have.status] ? c : have;
    byText.set(key, { ...best, hasEvidence: have.hasEvidence || c.hasEvidence, source: best.source ?? (best === c ? have.source : c.source) });
  }
  return [...byText.values()];
}

/** Cards a learner may treat as established (reviewed and approved), and only those. */
export const approvedCards = (cards: KnowledgeCard[]): KnowledgeCard[] => cards.filter((c) => c.status === 'verified' && c.hasEvidence);

export interface CardSummary { total: number; verified: number; candidate: number; disputed: number; needsReview: number; withoutEvidence: number; fromClaims: number; fromFindings: number }
export function summarizeCards(allCards: KnowledgeCard[]): CardSummary {
  const cards = allCards.filter((c) => c.origin === 'claim' || c.origin === 'finding'); // goals and corrections are guidance, not knowledge
  const count = (s: CardStatus) => cards.filter((c) => c.status === s).length;
  return {
    total: cards.length, verified: count('verified'), candidate: count('candidate'), disputed: count('disputed'), needsReview: count('needs_review'),
    withoutEvidence: cards.filter((c) => !c.hasEvidence).length,
    fromClaims: cards.filter((c) => c.origin === 'claim').length, fromFindings: cards.filter((c) => c.origin === 'finding').length,
  };
}

/** What a card is backed by, read from its own store (injected, so this stays testable and the stores stay separate). */
export interface DeepReaders {
  claim: (id: string) => Array<{ title: string; locator: string; passage: string }>;
  finding: (id: string) => Promise<Array<{ title: string; locator: string; passage: string }>> | Array<{ title: string; locator: string; passage: string }>;
}
export async function deepPassages(card: KnowledgeCard, read: DeepReaders, limit = 3): Promise<Array<{ title: string; locator: string; passage: string }>> {
  if (card.deep.origin !== 'claim' && card.deep.origin !== 'finding') return []; // a goal or a correction has no source passages
  const rows = await (card.deep.origin === 'claim' ? read.claim(card.deep.id) : read.finding(card.deep.id));
  return rows.filter((r) => r.passage.trim()).slice(0, limit);
}

// ------------------------------------------------------------------ loaders (touch the two stores)
/** All cards for a topic from both stores. A store that cannot be read contributes nothing (and never blocks the other). */
export async function loadCards(topic: string, agentId?: string, limit = 300): Promise<KnowledgeCard[]> {
  const out: KnowledgeCard[] = [];
  try {
    const { learningKnowledgeDb } = require('./knowledgeDb');
    for (const k of learningKnowledgeDb.knownClaims(topic, limit, agentId)) {
      let sources: string[] = []; let n = 0;
      try { const rows = learningKnowledgeDb.getClaimSources(k.id); n = rows.filter((r: { passage: string }) => r.passage.trim()).length; sources = rows.map((r: { title: string }) => r.title).filter(Boolean); } catch { /* sources unreadable: the card shows no evidence */ }
      const card = claimCard({ ...k, topic, sources, evidenceCount: n });
      if (card) out.push(card);
    }
  } catch { /* claims store unavailable */ }
  try {
    if (agentId) {
      const { useLearningStore } = require('./store');
      const s = useLearningStore.getState();
      const goal = goalCard(topic, s.getConfig(agentId).topic, s.get(agentId).direction);
      if (goal) out.push(goal);
      const { learningKnowledgeDb: db } = require('./knowledgeDb');
      for (const r of (db.sql('SELECT id, topic, attempt, correction FROM atlas_experience WHERE topic = ? AND correction IS NOT NULL ORDER BY created_at DESC LIMIT 12', [topic]).rows ?? []) as Array<{ id: string; topic: string; attempt: string; correction: string }>) {
        const card = correctionCard(r); if (card) out.push(card);
      }
    }
  } catch { /* goals and corrections unavailable */ }
  try {
    if (agentId) {
      const { searchFindings } = require('../knowledge/cycles');
      for (const f of (await searchFindings({ agentId, limit })) as Finding[]) { const card = findingCard(f, topic); if (card) out.push(card); }
    }
  } catch { /* findings store unavailable */ }
  return mergeCards(out);
}

/** Cards for every subject that has a learning task: [{ agentId, topic }]. */
export async function loadAllCards(subjects: Array<{ agentId: string; topic: string }>): Promise<KnowledgeCard[]> {
  const seen = new Set<string>();
  const out: KnowledgeCard[] = [];
  for (const s of subjects) {
    if (!s.topic.trim() || seen.has(`${s.agentId}|${s.topic}`)) continue;
    seen.add(`${s.agentId}|${s.topic}`);
    out.push(...await loadCards(s.topic, s.agentId));
  }
  return mergeCards(out);
}
