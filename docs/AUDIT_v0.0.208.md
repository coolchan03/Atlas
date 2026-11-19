# Atlas 0.0.208: finishing the partly done work

Built on 0.0.207 (all of `AUDIT_v0.0.206.md` fixed). This pass finished what the earlier summary listed as partial or missing, and measured what could be measured from CI.

## Done in this version
| Item | Result |
|---|---|
| Native sizes from a real APK (8.4) | Measured from the 0.0.207 release APK: 252,073,591 bytes compressed, 615.7 MB unpacked, 376 MB of it native libraries. Table in `docs/native-runtime-inventory.md`. |
| Calls: cloned voices (4.2) | An agent with its own voice now streams sentence by sentence: the agent voice loads first, the stream starts after it, and a barge-in while it loads leaves the reply unspoken. Tests for loading, failing to load, and stopping meanwhile. |
| Backend speed (6.1) | The tuner ("Find the best settings") keeps each backend's speed apart, so the history that Automatic uses to pick the fastest backend fills in from a tune. |
| Tablet / rotation (6.3) | PIN screens keep their field above the keyboard (`KeyboardSafeView`); bottom sheets and dialogs follow the current window and stay at a readable width; the gallery has more columns on wide windows. |
| Voice (7.1) | Voice Lab has one-tap sentences for the known weak spots ("I", "I'm", numbers, long prose, dialogue). Comparing other voice engines still needs those engines installed. |
| Dead code (8.6) | 28 exports that nothing referenced anywhere were deleted, with the state they left behind. `knip` unused exports: 311 at the start of the cycle, 102 now. |
| Build speed (9.1 to 9.3) | `apk` workflow: reuses a green "Atlas Core Audit" run for the same commit instead of running the 5-minute Jest suite again, uploads Gradle task timings, and checks the built APK's package, version name and version code. The Vulkan tools install is retried (a mirror timeout failed one build). |
| Dependencies | `markdown-it` 14 and `linkify-it` 5 forced in (slow-input fixes) and `xmldom` replaced by its maintained fork: `npm audit` 18 findings to 13, none critical. What is left: `image-size` (the bundler's, build time), moderate and low items in the CLI tools. |

## Caught by the tests during this pass
The dead-export scan looked in `src`, `__tests__` and `scripts`, but not the root `App.tsx`, which calls `recoverKnowledge()` at start-up. Deleting it would have crashed boot. The boot test failed, the function was restored, and the scan was re-run over the whole repository for the other 27 names (none are used outside `src` and the tests). Lesson recorded: any future dead-code removal must search the root files too.

## Trial builds (artifact only)
- R8 shrinking trial: result recorded below when CI finishes.
- GenieX trial: the first run failed in the apt step for an unrelated mirror timeout and is re-run on this version.

## Still open
Voice engine comparisons with the real engines installed; Qualcomm's redistribution terms for the GenieX runtime libraries; 102 unused exports that need a human look; a Swift/iOS counterpart is not needed (Android only); `npm audit` leftovers that need bundler upgrades.
