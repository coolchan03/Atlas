# Atlas upgrade prompt: what is done and what is not

Checked against the code on 2026-11-12 (build 0.0.157 plus the fixes made that day). "Done" means the behavior exists and has a test.
"Partly" says what is missing. Nothing here was tried on a phone.

## Learning architecture (phases 1 to 9)

| Phase | Status | What exists | What is missing |
|---|---|---|---|
| 1. Inspect the code | Cannot verify | The pieces named in the prompt exist (`src/learning/engine.ts`, `evidenceGate.ts`, `knowledgeDb.ts`) | No written diagnosis was saved in the repo |
| 2. Evidence-grounded storage | Partly | SQLite database with sources, claims, evidence, correction history, report archive. Claims carry status, dates, locators and schema version. Old reports are archived unchanged and never auto-verified | The experience, procedural-memory and exam-result tables are created but nothing writes to them |
| 3. Better Learner | Partly | Claims are pulled out of each report and saved as `candidate` with their sources | It does not search primary sources, pull passages per claim, compare with existing knowledge, or skip repeat research when nothing changed. Claim extraction is a sentence split, not a model step |
| 4. Stronger Judge | Partly | Score parsing (`8/5` style errors are invalid), citation de-duplication, alarms for the listed tax mistakes, and a gate where a high score never makes a claim `verified` | The six dimensions are not scored separately, and there are no deterministic checks for statutes, dates or calculations beyond those alarms |
| 5. Source versioning and legal knowledge | Not done | Fields for effective dates and tax year exist | No Internal Revenue Code XML ingestion, no regulations, no section index, no amendment tracking, no source-authority ranking, no incremental updates |
| 6. Better Manager | Partly | The Manager reviews drift and its prompt favors contradictions and missing basics | No mastery tracking, no scheduled practice or review, no checkpoint and resume, no bounded queue or cache cleanup |
| 7. Exams and measurement | Not done | A results table exists | No benchmark runner, no comparison of the three approaches, no progress history. The reliability screen only shows counts |
| 8. Training export | Not done | Nothing | No training dataset export, no adapter workflow |
| 9. Integration exports | Partly | JSONL claim export and import with validation, de-duplication and round-trip tests. A separate ZIP format exists in `src/knowledge` | Two formats exist. The JSONL one covers claims only, not exam results, procedures or learning history. The Street Advisory side is unverified (see `ATLAS_LEARNING_INTERCHANGE.md`) |

## The 17 numbered requests

| # | Request | Status |
|---|---|---|
| 1 | Collapsible reports and learning-cycle sections | Done for reports. Other sections not checked one by one |
| 2 | Merge chats using the most recent | Partly: the merge screen defaults to the latest chat, but duplicates still appear and need a manual merge |
| 3 | Remove Talk as an agent | Done |
| 4 | Combine Field Identifier and Atlas, with basic built-in knowledge | Done in effect: Atlas has the photo-identification rules and built-in basics, and Field Identifier is hidden. The old agent record is kept so old chats still open |
| 5 | Atlas UI matches the app; remove things reachable elsewhere | Done for the daily briefing. Not checked screen by screen |
| 6 | Remove the Atlas button over the Agents and Pals screens | Not found in the code, so presumably done |
| 7 | Agent, project, voice and style presets per chat | Done |
| 8 | Customizable Home widgets (agent, voice, model, new or existing chat) | Done |
| 9 | Compass: directions text removed; level mode in black and white | Done |
| 10 | Each presentation theme with its own font and layout | Partly: each theme has its own fonts; layouts are shared |
| 11 | AI that makes music and songs | Partly: instrumental only (see below). No vocals and no song generation |
| 12 | Auto-remember about the user, especially in therapy chat | Done, opt-in, off by default |
| 13 | Online fun facts in the news briefing | Done |
| 14 | Names for voice model options | Done for the natural voices |
| 15 | Fast cloned voice for the agent | Built; the speed on a real phone is unmeasured |
| 16 | Suggestions for other features | Answered in chat |
| 17 | All requested permissions in Assistant permissions | Was missing Read calendar; added |

## Music

Music Studio asks the loaded text model to write a note score, then Atlas plays it with its own synthesizer. "Create instantly"
needs no model at all. A dedicated text-to-music model (for example MusicGen) would need a new on-device runtime and a large
download, and is not in the app. Adding one is a separate decision.
