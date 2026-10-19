# Atlas 0.0.105 — Changelog and Handoff

Status: **release candidate — not published.** Built on `atlas-voice` @ `d334d31` (v0.0.104) on branch
`claude/atlas-implementation-handoff-kvnfzs`. Android `versionName` 0.0.105, `versionCode` 1784144539.

Nothing here has been run on a physical phone or tablet. Every item marked *needs device test* must be
checked on the onn Pro 13 and the Razr Ultra 2025 before it is called done.

---

## 1. Vulkan and hardware acceleration

### Implemented
- **The llama.kt Vulkan text engine is now built into the release APK.** Root cause of "Vulkan not available":
  the official build never passed `-PatlasVulkanEnabled=true`, so `:atlasLlamaKt` was never compiled into
  releases (only into a side-by-side `.vulkantest` experimental app). The official workflow now builds it and
  **fails the release** if `lib/arm64-v8a/libllamakt.so` is missing. A release-contract check prevents the
  flag being dropped again.
- The side-by-side `.vulkantest` package id is gone; the release updates the normal Atlas install.
- App minimum Android version stays **7.0 (API 24)**. llama.kt needs Android 10 (API 29): the manifest overrides
  the library minimum and the bridge refuses to load llama.kt below API 29, reporting "needs Android 10".
- **OpenCL stays separate.** llama.kt is built Vulkan + CPU only (OpenCL sources/flags removed by the pinned
  overlay); OpenCL remains in llama.rn.
- **Diagnostics distinguish missing engine from unsupported hardware.** New `runtimeStatus()` reports one of:
  `not_packaged` (build problem), `native_load_failed`, `sdk_unsupported`, `no_vulkan_device` (driver reports no
  Vulkan GPU), `probe_failed`, or `ok` with the detected devices. Support is decided by the driver's device
  list, never by chipset name.
- **Actual GPU layers are shown.** For Vulkan, OpenCL and NPU the app reports
  `min(requested, block_count + 1)` from the model's GGUF metadata — the layers llama.cpp actually assigns —
  as "N of M layers" in Model Test, runtime info and settings. Previously Vulkan showed 0 / "unverified" and
  OpenCL showed the requested 99.
