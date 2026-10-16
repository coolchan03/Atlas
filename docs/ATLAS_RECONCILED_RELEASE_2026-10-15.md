# Atlas 0.0.104 — Reconciled Android Release

Status: **release candidate** until the GitHub ARM64 signed APK, regression gate and signing fingerprint pass.
Source: `integration/atlas-complete-20261015`, followed by `atlas-voice` on publication.

## Why a new release is required

The preceding Atlas 60 APK used the stability-audit branch, which omitted features still held in the appearance/Workspace development branch. This release integrates the audit fixes with those newer features instead of publishing the older code again.

## Feature retention checklist

- Combined **Workspace** (Projects + Agents) and customizable navigation.
- **No Agent** default; existing conversations retain their selected agent.
- Project chat folders, chat search, message actions, model nicknames and appearance settings.
- New unified Android launcher and startup artwork.
- Project-shared knowledge files, project-aware research/study capabilities and manual nearby synchronization.
- Selective chat and project protection, private-chat behavior and PIN safeguards.
- Text/image engine compatibility checks and tested accelerator selection.
- User's official nine-item future-feature backlog, kept separate from shipped work.

## Reliability and privacy

- Includes the audited encrypted chat/project storage changes, backup handling and native model lifecycle fixes.
- Explicit GPU/NPU selections must never silently switch to CPU; automatic selection can use available backends.
- Public releases **never** package personal Therapy histories, eight private Therapy chats or personal shared knowledge files. Their private setup package must be imported on-device when separately available.
- Cloud backup, live camera, notification automation and other items in `FUTURE_RELEASES.md` are proposals, not shipping features.

## Required release gates

1. Run `node scripts/release/check-reconciled-release.cjs` to detect dropped navigation, icon and privacy modules.
2. Run TypeScript and the full Jest suite on the final combined commit; do not treat skipped tests as passes.
3. Build a release-signing-required ARM64 Android APK using the repository's permanent GitHub keystore.
4. Check all release native libraries, `apksigner verify`, and exact certificate identity.
5. Publish the signed APK as a versioned **non-prerelease GitHub Release** after all checks succeed.
6. Install/update on the Razr and onn tablet to validate on-device GPU/NPU behavior and data preservation. Automated tests cannot replace device acceptance.

## Build identity

- Android `versionName`: **0.0.104**; `versionCode`: **1784144538**.
- Release tag after passing gates: `atlas-official-v0.0.104`.
- Build: GitHub Actions → **Build Atlas APK**, using the complete reconciled commit.
- The previous unpublished `0.0.103` draft and the old Atlas 60 APK do not prove that newer features were retained.
