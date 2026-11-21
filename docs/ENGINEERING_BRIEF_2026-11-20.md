ATLAS — COMPREHENSIVE ENGINEERING REPAIR & OPTIMIZATION HANDOFF

Updated: November 20, 2026
Repository: https://github.com/coolchan03/Atlas
Working branch: "claude/new-session-1zz2ct"
Reference release: Atlas Build 243
Framework: React Native 0.83.1, TypeScript, Kotlin and native inference engines

Mission

Complete a thorough engineering improvement pass across Atlas.

Focus on correcting existing functionality, eliminating crashes, improving model performance, accelerating Android builds, optimizing resource consumption, and producing a consistent and polished application.

Use the newest available repository source. Preserve existing chats, projects, learning data, downloaded models, agents, voice profiles and settings.

Implement improvements in the existing systems rather than introducing duplicate architectures.

Do not stop after identifying problems. Fix their causes, add regression coverage, and integrate the repairs into the application.

---

IMMEDIATE PRIORITY — MODEL-LOADING CRASHES

Current reported behavior: Atlas crashes whenever a model is loaded.

Resolve this before lower-priority feature development.

Investigate the entire native loading pipeline:

- Model format and architecture compatibility.
- Quantization support.
- CPU, GPU and NPU initialization.
- Native-library compatibility.
- Model initialization locks and concurrent operations.
- Context length and KV-cache allocation.
- Insufficient memory and Android process termination.
- Native context cleanup.
- MTP initialization.
- Vision-projector initialization.
- Previous model-tuning settings.
- Incomplete model unloading.
- Initialization timeouts and abandoned contexts.
- Unsupported or corrupted model files.

Determine which initialization stage fails and repair the actual cause.

Required changes

1. Prevent model-loading failures from crashing the entire application.
2. Recover correctly from native initialization errors.
3. Ensure failed initialization does not leave stale contexts or allocations.
4. Prevent incompatible configurations from repeatedly crashing at startup.
5. Provide a Safe Model Loading option that can bypass optional acceleration, MTP and vision components.
6. Preserve downloaded models and configuration records during recovery.
7. Record the actual failing operation and native error information.
8. Restore a usable state after an unsuccessful load.
9. Correct any lifecycle or memory-management defects found during the investigation.

MTP and vision attachment management

Atlas already provides some MTP and vision-file removal controls.

Extend them to allow independent management of optional supporting files without deleting the base model.

For external MTP/draft files and vision projectors, provide:

- Enable: Load and use the attachment.
- Disable: Keep the file installed but do not initialize it.
- Detach: Remove its association with the selected model.
- Archive: Preserve it for later restoration without using it.
- Restore: Reattach an archived file.
- Delete: Permanently remove the file with confirmation.

Preserve shared files used by multiple models.

For embedded MTP, provide an enable/disable control rather than attempting to remove embedded weights.

Disabling an optional component must prevent its associated runtime and unnecessary memory allocations from being initialized.

Make it possible to run a compatible base model in text-only mode without an external projector or draft model.

Display whether optional components are actually loaded and their estimated memory costs.

Do not assume that an attachment improves performance merely because the model supports it.

---

PART 1 — ADDITIONAL OPEN FUNCTIONAL PROBLEMS

1.1 — Call mode unexpectedly mutes the user

Reported problem: Atlas sometimes stops hearing the user during a call.

The existing call trace reports a stall, but the underlying cause remains unidentified.

Investigate:

- Microphone lifecycle.
- Recorder ownership.
- Audio focus.
- Input and output routing.
- Mute-state transitions.
- Voice activity detection.
- Speech recognition.
- Audio-session interruptions.
- Recording timeouts.
- Background and foreground transitions.
- Speech playback interfering with recording.
- Native recorder failures.

Record transitions between listening, transcribing, generating, speaking and restarting.

Distinguish an actual muted microphone from a stalled recorder or speech-recognition engine.

Ensure the microphone automatically recovers when possible.

Do not allow Atlas to remain indefinitely in a state where the call appears active but the user cannot be heard.

1.2 — Daily briefing audio problems

Three reported problems:

1. The introduction tune does not play.
2. There is an unusual pause between stories.
3. The selected voice sometimes changes during the briefing.