- **Adjustable / maximum safe offload.** Vulkan now uses the same device-RAM cap as OpenCL. Settings has a
  **Maximum safe** button (offload every layer this device's RAM allows) next to the layer slider, and shows
  what the loaded model actually got.
- **No silent CPU.** Explicit Vulkan fails visibly if the engine is missing, no Vulkan GPU exists, the RAM cap
  leaves 0 layers, or the native load reports 0 GPU layers. Automatic mode may still fall through to CPU and
  says so.
- **Download reliability (PENDING_FIXES #2):** stranded downloads after an app update are marked
  "interrupted" with a retry instead of spinning forever (also covers retrying / waiting-for-network rows).

### Tested
- Unit/Jest: Vulkan adapter, LLM Vulkan load paths, offload accounting, Kotlin unit tests for the bridge's
  offload/GPU-detection helpers and the stranded-download rule (Kotlin tests compile/run in CI only).
- All `scripts/check-vulkan-*.cjs`, `check-llamakt-*` and `verify-llamakt-gradle` contracts pass; the
  Vulkan-only CMake overlay applies cleanly to the pinned llama.kt.
- GitHub Actions APK build: see "Build evidence" below.

### Needs physical-device testing
- onn Pro 13 (Mali / MediaTek): Settings → Text generation → Vulkan, load a Q4 GGUF, check Model Test shows
  "Vulkan … N of M layers" and real speed; try Maximum safe.
- Razr Ultra 2025 (Adreno): compare OpenCL vs Vulkan; confirm explicit Vulkan never runs on CPU.
- A device on Android 9 or older must still install and run (Vulkan reported as needing Android 10).

## 2. Tablet layout

### Implemented
- Layout follows the **window** width (Material size classes), so phones in portrait are unchanged.
- ≥600 dp (tablet portrait, unfolded foldable, landscape phone): **navigation rail** on the left, built from
  the same customizable nav-bar settings (order, hidden items and shortcuts behave identically).
- ≥840 dp (13.2" onn in landscape): **two-pane Workspace** (Projects | Agents side by side) and **Model
  Settings in two open columns**.
- Chat on wide screens: header aligned with the readable column; user bubbles narrower, answers wider.

### Tested
Jest render tests prove phone layouts are unchanged and tablet layouts switch at the breakpoints.

### Needs physical-device testing
Rotation on the onn tablet, the Razr's inner screen in both orientations, split-screen/multi-window.

## 3. KittenTTS voices

### Implemented
- **KittenTTS Nano (v0.2, ~29 MB)** and **Mini (v0.1, ~163 MB)** as optional downloads, each with 8 built-in
  voices, running on the existing sherpa-onnx engine with the same sentence streaming, stop/cancel, one-thread
  load/free (memory) and offline playback as Kokoro/Piper. Existing Android TTS, Kokoro and Piper unchanged.
- **Verified locally** with sherpa-onnx 1.13.7 (same version as the app): both packages load, 8 speakers,
  24 kHz, non-silent audio for every speaker (~1 s per sentence for Nano on 4 x86 cores).
- **Licensing checked:** both packages ship an Apache-2.0 LICENSE; the voices workflow refuses to republish a
  KittenTTS package without it. Their espeak-ng-data is GPL-3.0 data, redistributed the same way as the
  existing Piper/Kokoro packages.
- Voices are named "Kitten 1–8": upstream labels alternate male/female, but a pitch check did not confirm the
  order for the packaged models, so no gender is claimed. Each voice previews when chosen.
- **Named voice profiles** (voice + speaker + speed) with preview, stored on the device.
- **Per-agent voice:** Agents → edit → Voice. That agent's replies are read in its profile; the saved app voice
  is restored afterwards for other screens.

### Not implemented: voice cloning (KittenTTS 2)
Correction to an earlier draft: **KittenTTS 2** (KittenML, 1.7B parameters, 506 MiB–1 GB) does clone a voice
from 5–30 s of audio. The packages shipped here are the older lightweight KittenTTS models, which cannot.
KittenTTS 2 is not in this release because:
- its only non-Python runtime (`kitten-tts-2-cpp`, MIT) is a batch command-line tool with a LibTorch
  (TorchScript) waveform decoder and no documented Android/ARM64 build;
- its voice cloning needs an offline Python preparation step;
- its weights use the separate "Stellon Labs Community License", which could not be read from this build
  environment (Hugging Face blocked), so redistribution terms are unverified.
A practical route: prepare the voice on a computer with KittenTTS 2, import the prepared voice into Atlas,
and run a KittenTTS 2 engine ported to Android (llama.cpp fork + Android LibTorch decoder). That port is a
separate native project; voice sample recording/import was not built until it exists.

### Done
The **Build Atlas voices** workflow ran successfully on 2026-10-19, so `kitten-nano-en.zip` and
`kitten-mini-en.zip` are on the `atlas-voices` release.

### Kokoro v1.0 voices (chosen by ear from rendered samples)
- New downloadable voice **Kokoro v1.0** (`kokoro-v1-en`, sherpa-onnx `kokoro-int8-multi-lang-v1_0`,
  Apache-2.0, LICENSE checked by the voices workflow): 28 English speakers, US and UK.
- British speakers load the UK pronunciation dictionary only with `lang="en"`; American speakers load
  the US one with `en-us` (`NeuralTts.kokoroDictionary`). `lang="en-gb"` renders silence, so it is not used.
- **Voice depth:** a speaker can be played lower without changing its pace. Atlas generates the speech
  faster and plays it back slower by the same factor (`NeuralTts.deepen`). "Lewis (deep)" is Lewis at 0.9
  (about 81 Hz instead of 91 Hz).
- Models -> Voice -> Voice profiles offers ready-made profiles once the voice is downloaded:
  **Echo** and **Puck** (American), **Fable** (British) and **Deep British** (Lewis at 0.9).
- Rendered and listened to on a computer only. Phone speed on Kokoro v1.0 is not measured yet.

## 4. Image and LLM reliability

### Implemented
- **Qwen repeated-text glitch — likely root cause fixed.** llama.rn re-parses all generated text into an
  accumulated `content` each token, and that parse can revise text already shown (Qwen's chat format holds
  back partial `<tool_call>`/`<think>` tags; failed partial parses arrive as raw tokens). The stream helper
  re-appended the **whole** reply whenever the new value did not extend the old one, and the stored message
  is built from the stream, so the repetition was saved. Deltas are now computed against displayed text and
  the final message is reconciled with llama.rn's parsed answer.
- Inaccurate acceleration reporting fixed (see §1).

### Not done (needs device or more time)
- Native image generation with `.gguf`/`.safetensors`, VAE/encoders, LoRA, `.pth` upscalers and JSON settings
  was **not executed** — it needs the phone/tablet. Tokenizer mismatches, model switching and memory errors
  were not re-investigated beyond the items above.

## 5. Project and chat protection

### Implemented
- **Plaintext leak fixed:** adding a document to a PIN-protected project left the *original file* unencrypted
  in the attachments folder. The copy is now deleted after encryption (and if encryption fails).
- Document paths/names are no longer written to the Android system log.
- **Protect existing projects with their chats:** protecting a project now encrypts each of its chats with the
  project PIN (verified) before locking. Unlocking the project opens its chats; new chats can be started inside
  an unlocked protected project and are sealed with the project PIN. Selective protection and permanent
  unprotect are unchanged.

- **Study outputs** of a protected project are encrypted in their own file (project PIN key); never written to
  plain storage, re-encrypted on every change while unlocked, dropped from memory on re-lock.
- An existing chat can be **moved into an unlocked protected project**; it is sealed with the project PIN.
- **Backup/restore audit:** restoring a backup used to delete every protected project on the phone (and
  locked chats missing from the backup). Restore now keeps them. Unlocked protected projects are included
  in password backups sealed with their own PIN and open on a new phone with that PIN.
- Nearby phone/tablet transfer was checked: protected projects, protected chats and study outputs are never
  sent.

### Not done
- Original document bytes are not kept for protected projects (only encrypted text/embeddings) — by design.
- Backup/restore and phone↔tablet transfer were not changed or re-audited beyond the above.

## 6a. Daily briefing (user report: ignored interests, made things up, read ads as news, odd page)
- Broad interests use Google News top-story sections (U.S., world, business, tech, science, health, sports,
  entertainment); others use a 2-day search. Press releases, sponsored/shopping items and stories older than
  48 hours are dropped; the same story from several outlets is merged; every interest gets a story first.
  Bing's outlet field (`<News:Source>`) was never read before; fixed.
- One part per real headline, written only from that story's own text, shorter when the source is thin. Fun
  facts come only from the offline library, never the model's memory.
- The page shows the exact headlines used (outlet, interest, time, link), uses the app's shared components,
  and shows step-by-step progress with elapsed time while it is made.
- Tested with fixtures in the real Google/Bing RSS formats; the live news hosts are blocked from the build
  environment, so a real-day check on the phone is still needed.

## 6. Project learning / Therapy

- The Therapy setup (six private chats sharing *Personal History*, *AI Instructions*, *Current Progress*) is now
  possible inside **one protected project**: create the project, add the three documents, create the chats,
  then protect it — or protect first and create chats while unlocked. No private data is in the repo or APK.
- **Shared files are now writable:** a chat can create or update a named project document (e.g. *Current
  Progress*) with the new `update_project_document` tool (enable it like other tools). In a protected project
  it is written straight into the encrypted vault. Save report to project works in protected projects too.
- **Tested:** an integration test has chat A append to *Current Progress* in a protected project and checks that
  chat B's prompt then contains that text, with only encrypted files written. The project prompt no longer
  tells the model to use tools that are switched off.
- Learning games: terms were already taken only from the project's passages; everyday filler words
  ("however", "important") are now kept out of crosswords, word searches and term games.
  The obsolete 23-games request was not implemented, as instructed.

## 7. Voice mode ("phone call") speech input

- **Bug fixed:** voice mode treated a direct-audio chat model as "voice available", recorded each turn, then only
  transcribed it if a Whisper model was downloaded — so turns came back "couldn't hear that".
- Voice mode now uses a downloaded Whisper model as before, or **the phone's own speech recognizer** (on most
  phones Google's speech service, the one Gboard voice typing uses), asking for the on-device recognizer and
  offline recognition. If the offline language pack is missing it retries with the default recognizer (still
  asking for offline). The Android 11+ manifest query needed to find the recognizer was missing; added.
- Text-chat mic behavior is unchanged (the keyboard's mic already dictates there).
- **Looks like a phone call (FF-02, chosen by the user: in-app call screen, not cellular calls):** voice mode
  opens a full-screen call with the agent's name and initial, a call timer, status and live caption, round
  Mute / Speaker-Earpiece / Hands-free buttons, a talk button and a red End call. A hands-free call starts
  listening as soon as it opens.
- **Talk over it to interrupt:** in hands-free mode the mic is metered (not recorded or transcribed) while an
  answer plays. When you speak clearly over it for about 0.3 s, speech stops and a new turn starts. The
  recorder has no echo cancellation, so the trigger adapts to the answer's own echo level. It works best on the
  earpiece; on loudspeaker you may need to speak up.
- **Less talkative, more like a person:** call mode tells the model it is on a phone call: one to three
  sentences, answer first, offer details instead of listing them, contractions, short follow-up questions, no
  markdown or symbols, and do not repeat itself after an interruption.
- Needs device test: Razr + Gboard with the offline English pack installed, airplane mode, hands-free on;
  barge-in on earpiece and loudspeaker; that loudspeaker playback does not interrupt itself.
- Not built: the recorder/transcription app that labels speakers (FF-07). It needs a speaker-diarization model
  and decisions on consent and storage; it stays on the roadmap.

## Build evidence and checks

See the end of this file (filled in after the final CI run).

## Not changed
- `FUTURE_RELEASES.md` keeps all nine items. FF-02 (call screen) was implemented at the user's request and is
  noted there, unchecked until device-verified. FF-07 (recording/speaker labelling) was not implemented.
- The permanent signing key: the release workflow still requires and verifies the existing keystore; no new
  key was generated. No secrets, private chats or device data were committed.
