# Atlas - Future Releases and Feature Backlog

Last planned: 2026-10-15
Repository: https://github.com/coolchan03/Atlas
Purpose: Keep user-requested improvements in one place for future update sessions.
Scope: Future Android Atlas releases; this is a plan, not a claim that features are already shipped.

## How to use this file

- Read this file at the start of a future Atlas update. Ask which batch or item IDs to take next, unless the user has already selected them.
- Check the current code, prior commits, regression results, and device evidence before implementing anything. Do not duplicate functionality that is already working.
- Unchecked items are pending acceptance, implementation, or both. Mark an item complete only when code, relevant automated tests, signed APK packaging, and applicable phone/tablet checks are evidenced.
- Update this file with the finished version/commit and retain unfinished subwork. Use the separate engineering defect registers for individual bugs.
- Proposed batches are flexible, not promised release dates or fixed version numbers. No feature update starts automatically.
- All GitHub write operations go through the user's Tunnel to Surface connection.

## Standing product decisions (do not accidentally reverse)

1. Android first: one app for the Motorola Razr Ultra 2025 and the onn 13.2-inch Pro tablet; no Windows port in this roadmap.
2. New conversations start with **No Agent**, not Atlas. Existing conversations keep their selected agent.
3. Only chats and projects individually selected for encryption are encrypted/locked. Do not introduce a global encrypt-everything switch as a substitute.
4. Protected items may share a chosen PIN/password, with an explicit option to permanently unlock a selected item. Never weaken security by silently unlocking all items.
5. **No automatic/background cross-device sync.** Manual, foreground, explicit opt-in sync is acceptable. Never sync private/unsaved or protected content without the needed secure design and user choice.
6. Project learning games should teach from the project's own files: crossword, word search, matching, quizzes and deduction puzzles. Do NOT revive the old 23-unrelated-games scope. Existing general games belong in Emergency Atlas.
7. Prefer NPU, then genuinely supported GPU acceleration; show the active engine. Explicit GPU/NPU requests must not silently fall back to CPU. CPU use must respect the user's setting/selection.
8. Support different compatible models, not just the specific Anima/Qwen checkpoints used in testing. Check architectures, companion files, and actual device memory before recommending a model.
9. Keep navigation compact and practical on phones/foldables/tablets; preserve offline-first use. Internet research is deliberate and permission-aware.

## Current release candidate: verify already-built features first

These are acceptance tests for functionality reportedly implemented in source, not instructions to rewrite it unconditionally.

- [ ] **VAL-01 | Signed APK and upgrades.** Validate the current GitHub-produced APK, permanent signing fingerprint, installation, and upgrade over a compatible previous signed version. Preserve chats/settings; test phone and tablet. Never replace the signing key just to get a passing build.
- [ ] **VAL-02 | Baseline gates.** Verify TypeScript, complete available Jest suite, ARM64 native packaging, signed APK verification, artifact publishing, and device launch. Track skipped private-Pro tests as skipped, never as passes.
- [ ] **VAL-03 | No Agent and workspace.** Verify No Agent default, merged Projects/Agents workspace, project-folder grouping in Chats, existing-agent continuity, and reasonable bottom navigation.
- [ ] **VAL-04 | Chat management.** Verify deleting an individual user or assistant message, long-press rename/archive/delete/pin, creating a private chat before the first message, and no loss of unrelated conversations.
- [ ] **VAL-05 | Selective security.** Verify selected PIN-protected chats, separately protected projects, shared-PIN behavior, permanent unlock, locking after backgrounding, tamper/key-loss handling, and safe migration on both devices.
- [ ] **VAL-06 | Project knowledge.** Verify readable AND writable project-shared documents and accurate indexing/retrieval across chats. Specifically check populated projects containing chats, knowledge files and study artifacts; metadata-only protection is not enough.
- [ ] **VAL-07 | Research and learning.** Check in-app deep research with online/offline sources, citations, project-scoped context, model nicknames, and project-derived puzzles/learning aids; source-code presence is not acceptance.
- [ ] **VAL-08 | Image and accelerator smoke tests.** On the actual phone/tablet test model import, support files, LoRA/upscaler hooks, Vulkan/OpenCL/NPU eligibility, cancellation, image output quality, and accurate engine labels.
- [ ] **VAL-09 | Local peer sync.** Verify current opt-in same-Wi-Fi/hotspot foreground pairing, manually invoked sync, project file bytes, conflict copies, opt-out/unpairing, disconnect/reconnect, and failure behavior. No background-sync expansion.
- [ ] **VAL-10 | Voice and model failures.** Check text-model retry/Load Anyway, honest unavailable-engine errors, speech-to-text/text-to-speech with a larger resident model, repeated sessions, and no UI freezes.

