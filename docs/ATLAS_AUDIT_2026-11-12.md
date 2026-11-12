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