Repair all three.

Introduction tune

Trace tune generation, file loading, audio-session ownership, playback initiation and queue order.

Ensure the configured intro plays at the intended point.

Pauses between stories

Improve audio pre-rendering and queue management.

Preload and decode upcoming segments.

Minimize unnecessary silence while preserving natural pauses.

Do not block playback while waiting for an unrelated audio-generation operation.

Voice switching

Investigate voice-profile ownership, cached audio identities, speaker assignment and restoration logic.

Ensure each segment uses its intended voice.

Prevent other features or background operations from unexpectedly replacing the briefing voice.

Use the existing What just happened trace to identify the sequence of events behind these failures.

1.3 — AI music composer falls back to the built-in composer

Reported problem: The AI composer continues falling back to the built-in music engine.

Investigate the actual model response and the point where fallback occurs.

Capture structured diagnostics for:

- Model selection.
- Prompt construction.
- Generated output.
- Output parsing.
- Validation.
- Generation time.
- Fallback reason.

Determine whether the model is producing invalid output, the parser is rejecting valid output, the model is being interrupted or another part of the pipeline is failing.

Fix the actual failure rather than continually adjusting fallback behavior.

The built-in composer should remain available, but the interface must distinguish genuine AI-generated music from fallback-generated music.

1.4 — Lessons fail, skip chapters or appear out of order

Reported problems:

- Lessons fail to generate or complete.
- Chapters appear in the wrong order.
- Some chapters are missing.
- Large lessons can take too long to generate.

Review the complete course-generation pipeline.

Correct chapter detection, ordering, generation checkpoints, completion tracking and error recovery.

Preserve the intended structure of imported textbooks.

Prevent duplicate, missing and reordered chapters.

Ensure partial failures do not corrupt the course outline.

Continue improving handling of long-running generation and runaway output.

1.5 — Optimize lesson generation in pieces

Atlas now supports generating lessons in multiple pieces.

Evaluate whether that approach is genuinely faster than one larger generation.

The current implementation may repeatedly process approximately 35–80 seconds of prompt-reading work for each piece on slower models.

Improve the process by:

- Reusing unchanged prompt context where possible.
- Avoiding unnecessary repeated instructions and source excerpts.
- Keeping the shared course outline compact.
- Reducing redundant prompt tokens.
- Selecting an appropriate number of generation pieces.
- Combining pieces without introducing inconsistent explanations.
- Avoiding excessive model initialization or prompt-processing overhead.

Compare complete lesson-generation time and resulting lesson quality.

Use the faster approach for the model and task rather than assuming more pieces are always better.

1.6 — Gemma 4 QAT placeholder-token output

Reported problem: Certain Gemma 4 QAT files produce placeholder-token output on CPU and OpenCL.

Investigate:

- GGUF architecture and metadata compatibility.
- QAT quantization support.
- Tokenizer configuration.
- Chat templates.
- Prompt formatting.
- Native inference implementation.
- KV-cache compatibility.
- Output parsing.
- Special-token handling.
- CPU and OpenCL behavior.

Determine whether the failure originates from the model file, the native backend or Atlas's configuration.

Prevent corrupted output from being treated as a valid response.

Do not automatically classify every compatible-looking model file as reliable.

Preserve diagnostics that distinguish unsupported inference behavior from an ordinary model-generation error.

1.7 — Background model loading and foreground restoration

Atlas supports a separate background model.

Improve the lifecycle so background inference does not prevent the main chat model from becoming available again.

Pay particular attention to restoration after approximately 45 seconds and transitions between foreground and background activity.

Verify correct behavior when:

- A background model loads.
- The user starts an ordinary chat.
- The previous model must be restored.
- Memory is insufficient for both models.
- A background operation is cancelled.
- The application changes state during generation.

Ensure model residency, unloading and restoration are coordinated through the existing centralized model manager.

1.8 — Speed-test GPU layers and MTP rounds

Complete the GPU-layer, batch-size and embedded-MTP benchmark improvements.

Determine whether a model actually contains compatible embedded MTP layers by inspecting its metadata and supported runtime capabilities.

Do not infer embedded MTP support merely from a model family name.

Record whether acceleration is genuinely active.

