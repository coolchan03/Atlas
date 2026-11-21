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

## Fourth pass (in progress, branch `ccr-e8678227-hs3cud` after PR #14)

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

Looked at and left alone, with the reason:

- 3.2 ZIP imports already exist (`packImport.ts`: unpack, manifest check, nested zips, duplicates skipped, PDFs and Office files read).
- 3.5 Backups already exist and are transactional (validate, snapshot, restore, roll back on failure, a "check this backup" action). The one limit worth changing is the 35 MB cap on an encrypted backup, which needs a multi-part format and is not safe to write without a device.
- 1.2 Intro tune: the player code (`nativeEpisodeQueue`, `AtlasAudioService`) was read end to end and no defect found. The in-app "What just happened" trace shows whether the tune was queued and reached. The cause needs that trace from a phone.
- 1.3 / 1.6 Causes of the composer fallback and of Gemma 4 placeholder output need a real trace; the diagnostics for both are in place.

Not done yet: Part 4 (4.1 to 4.10), Part 5 chat rendering and background priorities, Part 7 beyond 7.4, Part 8 (needs builds), Part 9, the version bump and the final code audit.

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
