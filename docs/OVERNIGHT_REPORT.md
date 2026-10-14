# Overnight report

Branch: `claude/atlas-gpu-npu-audit-mgklqk`. Nothing was merged and no pull request was opened.

## Finished

1. **Branch state.** The head at the start (`3d5fc980`) had a green build (run 49) and nobody had pushed since. No review fixes were needed there.
2. **Release signing.** The release build now signs with your keystore when the four secrets exist (`ATLAS_KEYSTORE_BASE64`, `ATLAS_KEYSTORE_PASSWORD`, `ATLAS_KEY_ALIAS`, `ATLAS_KEY_PASSWORD`) and falls back to debug signing when any is missing. No key was created or committed. Steps and the uninstall/reinstall warning are in `docs/RELEASE_SIGNING.md`.
3. **Save as video.** Study > Video (slides) has "Save as video". The voice chosen in Settings (natural voice or the phone's own) is rendered to WAV per slide, slides are drawn to 1280x720 frames, and the native module `AtlasVideo` encodes H.264 + AAC with MediaCodec/MediaMuxer into `Movies/Atlas` (MP4). It shows progress, can be cancelled, and offers Share and Play. Fully offline. Needs Android 10 or newer. PIN-protected projects ask before saving outside the lock.
   Limits: slides only (podcasts are not exported); plain text slides on a dark background, no images or animation; 5 frames per second since slides are static.
   **Never run on a phone yet.** The Kotlin compiled in CI, but the encoder has not been exercised on a device. Test it first.
4. **Encryption gaps.**
   - (a) PIN-protected projects can now have documents. Text, names and embeddings live in one encrypted vault file per project (`atlas-protected-docs/`), never in rag.db. Protecting a project moves its existing documents into the vault, then erases the plain index (rag.db now uses `secure_delete`). Removing protection moves them back. Tests check no plaintext reaches rag.db, AsyncStorage or the files. Because chats and Study results are stored outside the lock, Study, offline research and "save report to project" stay switched off for protected projects, with a clear message.
   - (b) Encrypted (password) backups now carry locked chats still locked. A chat that is open when you back up is re-sealed with a key derived from its PIN and opens on a new phone with that PIN. A chat that is still locked is saved as its on-phone ciphertext, which only restores on the same phone (Settings says so). Backups no longer turn locked chats into normal chats. Restore refuses entries with readable messages.
5. **Vulkan chat.** llama.kt has neither tool calling nor picture input, so the UI and errors now say so and point to OpenCL, Automatic or CPU. Atlas never switches your choice by itself.
6. **Font and text size without a restart.** `Text` and `TextInput` are wrapped at startup so inline and static styles follow the choice immediately. Nested text keeps inheriting from its parent.
7. **Bug hunt.**
   - Pictures from private or PIN-locked chats leaked into the Gallery, the home image count, the saved image list (with the prompt) and the disk re-scan. They are now hidden; pictures from private chats are deleted at the next start.
   - A database error when starting download progress polling could crash the app (listed in `docs/PENDING_FIXES.md`); now caught.
   - An independent read of the new code found nine issues; the real ones (nested text, shared files, SQLite free pages, failure cleanup, unlock/relock race, picture purge retry, TTS error code) are fixed.

## Not done / known gaps

- Portable locked-chat backups depend on the PIN: someone with the backup password could brute-force a 4-6 digit PIN offline. Use a long backup password.
- Restoring a "still locked" chat on a different phone fails with a generic wrong-PIN error.
- A protected project's documents cannot yet feed chats, Study or research (those outputs are stored unencrypted).
- Video export has no podcast version and no images.
- Release-signing and video export need a real phone to verify.

## Decisions

- Vault key uses the existing "project" key kind with id `<projectId>-docs`, so no Kotlin crypto change.
- Video voice follows Settings; the speed uses the app's speech-rate setting.
- Locked-chat backup uses the existing password-backup cipher with `PIN:atlas-locked-chat:<id>` as the passphrase.

## What you must do

- Add the four signing secrets only if you want a real key (see `docs/RELEASE_SIGNING.md`). Back up first: switching keys needs one uninstall/reinstall.

## Test on the phone first

1. Study > Video (slides) > Save as video: watch progress, cancel once, then let one finish; play it, check sound and slide timing, share it.
2. Settings > Appearance: change font and size; every screen should change at once (check a chat, Settings, Study).
3. Protect a project that has documents; lock, unlock, search the documents, add one, remove protection.
4. Lock a chat, make an encrypted backup while it is open, restore on a clean install, open it with its PIN.
5. Generate a picture inside a private chat; it must not appear in the Gallery.
6. Chat on Vulkan with tools on: the message should tell you to use OpenCL, Automatic or CPU.

## Follow-up: Study additions

- **Hour-long podcasts.** Length choices go up to 60 minutes (cap 90). Each part of about 1.5 minutes is its own model call, so an hour needs the same context as a short episode (about 3000 tokens; the screen warns below that). A long episode is planned a dozen parts at a time with the parts so far in view, and every part reads passages found for its own topic, so it does not loop over the same sources. "Stop and keep what is written" ends it early. Expect roughly 0.6 to 2 minutes of writing per minute of audio on a phone; keep Atlas open and plugged in.
- **Study guide and formula sheet.** The study guide already existed; it and the new Formula sheet can now be shared or saved as a Markdown file (you pick the folder).
- **PowerPoint.** Slides (renamed from "Video (slides)") can be saved as a real .pptx, built on the phone with no library: a title slide, one slide per Study slide, and a sources slide. It opened in python-pptx and rendered in LibreOffice here; not yet opened in PowerPoint itself. Speaker notes are not included.
- **Three more games:** Word scramble, Prize ladder (10 rungs, safe spots, 50:50 / Skip / Source lifelines, walk away) and Fix the mistake.

## Follow-up: bottom bar and stability

- **Bottom bar.** Settings > Appearance > Bottom bar: choose up to 5 destinations (at least 2, Settings always stays), reorder them, hide the labels, reset. Off by default now: Models. Optional shortcuts that open full screens: Emergency, Library, Daily brief, Compass, Phrases, Manual. Models is still reachable from Home and from a new Models row in Settings. Also new: Appearance > Feel > vibration on or off.
- **Stability pass.** A second independent read found a corrupt-PowerPoint bug (the zip library drops folder names when given folders separately; now the whole folder is zipped), icons growing with the text-size setting (icon fonts are now left alone), a podcast that kept writing after leaving the screen, no ending when stopped early, and repeated 3000-chunk reads on long episodes. All fixed with tests.
- Still not run on a phone: video export, PowerPoint opened in PowerPoint itself, the global text wrapper on a real device.
