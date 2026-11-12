import { citedNumbers, type EvidenceSource } from './evidenceGate';
import { checkSupport, claimSentences, closestPassage, compareClaim } from './claimText';
import type { LearningKnowledgeDb } from './knowledgeDb';

export interface IngestInput {
  topic: string;
  question: string;
  reportId: string;
  reportText: string;
  sources: EvidenceSource[];
  /** What the judge step decided about the whole report: a disputed report makes every new claim disputed. */
  reportStatus: 'candidate' | 'disputed';
  reportNote: string;
}

export interface IngestSummary {
  added: number;
  /** Already known: the new source was added to the existing claim instead of storing it twice. */
  duplicates: number;
  /** Conflicts with a known claim: both are marked disputed and the pair is recorded. */
  contradictions: number;
  /** The cited passage does not contain what the claim states. */
  unsupported: number;
}

const withoutMarkers = (text: string) => text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Stores the claims of one report the way the learning cycle needs them: each claim checked against the passage it cites,
 * compared with what is already known, and saved as a new claim, an extra source for a known claim, or a recorded conflict.
 * Nothing here can mark a claim verified.
 */
export function ingestClaims(db: LearningKnowledgeDb, input: IngestInput): IngestSummary {
  const summary: IngestSummary = { added: 0, duplicates: 0, contradictions: 0, unsupported: 0 };
  claimSentences(input.reportText).forEach((sentence, index) => {
    const id = `${input.reportId}:claim:${index + 1}`;
    const claim = withoutMarkers(sentence);
    const cited = citedNumbers(sentence);
    const citedSources = input.sources.filter((s) => cited.includes(s.n));
    const support = checkSupport(claim, citedSources.map((s) => s.passage ?? ''));
    const match = compareClaim(claim, db.knownClaims(input.topic));

    if (match.relation === 'duplicate' && match.matchId) {
      citedSources.forEach((s) => db.addSupport(match.matchId!, { ...s, reportId: input.reportId }));
      summary.duplicates += 1;
      return;
    }
    let status = input.reportStatus;
    let note = input.reportNote;
    if (support.supported === false) {
      status = 'disputed';
      note = `The cited passage does not contain ${support.missingNumbers.length ? support.missingNumbers.join(', ') : 'enough of this claim'}. ${note}`.trim();
      summary.unsupported += 1;
    }
    if (match.relation === 'contradicts') {
      status = 'disputed';
      note = `${match.reason}. ${note}`.trim();
    }
    const context = cited.length ? undefined : closestPassage(claim, input.sources);
    db.saveCandidate({
      id, topic: input.topic, question: input.question, claimText: claim, reportId: input.reportId, status,
      uncertainty: note.slice(0, 600), sources: input.sources, citedNumbers: cited, contextNumbers: context ? [context] : [],
    });
    summary.added += 1;
    if (match.relation === 'contradicts' && match.matchId) {
      db.recordContradiction(id, match.matchId, match.reason ?? 'Conflicts with a known claim');
      db.flagDisputed(match.matchId, match.reason ?? 'Conflicts with a newer claim');
      summary.contradictions += 1;
    }
  });
  return summary;
}
