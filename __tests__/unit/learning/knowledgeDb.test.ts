import { extractCandidateClaims, KNOWLEDGE_DDL, KNOWLEDGE_SCHEMA_VERSION } from '../../../src/learning/knowledgeDb';

describe('non-destructive knowledge database schema', () => {
  it('creates separate claim, source, evidence, report, history, experience and procedure stores', () => {
    const sql = KNOWLEDGE_DDL.join('\n');
    expect(KNOWLEDGE_SCHEMA_VERSION).toBe(2);
    for (const name of [
      'atlas_sources', 'atlas_claims', 'atlas_evidence', 'atlas_claim_history',
      'atlas_report_archive', 'atlas_experience', 'atlas_procedures', 'atlas_exam_results',
      'atlas_contradictions', 'atlas_mastery', 'atlas_exam_items',
    ]) expect(sql).toContain(name);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('extracts candidate statements without losing the original report', () => {
    const text = 'ANSWER: Tax law depends on effective dates. [1]\nKEY POINTS:\n- Historical years use historical rules. [2]\nREASONING: this is an explanation';
    expect(extractCandidateClaims(text)).toEqual([
      'Tax law depends on effective dates. [1]',
      'Historical years use historical rules. [2]',
    ]);
    expect(text).toContain('REASONING:');
  });
});
