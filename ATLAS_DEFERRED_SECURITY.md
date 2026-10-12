# Atlas audit: deferred security work (Batch 3)

Status: INCOMPLETE. Android device-bound AES-GCM chat persistence implemented in commit 8ebad3c, with guarded plaintext migration and JS unit tests. Native compilation, device migration and fail-closed behavior still require verification. Per-chat PIN, transferable encrypted backup and encrypted device sync are still missing.

## SEC-01: Encrypted chat persistence (required)
- Replace plaintext AsyncStorage conversation persistence with audited authenticated encryption (AES-256-GCM or XChaCha20-Poly1305) backed by a maintained native Android/iOS cryptographic provider.
- Generate a random per-installation data encryption key; wrap/protect it using Android Keystore / iOS Keychain. Never store plaintext key material beside ciphertext or derive encryption directly from a short PIN.
- Define versioned encrypted payloads with nonce, algorithm, version, key ID, and authentication tag. Authenticate store identity/version as associated data.
- Migrate old unencrypted chat records atomically and resumably. Verify round-trip decrypt before deleting old plaintext; fail closed if keys are unavailable. Back up or document migration failure recovery.
- Exclude plaintext copies in logs, caches, search indexes, crash reports and backups. Account for attachment files, not just message strings.
- Add unit/Android tests for wrong keys, modified ciphertext, key loss, migration interruption, reinstall, and private-mode chats.
- Completion: verified on physical Android phone and tablet; no readable message content remains in on-disk persisted state.

## SEC-02: Per-chat PIN lock (required)
- Add per-conversation lock state, unlock flow, secure PIN verifier (memory-hard KDF with random salt), attempt throttling, background re-lock and biometric option if available.
- Encrypt protected conversation payload with a random per-chat key wrapped by the platform key store and appropriate authentication policy.
- Avoid displaying protected chat previews in lists, notifications, search, backups, and recents. Test lifecycle, process kill, and device reboot.
- Never treat isPrivate (currently excludes conversation from persistence) or the app-wide passphrase as encryption.
- Completion: verified lock, unlock, persistence, recovery and device tests.

## SEC-03: Encrypted cross-device sync (required)
- Define sync transport (Tailscale/direct peer discovery), pair devices with out-of-band confirmation and authenticate both ends.
- Use end-to-end encryption with distinct device keys and authenticated key agreement; server/relay cannot read chats or PIN-locked records.
- Version records and implement retry, conflict handling, deletion tombstones and interrupted-transfer recovery.
- Sync encrypted protected payloads without disclosing contents to unpaired devices.
- Test tampered messages, replay, pairing revocation, offline recovery and conflicts on both Android devices.
- Completion: phone/tablet end-to-end tested. No enabled sync controls until verified.

## SEC-04: Encrypted backup (required)
- Current backup uses readable JSON; user receives a warning. Add optional passphrase-protected, authenticated, versioned backup format.
- Use memory-hard passphrase KDF with per-backup salt; fail if authentication fails, do not restore partial data.
- Clarify encrypted backups are independent of online sync and that the user must preserve recovery credentials.

## Existing partial protections (do not mislabel as finished)
- App passphrase and provider secrets use Keychain.
- Backup export excludes selected secret fields/storage keys and import restricts approved keys.
- Import validates backup version, structure and maximum 50 MB input.
- Private-mode chat records are filtered out of AsyncStorage, not encrypted.
- Security UI explicitly warns that ordinary persisted chats are not encrypted.

## Next batch rule
Proceed with Batch 4 (models/image) without waiting for hour-long APK builds. Revisit SEC-01 through SEC-04 as an explicit security integration milestone before claiming final release readiness. GitHub edits ONLY via Tunnel to Surface. Test, commit and push each meaningful checkpoint.
