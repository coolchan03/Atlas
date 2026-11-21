# Atlas learning cycle: architecture and handoff

Build 0.0.158 (requirements updated for the next version at the end of this file). Nothing here has been tried on a phone. The tax code and other legal sources are deliberately not included.

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

## Not done (older list, superseded by the requirements update below)

- Ingesting the tax code, regulations and other legal sources, source authority ranking and amendment tracking.
- Semantic embeddings. Nothing showed they would help, and full-text and word-overlap retrieval run on the phone.
- A model that checks whether a passage entails a claim. The checks are by text and find problems; they do not prove a claim.
- Training an adapter, evaluating it against the original and deploying it.

---

# Requirements update: Teach AI and persistent learning (next version)

This section replaces the older "Not done" wishes as the target for the next learning work. It is a plan and a gap list, checked
against the code as of 0.0.226, not a record of finished work. Nothing below has been run on a phone. Atlas does not train model
weights: this is external memory (stored cards, documents and tests), and the interface must never suggest otherwise.

## Goal

An AI that can accumulate, retrieve, correct and apply durable knowledge without unlimited context growth. Preserve existing chats,
projects, models, downloads and offline-first behaviour, and keep data already stored (including projects that are already protected)
readable after the change. Do not replace the release signing key, do not invent results, and do not call an unfinished feature
finished. Privacy gating is not part of this work (see "Dropped by the owner" at the end).

## Architecture: two persistent levels and one temporary context

