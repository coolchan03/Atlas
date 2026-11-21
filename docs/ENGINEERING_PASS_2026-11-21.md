# Engineering pass, 21 November 2026: what changed, what did not

Base: `claude/new-session-1zz2ct` at `10ec2552` (0.0.233). This pass was done in a cloud container with no phone, no Android SDK and no way to run GitHub Actions. Everything below was verified with Jest, TypeScript and ESLint only. Nothing was run on a device. A change marked "needs a phone" is a fix made from reading the code and pinning the behaviour in tests; it has not been seen working.

The brief lists about 90 items. This pass finished the model-loading priority, attachment management and a set of self-contained correctness fixes. The rest is listed under "Not done" so the next session starts from an honest list.

## Done

### Model loading never takes the app down, and never repeats a crash (priority)

- `src/services/loadGuard.ts` writes a breadcrumb **before** each dangerous native step (file check, model start, MTP draft start, picture-file start, first-reply test, Vulkan start) and waits until it is saved. If the next launch finds a breadcrumb, the process died in that step. That exact setup (model, accelerator, MTP, pictures) is recorded as a crash and the next load steps down: first without MTP and pictures, then on the CPU. An accelerator the person chose explicitly is never swapped silently: the load stops with a plain explanation. A file that crashes even on the bare CPU is not retried automatically. A crash is forgotten after 14 days or from Settings.
- Failures JS can see now record the failing stage and llama.cpp's own last lines, not only "Failed to load model".
- Safe Model Loading (Settings, advanced): CPU only, no picture file, no MTP. Nothing is deleted. Also shows a plain-language summary of the last load, with "Forget crash history".
- Fixed in `llm.ts`:
  - A context that was built and then failed a later step (first-reply test, picture-file start, publishing) is now always released. Before, only one branch released it.
  - A load that timed out (the loader stops waiting after a set time) used to keep running and then publish a context nobody tracked. It now releases what it built and never becomes the live model.
  - A failed attempt to raise the context size used to fail the whole load. It now restores the size that worked.
  - `doUnloadModel` forgot the context only if the memory-reclaim wait did not throw. It now always forgets a released context.
  - A deliberately skipped picture file no longer makes the loader clear the model's picture-file link.
- Tests: `loadGuard.test.ts`, `llmLoadSafety.test.ts` (21), rendered `SafeModelLoadingToggle.test.tsx`. Two of them were checked against deliberately broken code to confirm they fail without the fix.

### Picture and MTP files managed one by one

Enable, Disable, Detach, Archive, Restore and Delete for the picture file and the MTP file, separately, without touching the base model (`modelManager/attachments.ts`, `ModelAttachments.tsx`, My models).

- A disabled, detached or archived file is never started, so no projector or draft runtime and no memory for it. The folder scan that used to re-attach any file next to the model is switched off for them.
- Delete asks first and keeps a file another model still uses. Deleting a model removes its own archived files, again except shared ones.
- Embedded MTP stays a plain on/off switch. The model card says what is actually running and roughly what it costs, from the engine's load report, not from what is attached.
- A text-only run of a vision model works (disable or detach the picture file, or use Safe Model Loading).

### Embedded MTP and the speed test (1.8, 1.9)

- Built-in MTP is read from the model file's own metadata (`<arch>.nextn_predict_layers`). The speed test no longer loads "built-in MTP" on every model without a draft file. The load report says when the switch is on but the file has no MTP layers.
- The speed test times close results again (a third time only if two disagree), gives accelerators a throw-away warm-up reply, uses medians with outliers removed, and re-reads a barely-better batch size with a differently started prompt so a prompt cache cannot flatter it. Clear winners are not re-timed.

### Learning and exam correctness (2.1 to 2.7)

- Recall scoring: an answer that negates a claim, uses the opposite word (gain/loss, at least/at most, debit/credit) or gives the figure in another unit earns nothing; a dropped condition earns half.
- Figures keep their sign (`-5`, `-$5,000`, `($5,000)`, "negative 5000"). Ranges and dates are not read as negative.
- Long claims with opposite meanings are conflicts; the 160-character cap is gone. Every related known claim is checked for conflict before anything is merged.
- Exam answers are classed as supported, unsupported or not applicable; an improvement is not claimed on right answers that cite nothing. Runs record subject, question set, model and grading, and are compared only when those match.
- A missing quiz answer key is no longer option A. Typed text that is not a number is no longer 0.

### Other

