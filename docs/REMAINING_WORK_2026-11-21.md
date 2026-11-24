# Remaining work from the 20 November 2026 engineering brief

Written at the end of the third pass (PR #14). It is the hand-off list: what the brief asked for that is still open, what is only partly done, and what has never been seen on a device. Item numbers are the brief's. `docs/ENGINEERING_PASS_2026-11-21.md` records what each pass changed.

## Read this first

- **Nothing here was run on a phone.** Every fix was verified with Jest, TypeScript and ESLint only. The container has no device, no emulator, no Android SDK and cannot run GitHub Actions. Every item marked "done" below still needs a device check.
- **Merging:** the user authorised merging to `main` and said they will watch the builds. Always a merge commit, never squash. Never push to `main` directly. Develop on `ccr-e8678227-hs3cud`.
- **PRs** use `.github/pull_request_template.md` and end with the attribution footer.
- The workspace contract `../.codex/ENGINEERING_CONTRACT.md` named in `AGENTS.md` does not exist in the container, so only `CLAUDE.md` and `rules.md` were followed.

## Needs a person (cannot be done in the container)

1. Run the app on a phone and check, in this order: model loading with and without the picture and MTP files (priority item), Safe Model Loading, the chat gear menu (7.4), call-mode microphone retry (1.1), briefing audio with trimmed silence (1.2), a lesson written in pieces on a slow model (1.4), a Gemma 4 QAT reply (1.6).
2. Read Gemini, Codecov and SonarCloud findings on PR #14 and earlier PRs (8.10). None has been read or answered.
3. Android build items in Part 8 need real builds to measure: ARM64-only releases, native C++ caching, compiler caching, Gradle configuration caching, fast dev builds, APK size, build timing diagnostics.
4. Pull the device log (see `CLAUDE.md`, "Device Logs") for the intro-tune problem (1.2): the briefing trace logs the queue, and it has not been read from a real run.

## Fourth pass (version 0.0.234, after PR #14)

Done, with tests, not run on a device:

- 2.10 Judge: a cited passage that says the opposite of the sentence citing it (negation, opposite word, other unit) fails the citation gate at every strictness, whatever the Judge said (`contradictedBy` in `claimText.ts`).
- 6.4 Error recovery: `logIgnored(what)` (`src/utils/logIgnored.ts`) replaces silent `.catch(() => {})` where a failure changes what is kept or shown (classifier provisioning, KV-cache clearing, stop paths, erasing a protected project's index). A failed `_ready` marker write now fails an image-model download instead of letting the next start delete the folder. About 330 other `.catch(() => {})` sites are best-effort cleanup (unlinking temp files) and were left.
- 1.1 A call whose speech engine never answers drops that turn after 45 s and listens again.
- 1.10 The screen stays on for the whole hands-free call (`holdScreenOnly('voice-call')`).
- 1.11 `DeviceMemoryModule.getLastExitReasons(max)` on Android (ApplicationExitInfo, Android 11+) and iOS (declared, answers `supported: false`), one contract, checked by `deviceMemoryExit.contract.test.ts`. A load cut short because the person closed the app is no longer recorded as a model crash; a real crash records what the system said. The previous exit is written to the app log (kept in every build) at each launch. The app log (`appLog.ts`) was already readable from a Release build ("Share all logs" in About).
- 1.5 Every background AI call logs how much of its prompt the engine reused from its cache (`[AI] background call ... (N reused from the cache, M read)`). The lesson prompts already share their opening, so reuse should happen; the log is how to confirm it on a phone.
- 1.12 The Jest leak: `copyDiagnostics.rendered.test.tsx` mounted the About screen, whose update check made a real HTTPS request to GitHub. The network is now answered at the boundary in that test. `--detectOpenHandles` found nothing in `workflows`, `stores`, `skills`; `screens` was still running when this was written.
- 3.3 / 3.4 Keyword search reads a full-text index of the whole project (SQLite FTS5, switched on in `package.json` under `op-sqlite`, with triggers that keep it in step and a fill for passages stored before it existed). It falls back to reading passages when a build has no FTS5. Meaning-based results now also include passages only the question's own words find (section numbers, names). Protected projects are not indexed this way.
- Part 5 Search: stored embeddings are kept as 32-bit floats (half the memory) and each vector's length is computed once.

- 4.1 / 4.9 The automatic accelerator is corrected by what each model measured on this phone (`accelRecord.ts`: load time, time to read a prompt per 1000 tokens, repeated plain-setup failures); only a backend Atlas chose is ever adjusted, never one you picked.
- 4.6 Speculative decoding is measured from real replies (`specBenefit.ts`), shown on the model card, and left off for a model it slows by 8% or more, with a note in the load report; retried after two weeks or when MTP is switched on by hand. It does not track accepted and rejected tokens or memory overhead (llama.rn does not report them to JS here).
- 4.7 Prompt reuse is logged per call (see 1.5); no code change to the cache itself.
- 9.1 Quick, Balanced and Deep (chat settings), made only of existing thinking and reply-length settings and read back from them.
- 8.3 / 8.4 / 8.7 / 8.8 (config only, never run): ccache for native code keyed on NDK and architecture, a build report (compiler-cache use, APK size by kind and the 25 largest files) in the run summary, Gradle configuration cache in warn mode. Nothing was built or measured, so no time or size saving is claimed.
- Version 0.0.234 with release notes. The audit found and fixed: two dependency cycles (one from this work's own earlier split), a privacy leak (words of an erased project staying readable in the full-text index), a wrong-model bug (the active model id is still the previous model during a load), `EXIT_SELF` wrongly treated as a harmless exit, and four issues from the code review (filtered keyword search, accelerator failures blamed wrongly, first-word times across prompt sizes, the contradiction check at the lenient setting). Three nits were left: keyword rarity weights over the prefiltered pool, load time including the mutex wait, and the synchronous index merge on erase.
- Not backed up on purpose: `atlas-accel-record`, `atlas-spec-benefit` (they describe this phone).
- Full suite: 1,019 suites, 10,577 tests, one failing test fixed after (the backup-coverage guard); the "worker failed to exit" warning still appears, so one more leak remains somewhere in the suite.

Looked at and left alone, with the reason:

- 3.2 ZIP imports already exist (`packImport.ts`: unpack, manifest check, nested zips, duplicates skipped, PDFs and Office files read).
- 3.5 Backups already exist and are transactional (validate, snapshot, restore, roll back on failure, a "check this backup" action). The one limit worth changing is the 35 MB cap on an encrypted backup, which needs a multi-part format and is not safe to write without a device.
- 1.2 Intro tune: the player code (`nativeEpisodeQueue`, `AtlasAudioService`) was read end to end and no defect found. The in-app "What just happened" trace shows whether the tune was queued and reached. The cause needs that trace from a phone.
- 1.3 / 1.6 Causes of the composer fallback and of Gemma 4 placeholder output need a real trace; the diagnostics for both are in place.

Not done: 4.2 (full-response ranking across short, medium and long prompts), 4.3 to 4.5, 4.8, 4.10 (per-stage diagnostics), 5.1 (native batching, resumable indexing), 5.3 to 5.6, 3.4 large-library reprocessing, 3.5 backup size cap and multi-part format, 7.1 to 7.3 and 7.5 (needs a phone: 282 heavy text weights are only held from growing by `designWeightRatchet.test.ts`), 8.1 every-20th-version multi-architecture builds, 8.2 native engine artifact reuse, 8.5 fast development builds, 8.6, 8.7 size reduction (measurement added, no reduction made), 8.10 (the review bots have not been read), 9.2, 9.4 to 9.7.

## Eighth pass (version 0.0.238, a deep audit)

Looked at: lint warnings by rule (459, mostly style; the 26 hook-dependency warnings are deliberate narrow lists except one real stale callback, fixed), promises with no catch (39 candidates, one real, fixed), duplicate blocks (41 across files; the chat date formatter was copied four times, now one), stubs and TODOs (none that hide an unfinished feature), unused code (knip clean), dependency cycles (none), persisted-state parsing (three unguarded reads, all in import paths).

Fixed: the call's stalled-speech recovery used a stale callback; Teach the AI knowledge room raised to 45 percent of the context; chat dates count calendar days; the thread-count read can no longer leave an unhandled rejection; duplicate branches and a component re-created on every draw; the model list names the CPU and thread count a model was tuned to.

Not changed on purpose: the narrow hook-dependency lists in the chat model sync (they key on capabilities), the 361 nested-template-literal style warnings, the audio code's bitwise operations (needed), `ProjectChatsScreen` and `ProjectDetailScreen` still share a chat-row block (needs a shared row component with both screens' styles).

## Seventh pass (version 0.0.237, a polish pass)

- Audit by reading (the review tool was at its usage limit): a stopped background job waits up to 15 minutes for the chat reply that stopped it; the reply's cache label uses the model's own backend; a multi-architecture build is never the latest release by a push; overlap trimming sees through the section path; titles need two words and a longer paragraph after them; the slow-reply hint reads the model's own backend and threads.
- Builds: run #244 and #245 of "Build Atlas APK" on the branch completed green (about 80 and 35 minutes). Not published.

Open: the cause of the missing briefing intro tune (1.2), the 35 MB cap on an encrypted backup (3.5), tablet layouts and the visual audit (7), APK size reduction (8.7), 4.5, 4.7, 9.5.

## Sixth pass (version 0.0.236)

- Teach the AI knowledge budget: 30 percent of the context, ceiling 12000 tokens (was 12 to 20 percent, ceiling 1800).
- 4.3 A model's speed-test backend and threads are its own (`ModelMemory.nThreads`, `inferenceBackend`); the global settings are not written.
- 5.2 Semantic search keeps a bounded shortlist (`topByScore`) instead of sorting every passage.
- 5.3 Heading-sticky chunks, sentence-end windows, shared overlap sent once.
- 8.1 `scripts/release/choose-architectures.cjs` and the workflow inputs `all_architectures` and `architecture_every`.
- 8.6 Already in place: the APK workflow reuses a green Core Audit run for the same commit.
- 8.7 A size ceiling test on bundled assets and native libraries; no reduction made (the full build keeps every NPU generation; the per-chip lean build exists).
- 9.7 Already organised: basic and advanced controls in the generation settings.

Still not done: 3.5 (35 MB encrypted-backup cap, needs a multi-part format and a native change), 4.5, 4.7 beyond logging, 7.1 to 7.3 and 7.5, 8.2, 8.7 reduction, 9.5, and the causes in 1.2, 1.3, 1.6.

## Fifth pass (version 0.0.235)

Done, with tests, not run on a device:

- 4.2 The speed test ranks by the time to finish a typical reply (first word plus 150 tokens of writing). Only the short prompt feeds this; there is no medium-prompt run.
- 4.4 Only one speed test at a time; a cancelled or failed one reloads the model that was active.
- 4.8 A load that shrank the context or gave up the accelerator says so in the load report.
- 4.10 The support report has a "Where the time went" section: loading, prompt, first word, writing, retrieval, tools. Speech is not in it.
- 5.1 / 9.6 Indexing embeds and saves 32 passages at a time and resumes where it stopped (`resumeIndexing`, called when a library is opened, never while a chat reply is being written). Not done: native batching (llama.rn embeds one text per call).
- 5.4 Chat search is debounced and keeps each chat's lowered text.
- 5.5 Already in place (memoized message rows; only the streaming item re-renders).
- 5.6 A chat reply stops a writing background job and goes first; the job asks again afterwards (up to 3 times). Before, the chat failed with "Generation already in progress".
- 9.2 One plain sentence under a slow reply (why, and what is faster).
- 9.4 Four separate parts of progress on the Learning screen, no blended accuracy.
- A unit bug found on the way: time to first word is in seconds, and two places divided it by 1000.
- Audit of this pass (code review plus the gates) found and fixed: indexing and finishing an interrupted library could embed at once, or the same passages; a background job that kept being stopped returned a cut-off answer as if whole (it now fails with a message); the first-word stage recorded zeros; clearing the chat search waited for the debounce; the delay note read overall speed as writing speed; the chat-search cache did not notice a list edited in place; the progress card did not refresh when an exam ended. Not fixed: the progress card does not refresh when a conflict is settled on another screen until the next report or round.

Still not done: 3.4 and 3.5 (size cap), 4.3 per-model independence review, 4.5 residency, 4.7 beyond logging, 5.2 vector index, 5.3 chunking experiments, 7.1 to 7.3 and 7.5, 8.1 multi-architecture schedule, 8.2, 8.5, 8.6, 8.7 reduction, 8.10 bot reviews, 9.5, 9.7, and the causes in 1.2, 1.3, 1.6.

## Part 1

| Item | State | What is left |
|---|---|---|
| Priority: safe model loading, breadcrumbs, crash ledger, step-down, attachments, embedded MTP switch, real runtime state | Done in JS (passes 1 and 2) | Device check. No native Android exit-info module was written (see 1.11). |
| 1.1 Call-mode microphone | Partly | The microphone start is retried after 10, 20, 30 s. Not done: a stalled transcription or recognizer is not cancelled and restarted. |
| 1.2 Briefing audio | Partly | Voice serialization and silence trimming done. Not done: root cause of "the intro tune does not play". Hypothesis: `intro: playing === null` at `src/screens/StudyScreen.tsx:315`. The 3 s story pause is a product constant (`STORY_PAUSE_SECONDS`), not a bug. |
| 1.3 AI composer | Partly | Trace and fallback reason added. Not done: fixing why the composer falls back, which needs a real failing run's trace. |
| 1.4 Lesson order, generation in pieces | Done | Device check. |
| 1.5 Lesson speed | Partly | Plan follows measured speed. Not done: prefix and KV reuse of the shared prompt context between pieces. |
| 1.6 Gemma 4 QAT placeholder output | Partly | Noise is stopped early, reported, never kept. Not done: finding why the model emits placeholders (template, quantisation or sampler). |
| 1.7 Background-model lifecycle | Done | Device check. |
| 1.8, 1.9 Embedded MTP, speed test | Done | Device check. |
| 1.10 Thermal, emoji, lesson perf line, screen wake | Partly | Heat guard, emoji before speech, lesson read/write line done. Not done: screen-wake behaviour. |
| 1.11 Crash diagnostics | Partly | JS breadcrumbs only. Not done: Android `ApplicationExitInfo` reader on next launch, and logs readable from a Release build (the dev file sink is `__DEV__` only). |
| 1.12 Jest leaks | Partly | Fixed: `App.tsx` import-time monitors, exercises debounce timer, voice restore timer. One "worker process failed to exit gracefully" warning remains. Not found. It is not in `unit`, `rntl`, `hardening`, `contracts` or `specs`. `--detectOpenHandles` found nothing in `integration/` subfolders `home`, `chat`, `atlas`, `onboarding`, `memory`, `happy`, `generation`. Still to check: `integration/screens`, `settings`, `skills`, `stores`, `workflows`, and the root-level files in `integration/`. Run per folder, it is slow in band. |
| 1.13 Fun facts, Assistant settings coverage | Done | Device check. |
| 1.14 Reminders cleanup | Not done by choice | Old one-shot build reminders have fired and disabled themselves. Deleting a scheduled task deletes the sessions it started, so they were left. |

## Part 2 (learning and exam correctness)

| Item | State | What is left |
|---|---|---|
| 2.1 to 2.7 | Done (pass 1) | |
| 2.8 Keep what it learned | Done (pass 3) | Device check of the review sheet. |
| 2.9 Remediation of a missed answer | Done (pass 3) | |
| 2.10 Judge improvements | Not done | Add deterministic checks the Judge cannot override, before the model's verdict is trusted (`src/learning/engine.ts`, around the judge ruling and the report verdict at the lines that call `rulings(...)`). |
| 2.11 Source authority | Done (pass 2) | |

## Part 3 (indexing, imports, backups)

| Item | State | What is left |
|---|---|---|
| 3.1 Duplicate detection | Done (pass 2) | |
| 3.2 ZIP imports | Not done | |
| 3.3 FTS5 full-text index | Not done | |
| 3.4 Semantic retrieval | Not done | |
| 3.5 Backups | Not done | |

## Part 4 (local model performance)

Only what the speed test now does (robust statistics, re-timing close results, accelerator warm-up, prompt-cache-safe re-reads) is finished. Not done: 4.1 to 4.10, including per-model acceleration choice from measured load time, first-token delay and stability; speculative-decoding benefit tracking; model residency; KV-cache reuse.

## Part 5 (app speed)

Not done: embeddings and search speed, chat rendering cost, background-work priorities.

## Part 6 (functional repairs)

| Item | State | What is left |
|---|---|---|
| 6.1 Preview reporting | Done | |
| 6.2 Reminder and notification reporting | Done | Device check that notifications really appear. |
| 6.3 Remote cancellation | Done | |
| 6.4 Error recovery | Not done | Swallowed errors (empty `catch`, fire-and-forget promises) in the stores and services have not been audited. |

## Part 7 (UI)

| Item | State | What is left |
|---|---|---|
| 7.4 Chat gear menu | Done from code reading | Needs a phone. The cause is a diagnosis, not a reproduction. |
| Other Part 7 items | Not done | Tablet layouts, navigation, the full visual audit against `docs/design/`. |

## Part 8 (build, CI, APK)

| Item | State | What is left |
|---|---|---|
| 8.9 CI concurrency | Done | Not run on GitHub. |
| Everything else in Part 8 | Not done | ARM64-only, C++ and compiler caching, Gradle configuration cache, fast dev builds, APK size, timing diagnostics. Needs real builds. |
| 8.10 Review loop | Not done | See "Needs a person". |

## Part 9 (quality of life)

| Item | State | What is left |
|---|---|---|
| 9.3 | Done with 2.9 | |
| Quick, Balanced, Deep modes, settings simplification, the rest of Part 9 | Not done | |

## Housekeeping

- `knip.json` exists, so unused exports may be flagged in CI. Check the PR's CI output.
- The lint run reports 0 errors and about 86 warnings (mostly `sonarjs/no-nested-template-literals`) on the changed files.
- A test written in this pass for the lesson split, `__tests__/integration/lessonInPieces.test.ts`, was changed from "two sections a call" to "three sections in one piece" because the plan now follows measured speed.
- Jest quirks worth knowing: `jest.mock` factory variables must start with `mock`; fake timers and `setImmediate` do not mix; React batches updates inside one long `act`; a function named `useX` trips the hooks lint rule; ESLint limits are max-params 3, max-lines 500 (`engine.ts` exempt), complexity 20.

## Ninth pass (0.0.239)

- 1.2 Intro tune: cause found from a phone log. The first press of Play (lines not all rendered, so the JS player is used) decoded each file by plain path; the Android release build of react-native-audio-api reads a path with no `file://` as a bundled asset and throws "Failed to resolve asset for android release build". Every tune and line failed, so the show fell back to live speech with long gaps. Resuming from a card used the native queue, which has no such problem, which is why the tune appeared only after that. Fixed in `decode()` in `src/atlasVoice/podcastAudio.ts`.
- Briefing wording: no clock time in the greeting, outlet named at most once per story and for about half of them, "The report details how..." lead-ins removed, deepening skipped for headline-only stories, fun facts taken from deeper search results and told as obscure details.
- Learn a topic: lesson prompt asks for bold terms, lists and small tables; section headings, examples, mistakes and key points styled.

## Tenth pass (0.0.241)

- 8.1 changed: a published release now builds every CPU type as its own APK (see `docs/native-runtime-inventory.md`); `choose-architectures.cjs` and the `architecture_every` input are gone. The new workflow has not been run on CI yet at the time of writing this line: the first run is a `test_abis` build of the three reduced CPU types.
- Features missing on a reduced build are labelled in the app (`buildCapabilities.ts`).

## Eleventh pass (0.0.242)

- 3.5 The 35 MB cap on a password backup is gone: slices (`src/atlasTools/backupParts.ts`), 120 MB written, 170 MB read, single-piece format kept for small backups. Native code unchanged. Not run on a phone: the peak memory of a 120 MB backup (the JSON text, its slices and the written file) is the thing to watch on a low-memory device, and the limit can be lowered in one place (`EXPORT_LIMIT_MB` in `backup.ts`).
- 7.2 Translator: centred column on wide screens, translation beside the text on a tablet. The other screens that already use `useWideLayout` / `useLayoutClass` were not changed; the full tablet and visual audit (7.1, 7.3, 7.5) still needs a tablet or emulator to look at.
- **4.5 and 4.6 are off the to-do list** (the owner's decision). 4.6 was already done. One observation kept for the record only: `estimateModelRam` counts the vision file in a model's residency size even when it is attached on demand.
- 9.5 Helpers: a `calc:` step (`src/workflows/calc.ts`, wired in `customHelpers.ts`): exact arithmetic by code with no `eval`, names checked when the helper is saved, results handed to the AI steps and kept in the review and the note. Question generators and formatting are `ai:` steps that already existed, so they were not duplicated.
- 7.3 Settings: My models next to Models, Background images next to Appearance, Task center no longer shares the Self-check icon. Professional Exam Prep was not touched.
- 7.1 Left alone: 274 heavy font weights and about 480 hard-coded font sizes remain, held by `designWeightRatchet.test.ts`; Atlas's own `TYPOGRAPHY` uses 600 and 700 for headings, so changing them is a design decision to make with a phone in hand.
- 8.7 APK size, measured on the published arm64 APK (246 MB; the three other builds are 91 to 115 MB): native libraries 136 MB (image engines 69 MB, the Vulkan engine 13 MB, seven CPU variants of the llama.rn engine 33 MB, ONNX runtime 7 MB, LiteRT 6 MB), assets 83 MB (the bundled MiniLM embedding model 24 MB, JS bundle 10 MB, NPU libraries for six chip generations about 40 MB), code 11 MB. Every large piece is a feature: nothing is dead weight, so reducing size means removing a feature or building per NPU generation (the lean build already does). That is a product decision, not a clean-up.
- 4.7 Prompt reuse: the engine already reuses a shared prefix and each background call logs how much was reused (1.5); there is nothing further to change without a phone's trace.
- 1.2, 1.3, 1.6 and 7.5 need a device (a log, a trace, a look at the screens), as before.
- AI radio (`src/radio/`, `docs/AI_RADIO.md`): built and tested with fakes; not run on a phone. Open: how fast the chosen model writes on the phone, whether the station keeps going with the screen off, how the voice sounds over the music, and a Backup entry for its settings (they are listed as not backed up). Tiny models: LFM2-350M recommended, Supra2.5 65M the fast option; Aurora2 and Quark cannot be loaded.
- Music Studio: Make my own moved into the Made by drop-down. Helpers: examples and calc: steps.
- Currency (`src/currency/`), Journal (`src/journal/`), Trip kit (`src/trip/`), Search by meaning (`src/search/askWhere.ts`), radio extras: built and tested with fakes; none run on a phone. Journal and trips are in backups (`atlas-journal`, `atlas-trips`); currency rates and radio settings are not.
- Search by meaning: the right screen was first for 14 of 16 test requests with the app's MiniLM embedding model (a 350M chat model under a grammar got 7). It embeds the 38 screen descriptions on first use (the test used the 36 that existed then) (a second or two on a phone, not measured) and keeps them while the app runs. Open: screens the index does not list cannot be found (only 38 of the app's routes are in it).
- Journal text is kept like the other stores (not encrypted on the phone); the weekly look back is written by the phone's own engine only.
- Multi-step: `src/workflows/stepPrompt.ts` (budgeted step prompts), `planner.ts` (Plan it for me), `autoSteps.ts` and the `work_in_steps` chat tool (on by default through a one-time migration, `stepsToolAdded`). Open: whether the chat model calls the tool when it should (only tested with the tool offered by hand), running Skills (SKILL.md) in steps, and showing the steps as they run in the chat.
- Long texts (`src/workflows/longText.ts`): read in parts of about 55% of the step budget, notes checked by code (names and numbers must be in the part), notes read again when still too long, 30 parts at most (then it says to use the Knowledge base). Tried on a computer with a three-part meeting: LFM2-350M kept the decision but invented names (now dropped); SmolLM2-360M answered Nothing here for every part (now the telling sentences are kept); Supra 65M wrote nonsense. Sentence ranking by the embedding model and picking sentence numbers with a grammar were both tried and were no better (the models just counted from 1). Open: a step that reads the original text again for exact quotes (today steps work from the notes), and a long job's progress shown in the chat.
- Skills with reference files (`importSkill.ts`, `selectSkills.ts` `relevantReferences`): not tried with a real zip on a phone (the zip reading uses the same unzip as before, and the file walk is covered only by the fake file system). Skills run in steps (`src/skills/skillSteps.ts`): the Skills screen button and the tool's `skill` argument are tested; whether a small chat model follows the pointer in a long skill's note and calls the tool is not. Not wanted: installing from a web address. Not possible: anything a skill's scripts would do (a phone cannot run them).
- Auto steps (`src/workflows/bigRequest.ts`, `answerInSteps.ts`, hooked in `startGenerationFn`) and Ask a document (`src/docqa/`): tested with fakes (the llama fake for the final answer, askShaped and the embedding model as stand-ins); not run on a phone. The trigger is a guess (three task words, or over a third of the context): too eager costs time on a model that did not need it, too shy leaves the old behaviour. Duplicate to tidy: `src/services/readInParts.ts` (reads a very long chat message in parts, kept for when auto steps is off or does not apply) and `src/workflows/longText.ts` do the same job in two ways; the second checks its notes with code and should replace the first once tried on a phone. Ask a document only knows what the file reader returns as text (a scanned PDF has none).

