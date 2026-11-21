# Atlas upgrade prompt: what is done and what is not

Checked against the code on 2026-11-12 (build 0.0.157 plus the fixes made that day). "Done" means the behavior exists and has a test.
"Partly" says what is missing. Nothing here was tried on a phone.

## Learning architecture (phases 1 to 9)

Updated for build 0.0.158. The tax code and other legal sources were left out on purpose. See `ATLAS_LEARNING_ARCHITECTURE.md`.

| Phase | Status | What exists | What is missing |
|---|---|---|---|
| 1. Inspect the code | Done | The existing engine, store and ledger were read and reused; `ATLAS_LEARNING_ARCHITECTURE.md` explains the result | |
| 2. Evidence-grounded storage | Done | Claims with evidence, history, contradictions, mastery, experience, procedures and exam results, in a database that upgrades by adding tables. Old reports are archived unchanged and never auto-verified | Semantic embeddings (nothing showed they would help) |
| 3. Better Learner | Done | Claims are checked against their passage, compared with known knowledge (new, repeat, conflict), and stored with evidence. No rewrite without new evidence. Injection text is removed from sources | Primary-source search is whatever the project, library and web search return |
| 4. Stronger Judge | Done | Six separate scores; facts and citations are independent gates; the cited passage is checked by text; score and verdict must agree | No model checks that a passage entails a claim |
| 5. Source versioning and legal knowledge | Left out on purpose | Fields for dates exist | Tax code and legal ingestion |
| 6. Better Manager | Done | Conflicts, then due reviews, then study; measured input; on-task guard; spaced review; checkpoint; bounded question list | |
| 7. Exams and measurement | Done | Exam in three modes, scored without a model, history, and an improvement claimed only when measured | Processor use is not measured |
| 8. Training export | Partly, by design | Verified-only dataset with splits, provenance, exam questions removed, and a manifest | Training itself, evaluation of an adapter and deployment |
| 9. Integration exports | Done | One portable JSONL for all record types, with validation, duplicate handling, import safety and round-trip tests | Not tested against Street Advisory's own format |

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
