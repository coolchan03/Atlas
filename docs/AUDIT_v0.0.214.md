# Atlas 0.0.214 audit (changes since 0.0.213)

Reviewer: me, from the full diff and the gates; not an independent pass. No phone run.

| Change | What was checked | Remaining risk |
|---|---|---|
| Heat guard (`thermalState.ts`, `thermal.ts`, `getThermalStatus` in `AtlasDeviceModule.kt`) | Hysteresis (hot at SEVERE, cool at LIGHT), battery-temperature fallback, and that a hot phone caps answer length through the existing low-power path, tested with the real stores. The Kotlin call is guarded by SDK level and returns -1 on failure. | The Kotlin method is compiled only in CI. Answer length is the only thing it changes: it does not lower threads or pause background work. |
| Speed test (`deviceTuner.ts`, `speed.ts`, `llm.ts`, `SlowReplyHint.tsx`) | Option list order, one-time offer rules (never over the slow-reply tip), winner kept per model with the setting back on Automatic. Chosen so a global explicit NPU setting cannot make other models fail to load. | The test loads the model once per option (about 6 to 8 loads); the progress screen already shows steps. An NPU load that fails is recorded as an error and skipped. |
| Composer (`critic.ts`, `composerAgent.ts`) | Critic measurements tested on a passing tune and on three kinds of weak tune; finishing keeps the part's range; the rewrite is only kept when it scores higher. | Costs one more model call for tunes scoring under 75 (worst case three calls with a parse failure first). The thresholds are judgement, not tuned on real output. |
| One-project backup (`projectExport.ts`, `BackupScreen.tsx`, `backup.ts` split) | Only the chosen project and its readable chats; PIN-protected projects and private/locked chats never exported; file validated (format, id shape, chat ownership, documents) before anything is touched; documents restored first (own transaction) then the stores merged with the sync merge functions. | The password encryption is the existing native call. The merge, not replace, behaviour for a project that already exists follows `mergeProjects` (newer wins, conflicts kept). Not tried with real documents on a phone. |
| `backup.ts` | `pickBackupText` split out of `readPortableBackup`; same checks, same messages. | None known. |

Gates: TypeScript clean, ESLint 0 errors, knip clean, dependency-cruiser 0 violations, `npm audit` 0, full Jest result in the version commit.