Avoid benchmark configurations that load unsupported or unnecessary components.

1.9 — Batch-size benchmark instability

Known weakness: Each batch size can be evaluated using only one run.

One noisy result may cause Atlas to select a slower configuration.

Improve benchmarking with warm-up runs and repeated measurements where justified.

Use robust statistics and reject obvious outliers.

Avoid unnecessarily long benchmarks.

Select configurations based on reliable performance differences.

1.10 — Screen wake behavior, thermal controls and call formatting

Complete the screen-stays-on behavior during appropriate operations.

Ensure long-running user-requested tasks do not accidentally trigger undesirable screen or activity-state transitions.

Keep the heat guard configurable.

Use reasonable thermal thresholds and gradual workload reduction where appropriate.

Do not automatically interrupt important work because of a transient temperature reading.

Ensure emoji and unsupported characters are handled appropriately before speech synthesis without damaging ordinary spoken text.

Correct the lesson-screen reading-versus-writing performance information so it clearly reports the appropriate metrics.

1.11 — Improve native crash diagnostics

Current diagnostics do not adequately capture native crashes, and the log screen is not fully usable inside the published release.

Improve diagnostics so Atlas can explain failures involving:

- Native inference initialization.
- Model loading.
- Audio engines.
- Memory allocation.
- Background execution.
- Android process termination.

Persist useful diagnostic breadcrumbs before dangerous native operations.

Capture available native error information through Android-supported mechanisms.

Make relevant logs readable inside the release application.

Preserve the existing Share all logs capability.

A user should not have to interpret raw logs to understand the basic cause of a failure.

1.12 — Fix Jest worker-handle leaks

The Jest suite reports that a worker process failed to exit gracefully.

Investigate timers, subscriptions, unresolved promises, native mocks, background jobs and unclosed handles.

Correct improper cleanup rather than merely suppressing the warning.

Ensure the test suite terminates cleanly.

1.13 — Fun-fact generation and preview

Complete the Wikipedia fun-fact workflow.

Ensure articles are retrieved and parsed correctly, unsuitable results are rejected, and selected facts correspond to the source material.

Improve error recovery when a requested fact cannot be retrieved.

Add rendered coverage for the Preview a fun fact screen.

Also include the Assistant settings screen in the full visual review.

1.14 — Remove obsolete scheduled build reminders

Identify old build-check reminders that are no longer relevant.

Disable or remove obsolete reminders so they do not continue producing unnecessary notifications.

Preserve active, useful scheduled tasks.

---

PART 2 — LEARNING AND EXAMINATION CORRECTNESS

2.1 — Fix incorrect recall scoring

Correct the learner's ability to assign full credit to statements that contradict the reference answer.

Recognize negation, opposites, conditions, exceptions, numerical values and units.

Prevent factually incorrect answers from increasing mastery.

Source: "src/learning/claimText.ts"

2.2 — Correct contradictory-claim detection

Long claims with opposite meanings must not be classified as duplicates.

Remove problematic length restrictions.

Evaluate contradictions before merging knowledge.

Preserve source disagreements until properly resolved.

Source: "src/learning/claimText.ts"

2.3 — Preserve financial signs

Prevent negative financial values from being treated as positive.

Handle gains, losses, credits, debits, liabilities, negative balances and percentages accurately.

Use deterministic numerical comparison where appropriate.

Source: "src/learning/exams.ts"

2.4 — Fix evidence-assisted examination scoring

Separate factual correctness from evidence-supported correctness.

A correct answer without supporting evidence must not automatically count as successful source-assisted learning.

Maintain clear categories for supported, unsupported, incorrect and ungraded responses.

2.5 — Compare examinations correctly

Associate examination runs with subject, question-set identity, grading configuration, model and benchmark version.

Do not calculate improvement from unrelated examinations.

2.6 — Reject invalid quiz answer keys

A missing answer key must not become option A.

Reject incomplete or invalid generated questions and regenerate them where appropriate.

Source: "src/topics/formats.ts"

2.7 — Correct numerical practice validation

Reject arbitrary text that becomes zero after sanitization.

Preserve legitimate negative values, decimals and scientific notation.

Source: "src/topics/SquareViews.tsx"

