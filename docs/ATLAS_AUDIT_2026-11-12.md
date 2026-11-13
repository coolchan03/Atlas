# Atlas audit, 2026-11-12 (build 0.0.158)

Scope: automated checks over the whole app, and a hand review of the code where a mistake costs the most. About 114,000 lines of
source were not each read by hand. Nothing was run on a phone, and the Android native build and Android lint ran only on CI.

## Checks run, all clean

TypeScript, ESLint (0 errors across source and tests), the dependency-rule check, the release contract, and 700 test suites
(8,006 tests). Coverage is 78% of lines. No hardcoded keys, no `eval`, no empty catch blocks, one TODO, one type-suppression comment.

## Fixed

| Finding | Why it mattered | Fix |
|---|---|---|
| The check that stops the model reading private network addresses could be bypassed (`http://x@127.0.0.1/`, `http://2130706433/`, hex or octal forms, IPv6-mapped forms, bare names like `router`) | A web page or document the model reads could tell it to fetch your router or another device on your network | Replaced with a tested address parser; a redirect to a private address is refused too |
| Plain `http://` pages were read over HTTP | Content could be read or changed on the way | Public http pages are read over https |
| Any two capital letters plus a number in a calendar event (for example "Review PR 42") counted as a flight | The daily briefing looked up flights that do not exist and sent calendar text to outside sites | A flight needs a known airline code, or a title about travel |
| Freezing rain was described as snow | Wrong briefing text | Codes 66 and 67 are now freezing rain |
| `offgrid://oauth` was registered as a link any web page can open, but nothing handles it | Unused attack surface | Removed from the manifest |
| The MCP SDK (high-severity advisory) was in `package.json` but never imported | Dead dependency | Removed |
| Two unused files | Dead code | Deleted |

## Reviewed and sound

- API keys for search providers live in the platform keychain, not in plain storage. Saved remote-server keys are stripped from storage.
- PIN-protected chats and projects use a separate hardware-backed Keystore AES-256-GCM key each, PBKDF2-SHA256 with 310,000
  iterations and a random salt for the PIN check, a constant-time compare, the verifier bound into the ciphertext, and wrong-PIN
  delays kept in the keychain.
- Self-update downloads over HTTPS from GitHub releases, and Android refuses an APK signed with a different key.
- The download-complete receiver only acts on downloads Atlas started.
- Office and EPUB files are read with text patterns, not the XML library that has advisories, and extracted files are deleted afterward.

## Not fixed, and why

- **Cleartext traffic is allowed app-wide** (`network_security_config.xml`). It is needed for local servers such as Ollama on
  any LAN address, which Android cannot list by range. The page reader now upgrades public pages to https; other code paths that
  fetch a public address should do the same.
- **Dependency advisories: 53** (4 critical, 23 high). Almost all are in development tools (Metro, the React Native CLI, Jest) and do
  not ship. Those that do reach shipped code are the markdown renderer (`markdown-it`, `linkify-it`: slow on hostile text) and
  `@xmldom/xmldom`. Updating them needs a build and a device check.
- **Unused native packages**: `react-native-executorch` (and its fetcher), `react-native-inappbrowser-reborn`,
  `react-native-get-random-values` and `@kesha-antonov/react-native-background-downloader`. Removing native modules can break the
  Android build, so this needs a build test first. 234 unused exports are mostly values exported only for tests.
- **A PIN is an access gate, not the encryption key.** The data key lives in the Keystore. A 4-digit PIN is the only thing that
  protects the per-chat portable seal inside an encrypted backup, so keep the backup passphrase strong.
- **A zip bomb** (a small Office file that expands enormously) is not limited when unzipped.
- **Low coverage where it matters**: the emergency screens (12 to 18%), maps (17%), the music player (10%), and the Office reader (5%).
- `src/learning/engine.ts` (640 lines) is on the project's size allowlist. Its model-calling helpers should move to their own file.

## Second pass (2026-11-13), after the multi-step helpers, music styles, voice sync and storage work

Gates run: `tsc --noEmit` clean, eslint 0 errors, dependency-cruiser clean, release contract passes, full jest passes.

Found and fixed
- **Release guard would have failed the build.** The roadmap check in `scripts/release/check-reconciled-release.cjs` counts exactly nine `FF-NN` items in `FUTURE_RELEASES.md`. Ten approved ideas had been appended there. They now live in `FUTURE_RELEASES_APPROVED.md` and the original list is back as written.
- **Zip bomb in voice packages.** `VoiceImport.unpack` had no limit on how much an archive may expand to. It now refuses more than 3 GB. The in-app voice download is capped at 2 GB. (Kotlin, not compiled locally; the release build compiles it.)
- **Interrupted workflow runs had no way back.** A run left running, or failed at a step, could not be resumed. The run screen now has "Carry on" and "Try this step again".
- **Duplicate Teach the AI subjects.** A second subject with the same name could be made and an empty one could not be deleted from the list. Same names now open the existing subject; each card has a delete.
- **Em dashes in on-screen text** (brand rule): 88 strings changed to a hyphen or a colon.
- **Unused exports** made private in `src/workflows`.

Checked and left alone
- Scheduled reminders made by the helpers run through `askModel`, which has no tools, so text from a pasted letter or transcript cannot make the app act. The person also sees every reminder before approving.
- Voice-sample sync accepts only lowercase 36-character ids, a 4.5 MB base64 cap, a checksum, and the engine's own voice-sample validation. It never overwrites a sample the phone already has.

Still open (unchanged or new)
- Deleting a cloned voice on one phone removes it from the other phone's list, but that phone keeps the sample file as an unused file.
- App-wide cleartext HTTP, 53 npm advisories, four unused native packages, and low coverage in a few screens (see the first pass above).
- The repeated first word after read aloud ends still has no cause; it needs a device log.
- None of the 2026-11-13 work has been run on a phone. The Android code for voice sync and downloads has not been compiled locally.

## Third pass (2026-11-14), before 0.0.160

Gates: `tsc --noEmit` clean, eslint 0 errors, dependency-cruiser clean, release contract passes, knip finds no unused files, full jest passes (720 suites, 8,242 tests).

Found and fixed while building
- **A screen that never finished drawing.** A selector in Practice returned a new array on every render, which makes the screen redraw forever. The test written for the new "Add your own questions" panel caught it before it shipped; the selector now picks the stored value and builds the list once.
- **A question bank would have been cut off.** Practice kept at most 600 questions, dropping known ones first. A real CPA bank is thousands, so the limit is 3,000.
- **Practice mixed projects.** Every project's questions were drawn together. Questions now carry their project, so REG, TCP, FAR and AUD stay apart; older questions with no project still show everywhere.
- **Music tunes were one loop of a chord and a wandering melody on one instrument.** They are now 16 bars in two sections with a band of several instruments, motifs, bass lines and drum fills. This was checked by tests on structure (a melody agrees with its chord, shapes repeat, drums fill the end of a section), not by ear.

Checked and left alone
- Selectors that return numbers or stored objects, not fresh arrays, in the new screens.
- Documents added from the course form, the board, Practice and CPA pages go through the same indexing as every other project document.

Still open
- The repeated first word after read aloud ends has no cause yet.
- None of the 2026-11-13 and 2026-11-14 work has run on a phone, and I cannot hear the music.
- App-wide cleartext HTTP, 53 npm advisories, four unused native packages, and thin coverage in a few screens (first pass).