- Chat gear menu (7.4): the card is placed from measurements taken in one coordinate space, keeps every row inside a clipped, scrolling card, and Tools opens only after the menu closes. Needs a phone to confirm the original symptom is gone.
- Heat guard (1.10): two SEVERE readings in a row are needed to engage it; CRITICAL engages at once.
- CI (8.9): an automatic publish is skipped when a newer commit has landed on the branch (a manual publish is exempt). Android unit tests and the experimental builds replace an older push run. Packs and voices serialize their uploads. `ciConcurrency.test.ts` pins the policy. Not run on GitHub.
- 1.14: no scheduled task is enabled. Twenty-odd one-shot build reminders have already fired and disabled themselves; they were left in place because deleting a scheduled task also deletes the sessions it started.

## Not done

Not attempted, or only partly. None of these is started in code.

- Part 1: call-mode microphone recovery (1.1), briefing tune, pauses and voice switching (1.2), AI composer fallback diagnostics (1.3), lesson chapter order and generation in pieces (1.4, 1.5), Gemma 4 QAT placeholder output (1.6), background-model restoration (1.7), screen wake and emoji before speech (1.10, other than the heat guard), native crash diagnostics through Android's exit-reason API and release-readable logs (1.11, beyond the breadcrumbs above), fun-fact preview (1.13).
- Part 2: 2.8 to 2.11 (keeping what was learned, remediation, the Judge, source authority).
- Parts 3 and 5: document indexing, ZIP imports, FTS5 and semantic retrieval, backups, embeddings and search speed.
- Part 4 beyond what the speed test now does: per-model acceleration choice from measured load time, first-token delay and stability; speculative-decoding benefit tracking; KV-cache reuse.
- Parts 6, 7 (other than 7.4) and 9: preview reporting, notification checks, remote cancellation, the full visual audit, tablet layouts, Quick/Balanced/Deep modes.
- Part 8 except 8.9: ARM64-only releases, native C++ caching, compiler caching, Gradle configuration caching, fast dev builds, APK size. These need real builds to measure and could not be run here.

## Second pass (same day, after the first merge)

More items finished, each with tests; none run on a device.

- 3.1 Duplicate detection: a document is skipped as a duplicate only when its SHA-256 and size are confirmed. A failed or empty hash never matches (it used to match any other failed hash); the file still imports under its own key; a different edition is always kept.
- 1.10 Emoji before speech: `speechSafe` removes emoji, invisible, control, icon-font and divider characters before any text reaches the voice (read-aloud, briefing, calls, streaming). Letters of every script, digits, currency and unit signs and the joiners inside Persian and Indic words are kept.
- 1.10 Lesson screen: reading shows how much there is to read and for how long; writing shows words written and words a second.
- 6.1 / 6.2: a web-page preview and a reminder are reported as working only when they did. The saved file and the preview are reported separately. A saved schedule is separated from "a notification will appear", which is only said after notifications are confirmed on and the alarms were accepted.
- 6.3: a cancelled remote request no longer erases the controller of a newer one (Stop could no longer cancel it), and a new request cancels one still streaming.
- 1.4: a long planned course keeps whole chapters, never half of one (it used to cut a chapter, and its exam, in the middle).
- 2.11: a book is not given standard-setter authority because of its title or file name. First pages that show a published book (ISBN, edition, learning objectives, publisher copyright) win over a standard-like name or cover. This also stops a book titled "FASB ASC 842 Guide" being marked official from its cover.
- 1.7: a failed background-model load keeps the person's chat choice (it could be left on the background model), a failed restore is retried twice, and nothing is swapped while a reply is being written.
- 1.12: two more leaking timers (the debounced exercise save and the delayed voice restore) no longer keep a process alive. The full suite passes (1,000 suites, 10,415 tests). The "worker did not exit gracefully" warning still appears once. `--detectOpenHandles` found nothing in `home`, `chat`, `atlas`, `onboarding`, `memory`, `happy` or `generation` after the fixes, and `screens`, `settings`, `skills`, `stores`, `workflows` and the root-level integration files did not finish in the time allowed, so the last one is still unfound.

Still not done: everything under "Not done" above except the items listed here.

## Needs attention from a person

- The workspace engineering contract named in `AGENTS.md` (`../.codex/ENGINEERING_CONTRACT.md`) was not available in this container, so only `rules.md` and `CLAUDE.md` were followed.
- Gemini, Codecov and SonarCloud reviews (8.10) run on a pull request; their findings are not in this document.
- Jest (1.12): see the second pass above for the current state. In the first pass one leak was fixed. Importing `App.tsx` started the battery and heat monitors, which nothing could stop; they now start with the app and stop with it (`monitorsStop.test.ts`). The full suite passes (995 suites, 10,339 tests), but the "worker process failed to exit gracefully" warning still appears once, so at least one more leaking suite remains. The leak is not in `unit`, `rntl`, `hardening`, `contracts` or `specs`; it is somewhere in `__tests__/integration`. Running `--detectOpenHandles` over the whole suite takes hours in-band, so narrow it by sub-directory.