2.8 — Repair session knowledge retention

Complete the Keep what it learned workflow.

Allow proposed lessons and answers to be reviewed and retained appropriately.

Ensure approved information is available in future learning and conversation sessions.

Source: "src/learning/engine.ts"

2.9 — Improve remediation after failed practice

When an answer is incorrect:

1. Identify the misunderstanding.
2. Retrieve the relevant material.
3. Explain the concept differently.
4. Present a new question with different wording or numbers.
5. Measure the learner's improvement.

Avoid repetitive questions that do not address the underlying problem.

2.10 — Improve the Judge

The Judge is often the same small model responsible for generating the answer.

Avoid treating the model's own assessment as independent verification.

Use deterministic checking for calculations and structured answers.

For open-ended material, use clear evaluation rubrics and supporting evidence.

Keep judging efficient enough to avoid overwhelming smaller local models.

2.11 — Improve source authority

Use document identity, issuer, publication date and applicable period to establish source authority.

Do not assign professional authority solely from filenames.

Maintain historical versions of standards and regulations.

---

PART 3 — DOCUMENT INDEXING, IMPORTS & BACKUPS

3.1 — Fix duplicate detection

Do not classify documents as identical when hashing fails.

Only skip confirmed duplicates.

Preserve different editions and revisions.

3.2 — Improve ZIP imports

Recognize and organize textbooks, questions, answer keys, notes, standards, case studies and worked examples.

Complete question-bank integration.

Support progress tracking and resumable imports.

3.3 — Improve LLM-accessible file indexing

Extend Atlas's existing indexing, SQLite and retrieval systems.

Every imported document should have useful searchable metadata:

- Document identity.
- Title and filename.
- Subject.
- File type.
- Document version and date.
- Headings and chapters.
- Relevant keywords.
- Page references.
- Text passages.
- File checksum.
- Indexing status.

Combine:

Full-text indexing: Efficient exact searches using SQLite FTS5 where appropriate.

Semantic retrieval: Embedding-based searches for related information.

Structured document navigation: Allow the LLM to locate files, chapters, sections, tables and pages.

The model should receive relevant excerpts rather than whole textbooks.

Provide a compact document catalog accessible through Atlas's existing tools.

Index only changed material.

Preserve source references.

3.4 — Improve large-library performance

Optimize embedding generation and retrieval for large professional-study libraries.

Improve chunking, indexing and cache reuse.

Avoid scanning or reprocessing unchanged textbooks.

Preserve exact section references and important context.

3.5 — Improve backups

Remove unnecessarily restrictive size limits.

Support large document collections using scalable processing.

Include progress reporting, integrity checking and interrupted-operation recovery.

---

PART 4 — LOCAL MODEL PERFORMANCE

4.1 — Improve automatic hardware acceleration

Select CPU, GPU or NPU based on actual performance for each model.

Measure loading time, first-token delay, prompt processing, generation speed, memory use and stability.

Do not assume that the NPU is automatically fastest.

4.2 — Correct performance ranking

Use complete-response time rather than only output tokens per second.

Benchmark representative short, medium and long prompts.

4.3 — Preserve per-model configurations

Keep model-specific acceleration and memory settings independent.

Prevent tuning one model from unintentionally changing another model's behavior.

4.4 — Improve tuning cancellation

Restore the original model and runtime state appropriately after interruption.

Prevent overlapping tuning sessions.

Do not leave stale native contexts or unexpected active models.

4.5 — Improve model residency

Use the existing residency manager.

Avoid unnecessary model unloading and reloading.

Coordinate foreground and background model activity.

Release unused memory promptly.

4.6 — Improve speculative decoding

Measure the benefit of MTP and draft models.

Track accepted tokens, rejected tokens, total latency and memory overhead.

Disable speculative decoding automatically when it performs worse.

Respect per-model MTP controls.

4.7 — Improve prompt processing and cache reuse

Avoid repeatedly processing unchanged chat history and source passages.

Improve KV-cache reuse where supported.

Invalidate incompatible or stale caches.

4.8 — Improve low-memory recovery

Recover gracefully when a model cannot load at the preferred settings.

Consider reduced context, compatible alternative acceleration or unloading optional components.

