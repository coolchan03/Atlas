# Atlas — Claude audit handoff (2026-10-12)
Repository: coolchan03/Atlas
Audit branch: atlas-audit-20261012
Access requirement: ALL GitHub modifications and reads must use Tunnel to Surface.
This is an experimental release candidate, not a stable release.

## Requested UI and agent changes: source status
- Teacher, Friend, Jock/Boyfriend built-in agents; existing installations should receive new presets without replacing edited agents. See src/stores/agentStore.ts.
- Hold-to-manage chat rows on Chats and Home: Archive / Delete and unarchive on the archive view. Test long press doesn't accidentally navigate.
- Chats list supports viewing archived conversations; Home Recent excludes archived conversations. Check against stale store selectors.
- Compact chat header prioritizes active model label; project, agent and model selection consolidated into Chat Settings.
- Conversation stores its chosen agent ID; new chats default to Atlas. Chat Settings can switch the agent. Check restored agent across navigation and relaunch, and model change still works.
- New Chat asks Regular vs Private BEFORE creating the conversation; private mode is excluded from chat persistence and is not switchable from existing-chat header. Verify that no private message ever reaches persistent storage. Private mode is not a substitute for encrypted PIN.
- Audio/phone-call mode adds concise speech instruction (~1–2 spoken sentences) and caps generation to 96 tokens. Test with a slow local model and tool calls.
- Chat archive and private mode are different concepts; archiving must never delete stored messages.

## Native and encryption work
- Earlier native APK pipeline run 38302260479 passed and uploaded atlas-native-image-experimental-apk (218438617 bytes), but this APK PREDATES the new AES-GCM persistence and UI changes.
- Android Keystore-backed chat AES-GCM at rest added in src/stores/encryptedChatStorage.ts and AtlasDeviceModule.kt. JS checks the ciphertext round trip, migrates older plaintext, and refuses plaintext fallback when the native bridge is unavailable.
- Investigate persistence performance, asynchronous write order, migration interruption, concurrent writes, tamper detection, reinstall/key loss, Android upgrade and Android Keystore failure behavior.
- New chat source uses deduplication and serialized encrypted writes; verify under token streaming and rapid navigation.
- Existing plaintext JSON backup intentionally excludes chats. THIS IS NOT a transferable encrypted chat backup.

## Outstanding release blockers — do not classify as complete
1. Per-chat PIN and individually encrypted/locked chat UX.
2. Passphrase-protected, portable encrypted backup and restoration.
3. Authenticated end-to-end cross-device sync for Razr Ultra + Android tablet (Tailscale/direct).
4. Requested 23 games were not present in the inspected Atlas source; game scope and implementation still missing.
5. Current updated APK must compile, install, migrate chats without loss, and pass on-device Vulkan/OpenCL/HTP/text/image, LoRA and UI tests.
6. Source changes to audio mode are unverified on a device; text length and model latency should be measured.
7. iOS encrypted chat storage has not been implemented; the current Android-only adapter intentionally rejects platforms without the native crypto bridge.

## Claude audit instructions
- Review each changed file and its call sites, not just tests.
- Prioritize crashes, irreversible chat loss, private-chat leaks, native build failures, incorrect agent persistence and Android modal navigation.
- For each finding: severity, file:line, reproduction, impact, exact patch, and automated/on-device test.
- Do NOT claim release readiness until all blockers are resolved or explicitly removed from release scope by the user.
- Preserve the tunnel-only GitHub workflow and existing source branch; do not merge to upstream original repository.
- See ATLAS_RELEASE_PLAN.md, ATLAS_DEFERRED_SECURITY.md, ATLAS_BATCH4_VERIFICATION.md, ATLAS_BATCH5_VERIFICATION.md and ATLAS_BATCH6_INTEGRATION.md.
