# Atlas next version: draft plan

Draft, 2026-11-12. Covers FF-10 to FF-19 in `FUTURE_RELEASES_APPROVED.md`. Nothing here is built unless it says so. The user is still adding ideas, so this is a working plan and the order can change.

Sizes: S is under a day, M is a few days, L is a week or more. "Phone test" means it cannot be called done until it has been tried on a real phone.

## Suggested order

1. Quick fixes and cleanups: FF-13, FF-14, FF-10 (storage list), FF-16.
2. Maps and compass: FF-11, FF-12.
3. The workflow engine (FF-17) with its first workflow, accountant mode.
4. More workflows on the engine (FF-18), then everyday helpers (FF-19).
5. Music (FF-15) last, because it needs a new on-device runtime.

Reason: items 1 and 2 are mostly self-contained. Item 3 is the largest piece of new design, and everything in 4 reuses it, so it should be built once and carefully.

## FF-10 Store and manage what the app keeps

**Storage list (M).** Settings already has `StorageSettingsScreen` (models, stale downloads) and `DownloadManagerScreen`. Extend, do not add a third screen. Add one list, grouped, with size and a Delete button per row:
- Text and image models, voices (natural voices, cloned samples), offline maps, offline library packs, recordings, exports (Atlas exports folder), learning ledger, chat attachments.
- Each group is provided by the service that owns the files, through one interface (`name`, `items()`, `delete(id)`), so the screen never knows about folders. This follows the project's "service layer, no concrete types in the UI" rule.
- Deleting something another feature uses (a voice a profile points at, a map that is open) asks first and names what stops working, as the cloned-voice delete now does.

**Recordings stored in the app, transferable (M).** Recorder files already live in app storage. Missing is a way out and in: Share/Export a recording (audio plus transcript) and Import. Reuse the existing portable-file code paths (backup/export) instead of a new format.

**Voice-cloning model without download-then-upload (S to M).** Today step 1 sends the person to a browser, then asks them to import the archive. Replace with an in-app download button that uses the existing neural voice downloader (`downloadVoice`), with progress and cancel. Risk: the sherpa-onnx release URL is a large GitHub asset, so it needs resume and a size check. Phone test: yes.

## FF-11 Maps

Today maps are Mapsforge `.map` files fetched from a download list, by state or country. Mapsforge has no "less detailed" version of the same region, so the real levers are:
- **Smaller regions:** offer city or county-sized extracts where the source has them, and show size before downloading.
- **Show sizes and free space** on every row, and warn when a download will not fit.
- **Update:** compare the remote file's date or size with the installed one, show "Update available", and replace only after the new file finishes downloading (never delete first).
- **Open question for the user:** is a lower-detail map worth switching or adding a second map source? That is a larger change (different file format and renderer), so this draft assumes no.

Size: M. Phone test: yes (download, update, delete, offline use).

## FF-12 Compass

Goal: look and feel like the old iOS Compass. Needs the design docs read first (`docs/design/VISUAL_HIERARCHY_STANDARD.md`) since this is UI work, and the screen must use theme tokens.
- Black background, a rotating white ring with tick marks and cardinal letters, a fixed red needle or marker at the top, a large degree readout with the cardinal direction ("42° NE"), coordinates and elevation underneath.
- Tap to lock a bearing, with the red band showing the drift from the locked heading.
- The existing `compassMath.ts` and `useCompassSensors.ts` stay. Only `CompassScreen` and the view components change.
- The existing rendered test for compass level should be extended to cover the new layout.

Size: M. Phone test: yes. Needs the user's reference screenshots or a description of anything they want beyond the iOS look.

## FF-13 Read aloud glitch (first word repeats after speech ends)

Not diagnosed. Plan:
1. Reproduce on the debug build and pull `offgrid-debug.log` (see `CLAUDE.md`). Note which voice (phone, Piper, Kokoro, cloned) and whether it happens on Read aloud only or in chat too.
2. Suspects in `NeuralTts.kt` `play()`: the 0.5 s silence tail written non-blocking, then `stop()`. Try `pause()` then `flush()` before `stop()` so no unplayed buffer remains.
3. Add the same check to the TTS state-machine trace so a repeat shows in the log.

Size: S once reproduced. The Kotlin change cannot be tested locally.

## FF-14 Teach the AI as projects