Explain performance fallbacks clearly.

4.9 — Improve compatibility information

Show supported capabilities and actual active functionality.

Include vision, MTP, tools, CPU/GPU/NPU compatibility, context limits and supporting files.

Do not select an incompatible backend merely because it benchmarks faster.

4.10 — Improve diagnostics

Expand the existing performance tools to distinguish:

- Loading.
- Prompt processing.
- First-token delay.
- Generation.
- Retrieval.
- Tool execution.
- Speech processing.

---

PART 5 — APPLICATION SPEED

5.1 — Optimize embeddings

Improve the sequential embedding-generation implementation.

Use native batching when appropriate.

Support resumable indexing.

Avoid unsafe concurrent native inference.

5.2 — Optimize semantic retrieval

Improve top-K search efficiency.

Consider more scalable local vector indexing for large libraries.

Preserve exact-reference search.

5.3 — Improve chunking

Experiment with section-aware chunks and appropriate overlap.

Reduce unnecessary retrieved tokens.

5.4 — Optimize global search

Avoid rescanning large conversation histories unnecessarily.

Use debouncing and efficient indexes.

5.5 — Improve chat rendering

Reduce unnecessary component rerenders during streaming.

Improve long-conversation scrolling and keyboard interactions.

5.6 — Improve background priorities

Prioritize active user requests over background indexing and learning.

Prevent simultaneous heavyweight tasks from making the interface unresponsive.

---

PART 6 — OTHER FUNCTIONAL REPAIRS

6.1 — Correct web-page preview reporting

Report file creation and preview-opening results separately.

Do not claim a preview opened if it failed.

6.2 — Correct scheduled-task notifications

Confirm notification availability before claiming that reminders will appear.

Distinguish saved schedules from successfully configured notifications.

6.3 — Improve remote inference cancellation

Cancel or invalidate timed-out requests.

Prevent abandoned work from interfering with newer requests.

6.4 — Improve error recovery

Remove misleading success messages.

Correct swallowed errors that hide important failures.

Restore valid application states after unsuccessful operations.

---

PART 7 — FULL UI AND NAVIGATION IMPROVEMENTS

7.1 — Standardize appearance

Use existing shared components and theme settings consistently.

Correct typography, spacing, cards, menus, inputs, popovers, dialogs, buttons, icons, animations and corner shapes.

7.2 — Improve tablet layouts

Make better use of large displays.

Improve result previews, content density and portrait/landscape arrangements.

Avoid unnecessarily cramped layouts.

7.3 — Improve navigation

Keep important features easy to find.

Consolidate overlapping settings.

Preserve Professional Exam Prep within Learn a Topic.

Ensure consistent navigation behavior.

7.4 — Fix the chat gear-menu bug

User-reported defect: The Tools option appears underneath the quick-settings popover and overlaps the message-entry area.

Fix the existing "QuickSettingsPopover".

Ensure all menu items remain inside the popover bounds.

Correct sizing, clipping, alignment, stacking, touch behavior and positioning relative to the keyboard.

Tapping Tools must open the appropriate interface rather than affecting the text composer.

Source: "src/components/ChatInput/Popovers.tsx"

7.5 — Complete the full visual audit

Inspect and correct the entire rendered interface.

Include:

- Normal screens.
- Empty states.
- Loading states.
- Error states.
- Menus.
- Dialogs.
- Long text.
- Scrolling.
- Keyboard interactions.
- Appearance variations.
- Portrait and landscape layouts.
- Tablet layouts.
- Preview a fun fact.
- Assistant settings.

Correct misalignment, clipping, overlapping controls, inconsistent styling, awkward spacing and broken interactions.

This is required implementation work, not an optional review.

---

PART 8 — ANDROID BUILDS, RELEASES & APK SIZE

8.1 — Optimize architecture compilation

Build ARM64 for every ordinary release.

Build additional supported architectures every 20 release-version increments by default, with an option to use 10.

Also rebuild other architectures when relevant native changes make this necessary.

Provide a manual full-architecture build option.

Correct dependencies such as "op-sqlite" that compile unnecessary architectures during ARM64-only releases.

8.2 — Improve native C++ caching

Build 243 took approximately 67 minutes, with most time spent compiling the release APK.

