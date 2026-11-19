# Atlas 0.0.206 audit

Audited: branch `claude/new-session-1zz2ct` at the 0.0.206 version commit, plus the "Compare with GenieX" card added right after it. Method: every automated gate the repository has, a line-by-line review of everything changed since the audited baseline (0.0.205, commit 466699e) by an independent reviewer pass, a dependency audit, a coverage check against the engineering handoff, and size/cleanliness measurements. Items marked "fixed in 0.0.207" are fixed in the next version; the 0.0.207 audit note records the result.

## 1. Gate results

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | clean |
| ESLint (`src`) | 0 errors, 626 warnings (all pre-existing rule categories; none are new error classes) |
| Jest (full suite, 3 workers, no `--forceExit`) | 936 suites, 9,828 tests, all passing, about 5.5 minutes |
| Android unit tests (CI, Kotlin/JVM) | green on the last pushed commit before 0.0.206 (includes the QNN library-selection tests) |
| Atlas Core Audit (CI) | green on recent pushes |
| `dependency-cruiser` | 8 violations: 3 inherited from 0.0.205 (circular imports) and **5 introduced by this work** (see F-1) |
| `knip` | 311 unused function exports, 3 unlisted dependencies (test-only and a script), 1 duplicate export. Down from 101 unused exported types removed earlier. |
| Route matrix | 71 routes, all listed |
| `npm audit --omit=dev` | 18 findings: 1 critical, 3 high (all transitive; see section 5) |

## 2. Findings

Severity: **important** = wrong behaviour a user can hit; **nit** = rule or maintainability issue.

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| F-1 | important (gate) | `atlasTools/speed.ts`, `services/llm.ts`, `components/EngineCompareCard.tsx`, `atlasVoice/voiceCompare.ts` | The per-backend speed lookup created circular imports between `speed.ts` and `llm.ts`; the compare card imports the LLM service directly (breaks the "UI must not use a concrete engine" rule); `voiceCompare.ts` is imported by nothing. These 5 dependency-cruiser violations would fail the pre-push gate. | fixed in 0.0.207 |
| F-2 | important | `learning/exams.ts` `dueRetests` | Counted the three modes of one run (model alone, with sources, with memory) as three consecutive misses, so a first miss waited 7 days; and a question that failed only in the model-alone mode never became due. | fixed in 0.0.207 |
| F-3 | important | `topics/formats.ts` | The controlling-authority warning was only put in the prompt when passages were found. The case it exists for (the controlling document is missing, so nothing is found) showed no warning. | fixed in 0.0.207 |
| F-4 | important | `standards/controlling.ts` | The kind of subject was guessed from each square's own title, so an "Income taxes" square in a FAR course was treated as tax and told not to teach from FASB documents. | fixed in 0.0.207 |
| F-5 | important | `topics/generationQueue.ts` | Stop and the time limit abandoned a job but let it keep running: its retry could start a second model call while the next lesson began, and it could still save the square the person stopped. | fixed in 0.0.207 |
| F-6 | important | `topics/TopicScreens.tsx` | The in-depth version finished in the background but the open lesson kept showing the short draft until reopened. | fixed in 0.0.207 |
| F-7 | important | `learning/exams.ts` any-order matcher | A fact containing a number could be matched by that number and its unit appearing separately ("35 years ... 21 percent" matched "35 percent"), also when used as a forbidden wording. | fixed in 0.0.207 |
| F-8 | important | `services/stepChat.ts` | "Work through steps": tools ran without the chat's project or a stop signal; a tool step was retried; an error after tools ran fell back to a normal send (which could repeat them); pressing Stop in Task Center then sent the message normally; the person's message was only saved at the end. | fixed in 0.0.207 |
| F-9 | nit | `services/rag/retrieval.ts` | The keyword fallback looked at only the first 3,000 passages of a project, so later chapters of a large unindexed book were reported as "no evidence". | fixed in 0.0.207 (pool raised to 20,000 and a cut-off search is reported as partial) |
| F-10 | nit | `ScoreEditorScreen`, `IncognitoBanner`, `BoardExtras` | Hard-coded font sizes, weights over 400 and spacing instead of the `TYPOGRAPHY`/`SPACING` tokens the project requires. | fixed in 0.0.207 |
| F-11 | nit | `services/geniexEngine.ts`, `GeniexEngine.kt` | Stopping a GenieX reply sent no "stopped" event, so a pending reply promise never settled. There is no iOS counterpart module (Atlas builds and ships for Android only; the JS service reports "not in this APK" without the module). | fixed in 0.0.207 (Kotlin stop now reports; iOS noted as accepted) |
| F-12 | nit | `services/documentService.ts` | `console.log` calls outside the logger. | fixed in 0.0.207 |

Unconfirmed and accepted (cannot be settled without a phone or a build): the GenieX Kotlin has never been compiled; R8 keep rules were written from the dependency list; the "I" / "I'm" voice change is a reasoned fix, not a reproduced one; `LISTEN_DELAY_MS` and the call state machine need a real call to tune.

## 3. Features against the handoff

Done and tested in code: exam scoring, reasons, ungraded items, scheduled retests and attempt history; retrieval fallback; Learn a Topic draft-first and bounded work with Stop; multi-book chapters, evidence allocation and the objective-to-chapter board section; controlling-authority flags; Teach AI steps 1 to 7 (cards over both stores, bounded working context, the learner loop reading it); HTTP cancellation; incognito banner; random and dice tools; the device-info patch; demo GIF removal; ZIP limits before unpacking; version code that rises per build; unknown-chip NPU gating; per-backend speed history and measured-fastest ordering; call state logging; step-by-step chat; the score editor and MIDI export; daily-briefing thin-story handling; tablet/rotation sizing for sheets and the gallery.

Present but unproven (needs a phone or CI): QNN per-generation extraction, the GenieX bridge and compare card, the R8 trial, the Gradle cache setting, the call listening rule and the opening-vowel trim change.

Not done: native runtime sizes from a real APK, build profiling and native-binary caching, reuse of the Core Audit result, Qualcomm runtime redistribution terms check, voice engine trials, the remaining 300 unused function exports.

## 4. Cleanliness

About 130,000 lines of TypeScript in 996 source files and 938 test files. 776 uses of `any`, 104 lint suppressions, 1 `@ts-ignore`, 20 direct `console` calls, 1 TODO. Five files are over 700 lines (`llm.ts`, `useChatGenerationActions.ts`, `StudyScreen.tsx`, `modelManager/download.ts`, `generationToolLoop.ts`, the last reduced from 977 this cycle). No dead code was added by this work other than `voiceCompare.ts` (F-1), which is removed in 0.0.207.

## 5. Dependencies

`npm audit` (production): critical `xmldom` through `@react-native-voice/voice` (its Expo config plugin, which runs at build time, not in the app); high `markdown-it` and `linkify-it` through the markdown renderer (a long attacker-controlled text could slow rendering: relevant, because model output and imported documents are rendered); high `image-size` (transitive). Fixes that need a major-version change of the markdown package are left for a tested upgrade; 0.0.207 pins patched sub-versions where the lockfile allows.

## 6. Other risks worth knowing

- The GenieX flag adds about 89 MB to the APK and the Qualcomm runtime libraries' redistribution terms are not stated where they could be read. Do not ship a GenieX build without checking them.
- Publishing: workflow runs on this branch are manual and artifact-only. A push to `atlas-voice` publishes a release automatically.