## Suggested next update: reliability, speed and image quality

### Text AI / acceleration

- [ ] **TXT-01 | NPU repetition recovery.** Detect runaway single-character/token repetitions (including the reported Qwen repeating @), stop cleanly with a useful retry option, isolate model/chat state, and test tokenizer/template/stop-token handling; do not blame roleplay content without evidence.
- [ ] **TXT-02 | Real hardware performance.** Benchmark prefilling and tokens/sec on the Razr and onn tablet with reproducible model files. Show actual NPU/GPU/CPU backend and load time; optimize thread count, responsiveness, memory use, battery and heat without invented speed claims.
- [ ] **TXT-03 | Hardware auto-selection.** Probe real Hexagon/HTP, Vulkan and OpenCL capabilities at runtime; rank usable backends for each model and device, allow per-backend enable/disable, and explain why unsupported paths were rejected.
- [ ] **TXT-04 | Model-agnostic compatibility.** Validate GGUF family, quantization, context/template, projector/mmproj pairing and engine eligibility on import and model switch. Make unsupported combinations actionable instead of failing after a long load.
- [ ] **TXT-05 | Load/reload experience.** Provide truthful fit estimates and Load Anyway where meaningful; progress/cancel/error details for download, conversion, model loading and reload; keep the app responsive under RAM pressure.

### Image AI

- [ ] **IMG-01 | Broad model-family imports.** Detect and validate diffusion architecture and required components, including GGUF and safetensors checkpoints, relevant .json tokenizer/config files, VAE/text encoders and supported .pt/.pth helpers. Never claim arbitrary Diffusers pipelines work without an engine implementation.
- [ ] **IMG-02 | LoRA style manager.** Attach compatible LoRAs, choose style per generation, adjust strengths, save presets (photorealistic, anime/manga, cartoon), and clearly reject incompatible LoRAs.
- [ ] **IMG-03 | Upscaler and refinements.** Recognize Real-ESRGAN and other actually supported upscalers separately from checkpoints; offer a clear quality/speed trade-off and verify non-corrupted outputs.
- [ ] **IMG-04 | Better composition.** Explore sketch/reference-image guidance, img2img/inpainting or ControlNet where supported, so prompts and sketches control object placement instead of merely increasing diffusion steps.
- [ ] **IMG-05 | Reliable on-device models.** Test Anima, suitable Z-Image and Chroma pipelines plus other architectures only if supported by native code; document companion encoder/VAE requirements, device RAM and licenses. Treat unsupported Pony/AuraFlow as unsupported until implemented.
- [ ] **IMG-06 | Image progress and quality tests.** Show diffusion stage/step, preview when native engine actually provides one, active backend and memory; permit cancel/retry; compare fixed-seed outputs for both successful rendering and prompt adherence.
- [ ] **IMG-07 | Image hardware portability.** Make NPU/Vulkan/OpenCL selection device- and model-aware, protect against kernel/pipeline failures, report real fallback choices, and offer a smaller fast-image option rather than assuming one high-end model works everywhere.

## Following update: projects, learning, tools and privacy

### Project workspace and memories

- [ ] **PRJ-01 | Three shared knowledge documents.** Offer project-level editable templates for Personal History, AI Instructions and Current Progress; allow a project to rename, replace or omit them. Keep their contents private unless the user explicitly shares them.
- [ ] **PRJ-02 | Read/write context across chats.** All project chats should read shared documents and, with explicit user control, update selected files. Keep individual chat history/memory separate and allow source tracking, corrections and conflict resolution.
- [ ] **PRJ-03 | Full protected-project vault.** Support selected project encryption INCLUDING its member chats, shared documents, study artifacts and previews, rather than only metadata. Define migration, backup, tamper, key-loss and permanent-unlock behavior.
- [ ] **PRJ-04 | Clean navigation.** Continue refining unified Projects/Agents/Chats view, project folders, model nicknames, scoped searches, pinning and contextual long-press; avoid adding crowded bottom tabs.
- [ ] **PRJ-05 | Optional personas.** Verify customizable Teacher, Friend, Jock/Boyfriend and other user-created agents, with chosen model/personality/voice/tools and isolated context. None replaces the default No Agent.