| Level | What it holds | Where it is today | Gap to close |
|---|---|---|---|
| Hot memory | Small, indexed, project-scoped knowledge cards: key concepts, active goals, useful corrections, source references | `knowledgeCards.ts` (cards are small views of ledger claims and reviewed findings; status is copied, never raised) | Confirm cards are scoped by project and not only by topic; add goals and corrections as card kinds; an index that survives restarts and a size cap per project |
| Deep knowledge | Full reports, documents, citations, Judge reviews, mistakes, test histories, earlier versions; originals preserved; searchable without loading everything | `knowledgeDb.ts` (claims, evidence, history, `atlas_report_archive`, experience, mastery, exam results) and `src/knowledge` (documents, chunks, cycles) | Two stores today (see `docs/teach-ai-data-map.md`): keep them, but give one search entry point and one id scheme |
| Working context | A bounded, task-specific selection of hot cards and retrieved evidence, rebuilt for every learning step | `workingContext.ts` (token budget, one topic, unreviewed notes labelled) | Make the budget device-aware (from the loaded model's context and free memory); log what was used for each step |

## Teach AI workflow: learner, Judge, Manager

- **Learner:** picks useful questions from the teaching objective; reads previous knowledge and recorded misconceptions; studies project
  documents and, only with permission, online sources; writes compact lessons with citations, uncertainties and next questions.
- **Judge:** challenges claims and source quality; keeps the original lesson; records structured verdicts; writes unfamiliar
  application questions with hidden answer keys (the learner never sees the key; the key is stored only on the Judge side).
- **Manager:** reads measured progress and repeated failures; finds neglected topics and redundant lessons; prioritises next work;
  keeps high-risk conclusions (medical, legal, tax, money) under human review.
- **Roles and models:** the owner swaps models often, so the learned memory is model-independent (cards and claims record which model wrote them; any model can use them). Different compatible models per role only when memory allows. Never run two large models at once past the
  device limit; load on demand, unload after, and say plainly when a role falls back to the one loaded model.

Exists in `engine.ts`: the three roles, the question bank, judge passes, manager reviews, redo with feedback, checkpoints.
To verify or add: per-role model choice with a memory check; structured verdict records kept with the lesson; application
questions with hidden keys made by the Judge (today exam questions are written by a person and kept out of study).

## Testing and mastery

Two evaluation modes, both kept apart from study questions:

1. **Closed-book:** reasoning with no saved knowledge. Exists as the exam mode "The model alone".
2. **Memory-assisted:** application with retrieval from approved project knowledge only. Exists as "With sources and stored memory";
   make "approved" mean verified or reviewed, not any candidate.

Also required: keep every failed attempt and its correction record; delayed practice and retests that are due when the app is
opened (spaced intervals exist in `masteryStore.ts`), never assuming Android runs a job at an exact time; show mastery evidence
(recalled correctly N times running, last result, next retest date, exam trend), not the number of lessons written.

## Retrieval and performance

- **Retrieval fallback:** the old behaviour of returning the first project chunks when embeddings are missing was changed in 0.0.206
  (relevance by the question's own words, and "no evidence" when nothing matches). Add a test that proves it for every retrieval
  entry point, and mark results as degraded when semantic search is unavailable.
- Device-aware token budgets; bounded retrieval (count and size); on-demand model loading; memory-pressure checks before a step;
  cancellation at every step; a durable checkpoint after each step so an interruption resumes.
- Retrieved documents and web pages are untrusted data, never instructions (`sourceSafety.ts` exists; extend its tests to hidden text,
  encoded text and long documents).

## Export a project as one ZIP (replaces the Pi and SLE export)

The Raspberry Pi and SLE export is scratched. What is wanted is one ZIP the owner can keep or move to another phone:

- **The project:** its name, instructions, settings and chats' links to the project (not other projects).
- **What the learner has learned (the hot memory):** the knowledge cards and the claims behind them, both **candidates and verified**
  (and disputed ones, marked as disputed), each with its status, its source passages and its page or locator.
- **The documents related to the project:** the original files, with the extracted text and chunk index so they open without
  re-reading. Preserve originals byte for byte.
- A `manifest.json` (counts, per-file size and SHA-256, app and schema versions, the project and when it was exported) and a
  `checksums.json`, so an import can check the bundle first and a damaged bundle changes nothing.
- **Import:** reading the same ZIP twice adds nothing (match by record id and content hash); nothing is overwritten; a claim that
  arrives as verified is kept as it was marked in the ZIP and shows where it came from; a conflicting copy is kept next to the
  original and marked disputed, as the interchange rules already say.
- **Built on what exists:** `knowledgeInterchange.ts`, `knowledgePorting.ts`, `zipDirectory.ts` and `docs/ATLAS_LEARNING_INTERCHANGE.md`
  (atlas-learning-interchange/1.0) already write and read a ZIP with a manifest, checksums, findings, reviews and cited chunks, with
  originals optional. Gaps: the project record itself, all the project's documents (not only the cited chunks) with originals on by
  default, the ledger claims and cards in one bundle (today the claims ledger and the reviewed findings are two stores), and a button
  on the project's Teach AI screen. Street and SLE compatibility is no longer a goal.
- What the Judge has learned (its verdicts and hidden application questions) is not part of the export. Exam questions stay out, as
  they do today, so a copied bundle cannot leak the answers to a test.

## Interface (inside Teach AI, kept compact)

Show: current objective and active agent; status (learning, reviewing, testing, blocked or paused, with the reason); research and
review state; last completed lesson; knowledge retrieved for the current lesson; questions awaiting review; mastery and upcoming
retests; token use, memory pressure and progress; an "Export this project" action that makes the ZIP and says what is in it (project,
learned cards and claims with their statuses, documents).

## Phases

1. Audit and tests first: write failing tests for the gaps above (context bounds, relevant retrieval, persistence across restart,
   Judge verdicts, hidden keys, interruption and resume, repeated import, project migration).
2. Hot cards: project scope, goals and corrections, index, caps.
3. Judge: structured verdicts and hidden-key application questions; Manager priorities from measured data.
4. Testing and mastery evidence on the learning screen; retests due on open.
5. Retrieval degradation marking; device-aware budgets and memory checks; per-role models with a memory guard.
6. Project ZIP export and import: the project record, all documents with originals, claims and cards (candidates and verified), checksums,
   repeat-import safety, then the button.

## Acceptance (every item needs an honest result, including "not done")

TypeScript, lint, dependency and knip checks; the relevant Jest suites; Android packaging and signing verification with the existing
release key; device acceptance on supported phones (chat, projects and downloads unchanged, already-protected projects still open; offline run; interruption
and resume; low-memory run). The final handoff lists code changes, test outcomes, the APK or release link, and remaining gaps.

## Questions for the owner

- Which records may leave the phone by default (verified only, or candidates too).
- Which models you use for the learner and for the Judge. The learner's memory and the export must not depend on which model wrote them: every card and claim records the model that wrote it, and a different model can read, test and extend it.

## Dropped by the owner

The owner chose to scratch privacy gating and the Pi and SLE export from this work. Not required, not tested, and not built here:

- The Raspberry Pi and SLE v1 export, Street compatibility, and anything about the Pi reviewing records.
- Excluding protected or private projects and chats from an export, and asking for consent per export or per card import.
- Privacy-control tests, and any rule that a record may not leave the phone because of how it was protected.
- A "do not silently weaken privacy" requirement for new learning features.

Kept, because they are about not breaking things or about the safety of the data, not privacy: stored data stays readable after
migration (already-protected projects still open), imports are checksum-verified and non-destructive, and retrieved text is treated as
untrusted data and never as instructions.
