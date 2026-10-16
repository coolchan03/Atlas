# Atlas offline peer synchronization — audit implementation

## Current implementation
- **Off by default.** Settings → Offline device sync must be enabled on both devices. No cloud or Internet is required.
- **Pairing:** Settings generates a short-lived, scannable QR containing the inviter device ID, current local IPv4 address, local port, and a 256-bit random pairing secret. Android camera QR scans can open `atlas://sync`; the app asks for explicit pairing approval.
- **Local transport:** Encrypted TCP between private local IPv4 addresses. Devices must be on the same Wi-Fi/hotspot or an **already-established** Wi-Fi Direct network. Paired devices sync at approximately one-minute intervals while Atlas is in the foreground on both devices, with a manual Sync option.
- **Encryption:** Each packet uses AES-256-GCM with a per-pair 256-bit secret. Peer secrets are encrypted at rest using Android Keystore; unpairing revokes future connections. QR invitations expire in 10 minutes; packets include timestamps and replay-detection nonces. No account or server involved.
- **Content:** Ordinary saved conversations, unprotected projects, agent settings, and project knowledge-base file bytes plus indexed excerpts. Duplicate project files are skipped and divergent versions are preserved separately. Conversation/project/agent conflicts retain a renamed copy.
- **Excluded deliberately:** PIN-protected chats/projects, private/unsaved chats, downloaded model weights, phone-specific attachment/audio paths. Project files are limited to 25 MB total per transfer.
- **Failure behavior:** Failed or unavailable peers are retried on reconnection; backups remain separate from sync, not overwritten. The listening socket stops on app background or sync off.

## Limits and release blockers
1. This first native implementation uses a **local IP socket**, not standalone Wi-Fi Direct discovery/formation. Users must connect both devices to the same Wi-Fi/hotspot, or create the Wi-Fi Direct network using Android first.
2. **Bluetooth transfer is not implemented.** Do not claim Bluetooth fallback, BLE discovery, or background sync is available.
3. Chat-local image, attachment and voice files are not portable yet; only project knowledge-base documents carry their original bytes.
4. Deletions of whole chats, projects and agents now propagate through persisted tombstones; newer offline conflicting edits are retained as recovered copies. Individual message-level deletions are still not distributed as independent tombstones, so a deleted message may remain in a conflicting transcript on the other device.
5. Local file transfers are limited to a maximum 25 MB of knowledge-base documents; large project file sets produce a descriptive error, not a silently incomplete transfer.
6. Pairing requires both devices foregrounded. Native Android device-to-device QA, performance on phone and tablet, repeated pairing, disconnect/reconnect, and Android OS upgrade/key-loss recovery remain necessary.
7. Full Jest baseline remains at 16 failing and 21 skipped tests in the last complete run; this branch cannot be labeled stable solely because the focused nearby-sync tests pass.

## Test checklist
- Pair phone ↔ tablet with QR (without Internet) while both use same Wi-Fi.
- Verify chats, agents, project metadata, and project documents on both devices.
- Edit same project on both devices offline; reconnect and confirm neither edit is lost.
- Ensure private chat and individually PIN-protected items never cross devices.
- Reopen both apps and verify remembered peers reconnect; disable and unpair then verify data is no longer transferred.
- Repeat on Wi-Fi hotspot and already-connected Wi-Fi Direct; test denied permissions and unavailable network.
- Measure 25 MB transfer and disconnected retry; check that other app data is not deleted.
- Validate native Android Gradle compilation, signed APK installation, and foreground lifecycle handling.