### Research and project-specific study

- [ ] **RES-01 | Deep Research improvements.** Multi-source search, iterative follow-up, citations to web pages and local/project files, limits on search/time/context budget, clear source provenance, and manual permission for internet access. Maintain a separate research working context where useful.
- [ ] **RES-02 | Project-linked learning games.** Crosswords, word searches, matching, quizzes, flashcards and logic/deduction mysteries generated from a selected project's approved sources, with answers/explanations and progress saved to that project.
- [ ] **RES-03 | Document-to-learning workflow.** Explain how an answer, flashcard, puzzle or summary came from project material. Let users correct stale knowledge and regenerate only affected study items.
- [ ] **RES-04 | Voice conversation.** Short, fast phone-call mode plus dependable hands-free talk/listen, interruption/cancel controls, selected persona voice and memory-conscious STT/TTS co-residency.

### Encryption, backups and optional local transfer

- [ ] **SEC-01 | Selective encryption UX.** One clear opt-in lock control per chat/project, common PIN/password option, protected previews/search suppression, per-item permanent unlock, wrong-PIN rate limits and biometric choice where reliable.
- [ ] **SEC-02 | Complete portable backup.** Explicit password-protected export/restore of allowed project files, chats and relevant settings, with migration and wrong-password/tamper tests. No plaintext leak and no surprise omission of knowledge documents.
- [ ] **SEC-03 | Manual encrypted device transfer.** Improve user-triggered foreground phone/tablet transfer, file attachments and deletion reconciliation with revocable pairing. Protected items require separate consent and safe key-handling; never auto-sync.
- [ ] **SEC-04 | Alternate local transports (optional).** Research Wi-Fi Direct formation/Bluetooth for cases without an existing LAN only if they can stay reliable, manual and permission-controlled; no silent background listeners.

## Later experiments and continuous polish

- [ ] **EXP-01 | Faster/better models.** Evaluate better NPU-compatible text and image runtimes, larger models when memory allows, and quantized alternatives. Only promote those proven on device; a 40-tok/s target is aspirational, not guaranteed.
- [ ] **EXP-02 | Guided image editing.** Expand reference-image, sketch completion, masks, line art and style adapters if a tested backend supports them at acceptable RAM/latency.
- [ ] **POL-01 | Diagnostics.** Add a simple model/hardware self-test showing active backend, tokens/sec, diffusion speed, memory, versions, last native error and an exportable privacy-safe report.
- [ ] **POL-02 | Foldable/tablet usability.** Improve adaptable density, gestures, readability, downloads, progress, accessibility and error recovery without making the navigation busier.
- [ ] **POL-03 | Technical debt.** Address actual regression issues in docs/GAPS_BACKLOG.md, docs/PENDING_FIXES.md, obsolete warnings and lint/architecture debt with targeted tests; avoid refactors that jeopardize the working APK.
- [ ] **POL-04 | Release discipline.** Every feature batch gets a test matrix, changelog, compatibility notes, validated signed APK, install/update checks and a rollback plan. Preserve the current permanent signing certificate.

## Engineering references

- docs/ATLAS_RELEASE_GATE_2026-10-15.md — most recent release gates, test counts, limitations.
- docs/ATLAS_AUDIT_2026-10-14.md — detailed security, project and regression findings.
- docs/ATLAS_OFFLINE_SYNC_2026-10-15.md — existing local sync implementation and explicit exclusions.
- docs/ATLAS_IMAGE_MODEL_COMPATIBILITY_2026.md — model-family/support-file compatibility evidence.
- docs/GAPS_BACKLOG.md and docs/PENDING_FIXES.md — implementation defects; not all are requested features.
- ATLAS_DEFERRED_SECURITY.md and FAST_FOLLOW.md — historical plans; reconcile against current code before use.

## Future update handoff / record

At each requested update: 1) read this roadmap and current GitHub branch; 2) identify selected item IDs; 3) verify what already exists; 4) work in a clean isolated tree; 5) write/push changes only through Tunnel to Surface; 6) run relevant tests and signed APK checks; 7) ask for real-device results where required; 8) mark each item as completed, still pending, or blocked with evidence, version and commit.

Completed in release: _(fill after acceptance and publication)_
Next selected items: _(fill when the user requests the next feature update)_