Done so far: Reports, Lessons and Activity fold, and the task and knowledge base sit behind Change setup once teaching has started. Remaining:
- Make each subject (expert) a project card in a list, opening its own page (setup, run, reports, lessons, exams), like the existing Projects screens. Reuse `ProjectsScreen` and `ProjectDetailScreen` patterns and components.
- The Teach screen becomes the list plus a Start button on each card.
- Move expert switching out of the in-screen chips, since it is the other way to change a subject by accident.

Size: M to L (it moves a 500-line screen). The existing learning rendered tests cover the logic and will need to follow the new navigation.

## FF-15 Music

Music Studio asks the language model to write note scores, which is why the results are simple tunes. Real text-to-music models (MusicGen, Stable Audio and similar) generate audio, not only singing, but:
- They need an on-device inference runtime Atlas does not have, and are large (hundreds of MB to GB) and slow on phones.
- First step: a feasibility test of one small model through ONNX or sherpa-style runtime already in the app. If generation takes more than a few times real time, it is not worth shipping.

Size: L. Decision needed from the user before any work.

## FF-16 More voice cloning

- **Several samples per voice (M):** the native module takes one reference. Needs a merge or "best of" step and a change to the saved profile data (migration).
- **Per-voice speed or emotion (S):** speed already exists globally (steps); add a per-profile rate. Emotion is not supported by Pocket TTS, so this is rate only unless another engine is added.
- **Quality check before creating (S):** the analyzer exists; show its rating on the Create step and warn on "needs recording".

## FF-17 Multi-step workflow engine, and accountant mode

**Engine (L).** One small service owns a workflow run. A workflow is a list of steps; each step is one of:
- `model` (ask the AI, with a schema for the answer),
- `code` (plain deterministic function),
- `ask` (stop and ask the person, then continue),
- `confirm` (show the result and wait for approval).

State is saved after every step so a run survives the app being closed. The screen only displays the run and sends the person's answers. It holds no logic. This matches the project rule that state lives in the service, not the view.

**Accountant mode (L), step by step:**
1. **Read:** PDF or photo to text with the existing document reader and OCR, to a table with date, description and amount. Rows that cannot be read are listed, never dropped.
2. **Categorize:** the model proposes a category per row (expense, income, equity, transfer; vendor or customer). Rules the person confirms are saved and used first next time.
3. **Ask:** low-confidence rows are shown in a list for the person to settle.
4. **Write:** CSV first. GnuCash and QuickBooks formats are separate later items, each with its own import test against a sample file.
5. **Reconcile (code, not AI):** opening balance plus the sum of all amounts must equal the closing balance, every extracted row must appear exactly once in the output, and duplicate or missing days are flagged. A failing check blocks "done" and shows the gap.

Risks: language models misread tables, so the reconcile step is the safety net. Bank statements vary a lot, so expect a set of sample statements from the user for testing. Everything stays on the phone.

## FF-18 Workflows on the engine, in this order

1. **Meeting recording to follow-ups (M):** recording and transcript exist; add summary, action items and calendar entries (the calendar write permission already exists), each shown for approval.
2. **Bills and warranties (M):** photo or file to vendor, amount, due or expiry date, then a planner reminder.
3. **Document reader (M):** contracts and leases to key dates, fees, renewal and cancellation terms. Framed as a summary, not legal advice.
4. Later: form filler, medical paperwork explainer, voice memo to structured note, language role-play, photo text read aloud, photo identifier (firm disclaimer), trip planner, guided emergency helper, offline translator, journal and memory search, home inventory, flashcards from documents.

## FF-19 Everyday helpers

Each is a workflow or a prompt template on the engine, not new infrastructure: explain this to me (photo of letter, label or error), repair helper, cooking and pantry, writing coach, explain-how-it-works (code, config, formula, data format, appliance photo). Not planned: budget watcher, kids' tutor, real reverse engineering of binaries.

## Cross-cutting rules for all of this

- One rendered test per feature, fakes only at the device boundary (`CLAUDE.md` testing rules).
- UI uses theme tokens, no emojis, Feather icons, weight 400 or lighter, one component for the same kind of thing.
- Native changes keep Swift and Kotlin contracts aligned, and a TypeScript interface per capability.
- Anything involving money, health or contracts shows its work and asks before acting.
- No feature is checked off in `FUTURE_RELEASES_APPROVED.md` until tried on a phone.

## Questions for the user

1. Compass: any screenshots or specifics beyond "like the old iOS compass"?
2. Maps: is a smaller region enough for "less detailed", or do you want a different map source?
3. Music: should I run the feasibility test on one real text-to-music model, or leave it for now?
4. Accountant mode: can you share two or three anonymized sample statements (PDF or photo) from the banks you use?
