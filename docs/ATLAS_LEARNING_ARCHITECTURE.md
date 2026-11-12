# Atlas learning cycle: architecture and handoff

Build 0.0.158. Nothing here has been tried on a phone. The tax code and other legal sources are deliberately not included.

## What changed

Teach the AI keeps its Learner, Judge and Manager. They now sit on a knowledge ledger and follow rules written in code, not only
in prompts. Atlas does not change model weights: what it learns is stored as claims in a database.

## Where things are (`src/learning/`)

| File | Job |
|---|---|
| `engine.ts` | The loop: bank, study, judge, manager, practice, exams. Only the model calls live here |
| `knowledgeDb.ts` | The ledger (SQLite, schema 2): sources, claims, evidence, claim history, report archive, experience, procedures, contradictions, mastery, exam items and results |
| `claimText.ts` | Pure text checks: similarity, numbers, "does the cited passage contain what the claim states", duplicate or conflict, recall score |
| `claimIngest.ts` | Stores one report's claims: check, compare with known claims, then save, add a source, or record a conflict |
| `evidenceGate.ts`, `judgeDimensions.ts` | The Judge's gates |
| `cycleRules.ts` | What happens next, when a report may be rewritten, whether a Manager question is on the task, bounding the question list |
| `masteryStore.ts`, `memoryLedger.ts` | Spaced review; experience and procedural memory |
| `exams.ts` | Exam items, deterministic scoring, results history, the improvement summary |
| `knowledgeInterchange.ts`, `knowledgePorting.ts`, `exportFiles.ts` | The portable format, reading and writing it, saving files |
| `trainingExport.ts` | The training dataset |
| `sourceSafety.ts` | Removes instruction-like sentences from retrieved text |

## How knowledge is stored

Three kinds of memory, kept apart:

- **Factual**: one row per claim in `atlas_claims`, with its question, topic, report, status (`candidate`, `verified`, `disputed`,
  `superseded`, `rejected`), uncertainty note, timestamps and schema version. Its evidence is in `atlas_evidence`: the passage,
  a locator, and a stance (`cited`, `supporting` for a second source, `context` for a passage that is close but not cited).
  Sources carry kind, URL, dates and, for later use, effective dates and tax year.
- **Experience**: `atlas_experience` holds what was tried, how it went and the correction. Repeated failures are counted.
- **Procedural**: `atlas_procedures` holds strategies. They start `unverified`.

Original reports are archived unchanged in `atlas_report_archive`. Older databases upgrade by adding tables; nothing is dropped.

## How verification works

1. The Learner writes a report from numbered sources.
2. The Judge gives a verdict and six scores: `FACTS`, `CITES`, `COMPLETE`, `RELEVANT`, `LOGIC`, `CLEAR`.
3. Two independent gates decide acceptance, whatever the overall score:
   - **Facts** fails on a known-error alarm or a facts score below 6.
   - **Citations** fails when a cited number is unknown, a cited sentence states a number the passage does not contain, the
     passage shares too little with the claim, or the citations score is below 6. This part is checked by text, not by the model.
4. A verdict that contradicts its own score (PASS with 2 out of 10) is disputed. A missing score is "unknown", never a pass.
5. Each claim is compared with known claims. A repeat adds a source. A different number or an opposite statement is a conflict:
   both claims become `disputed` and the pair is recorded.
6. Nothing becomes `verified` automatically. Only a person can, from Learning reliability, and only with a stored passage.

## The cycle

Each turn: settle a conflict (it becomes a study question first), else review concepts that are due, else study the next
question. Reviews are graded by comparing the answer with the stored claims, never by the model. A report that failed on facts or
citations is not rewritten when the new search finds no new evidence. The Manager receives measured numbers (claims by status,
open conflicts, due reviews, repeated mistakes), and a question it adds must share a word with the task. The question list is
bounded; claims, sources and logs are never pruned. A checkpoint records the current step, so an interrupted run says where it
stopped. Retrieved text is also stripped of instruction-like sentences before the model reads it.

## Measuring it

Learning reliability, Exam: questions with the facts a right answer must contain, and optional wordings that must not appear.
Study questions can never be exam questions. The exam runs in three modes (the model alone, with sources, with sources and stored
memory) and records accuracy, out-of-date answers, unsupported citations, repeated failures, time per question and memory use.
An improvement is reported only when memory beat the model alone on the same exam version over at least five questions.
Processor use is not measured, because JavaScript cannot read it.

## Exports

`atlas-knowledge-jsonl`, schema 1, one record per line: `claim` (with citations), `contradiction`, `claim_history`,
`experience`, `procedure`, `exam_result`, `mastery`. Export is deterministic. Import validates every line, ignores ids it already
has, refuses conflicting copies, and runs in one transaction. **Import never grants `verified`**: a claim that arrives verified is
stored as a candidate with a note, because verification means a review on this device. Passages are left out unless asked for.
Exam questions are never exported.

Street Advisory can read the JSONL directly. It has not been tested against Street's own bundle format, which needs an adapter.

## Training data

Training data export writes `train.jsonl`, `validation.jsonl`, `test.jsonl` and `manifest.json`. Only claims a person verified,
with a stored passage, become examples. Questions on the exam are left out. A question always lands in the same split (about 80,
10 and 10 percent). The manifest records the base model you name and states that Atlas trained nothing. Training needs a GPU on
your own machine or a cloud service, which you choose and pay for. After training, compare the adapter with the original on the
test split, keep the original, and deploy the adapter only if it is measurably better.

## Not done

- Ingesting the tax code, regulations and other legal sources, source authority ranking and amendment tracking.
- Semantic embeddings. Nothing showed they would help, and full-text and word-overlap retrieval run on the phone.
- A model that checks whether a passage entails a claim. The checks are by text and find problems; they do not prove a claim.
- Training an adapter, evaluating it against the original and deploying it.
