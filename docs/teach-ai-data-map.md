# Teach AI: where learning data lives and who reads or writes it

Atlas keeps two stores. They are not merged (that would risk the original reports and review history); they are read together through one view, `src/learning/knowledgeCards.ts`.

| Store | Where | Holds | Written by | Read by |
|---|---|---|---|---|
| Claims ledger | `src/learning/knowledgeDb.ts` (SQLite: `atlas_claims`, `atlas_evidence`, `atlas_sources`, `atlas_claim_history`, `atlas_report_archive`, `atlas_contradictions`) | Short claims from each learner report, each with sources, a status (`candidate`, `verified`, `disputed`, `rejected`, `superseded`) and a history of every status change | `engine.ts` (learner/judge/manager cycle), the Learning reliability screen (a person's review) | `askLearned.ts`, exams (memory mode), the Learning reliability screen |
| Reviewed findings | `src/knowledge/*` (JSON/JSONL files per cycle: `cycles.ts`, `study.ts`, `schema.ts`) | Findings from studying a document, each with page-level evidence quotes, a content hash, a revision number and judge + manager review records | `study.ts` (document study), `cycles.ts` review calls | `KnowledgeScreen`, exams (memory mode, via cards) |
| Mastery | `atlas_mastery` (same SQLite database) | Per-question recall strength and next review date for LEARNING questions | `engine.ts` | `engine.ts` (what to practise next) |
| Exam | `atlas_exam_items`, `atlas_exam_results` (same SQLite database) | Exam questions with answer keys, and every run with per-answer reasons and the scoring version | `exams.ts` | `ProgressSection`, `ExamSection` |

## Rules

- **Exam questions never enter learning or mastery.** The exam store is read only by the exam; failed exam questions are listed for retest (`retestNote`) but are not copied into mastery, because the learner would then study them.
- **Original reports and history are never edited.** A correction is a new status row (claims) or a new revision (findings).
- **A card is a view.** `KnowledgeCard.status` is copied from its record and never raised; merging two cards of the same statement keeps a dispute and never lets a candidate inherit "verified". Only `verified` cards that have a source passage on file count as approved evidence (`approvedCards`).
- **Deep records stay where they are.** A card holds a pointer (`deep`); the full report, source passages and review history are fetched from the owning store on demand (`deepPassages`). Nothing copies a whole document into a prompt.
- **Working context is temporary.** `workingContext.ts` assembles the relevant cards (and passages) within the active token budget, from ONE topic, for one step, and the text is dropped afterwards.
- **No schema change was needed.** The stores are read, not altered, so no migration runs and older databases keep working.