Improve caching of native inference engines and other expensive C++ dependencies.

Avoid recompiling unchanged native components.

Use cache keys based on source, architecture, NDK and build configuration.

8.3 — Add compiler caching

Evaluate and implement appropriate C/C++ compiler caching.

Ensure correct invalidation of outdated native artifacts.

8.4 — Improve Gradle configuration caching

Enable compatible configuration caching.

Resolve important incompatibilities.

Measure the reduction in repeated build time.

8.5 — Create fast development builds

Separate quick engineering builds from complete publishing builds.

Reuse verified native artifacts where appropriate.

Preserve complete release verification.

8.6 — Improve CI reuse

Reduce unnecessary repeated tests and waiting between workflows.

Reuse trustworthy results for the same source revision.

8.7 — Reduce APK size

Required work.

Build 243's APK was approximately 234 MiB.

Analyze packaged resources and native libraries.

Complete compatible R8 shrinking improvements.

Remove unused binaries and unnecessary architecture-specific files.

Preserve all intended functionality.

Maintain a full-featured primary APK and provide smaller device-targeted builds where useful.

Measure the size reduction.

8.8 — Improve build timing diagnostics

Record expensive tasks, cache performance and native recompilation.

Use actual timings to identify future optimization opportunities.

8.9 — Automatically cancel superseded development builds

Implement GitHub Actions concurrency handling.

When a newer commit starts a development build on the same branch, cancel the outdated build automatically.

Avoid cancelling unrelated branches or necessary release verification.

Protect publishing builds: Once a publishing build has entered signing or release publication, do not automatically terminate it merely because another commit appears.

Allow explicit cancellation when necessary.

Prevent obsolete builds from publishing an older APK after a newer intended release has been selected.

8.10 — Complete the pull-request and review workflow

Current reported state: Work is on "claude/new-session-1zz2ct", and no pull request has been created or merged into "main".

Complete the repository's established review process.

Create an appropriate pull request for the finished engineering changes.

Run the repository's required reviews and checks, including the configured Gemini, Codecov and SonarCloud integrations.

Address substantive findings.

Ensure the final published release corresponds to the intended reviewed source commit.

Do not assume that a passing Jest suite replaces the complete repository review workflow.

---

PART 9 — QUALITY-OF-LIFE IMPROVEMENTS

9.1 — Quick, Balanced and Deep modes

Provide useful presets for inference behavior.

Quick should prioritize responsiveness.

Balanced should provide normal assistant behavior.

Deep should allow more extensive reasoning and verification.

Use existing settings wherever possible.

9.2 — Clearer performance information

Present understandable information about processing speed and delays.

Do not overwhelm ordinary users with technical statistics.

Keep advanced measurements available.

9.3 — Better adaptive teaching

Simplify explanations and vary examples when the learner struggles.

Use new questions with different wording and numbers.

Increase difficulty when appropriate.

9.4 — Improved learning progress

Show verified knowledge, unresolved contradictions, practice performance and examination progress separately.

Avoid misleading overall accuracy measurements.

9.5 — Improve AI-created helpers

Refine the existing helper and tool system.

Support useful reusable calculators, question generators, formatting operations and structured workflows.

Avoid duplicating existing tools.

9.6 — Improve recovery from interrupted work

Allow appropriate operations to resume.

Avoid repeating completed imports, indexing, downloads and benchmarks unnecessarily.

9.7 — Simplify advanced settings

Keep commonly used options straightforward.

Organize technical controls into appropriate advanced sections without removing customization.

---

General engineering requirements

Preserve working infrastructure and user data.

Fix actual causes instead of applying superficial workarounds.

Avoid unnecessary new dependencies and parallel systems.

Do not remove features to improve benchmarks.

Use automatic recovery carefully and report when a fallback changes functionality.

Keep the app responsive while heavy tasks operate.

Add regression coverage for each corrected bug.

Prioritize meaningful correctness over simply increasing the number of passing tests.

The intended result is an Atlas release that loads models reliably, runs local AI efficiently, handles optional MTP and vision files correctly, teaches accurately, retrieves documents effectively, offers dependable voice and music functionality, has a consistent interface, and builds faster with a smaller APK.