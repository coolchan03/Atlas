# Atlas device verification (to run on real hardware)

Everything below is **NOT RUN**. These checks need a Motorola Razr Ultra 2025 (Android 16), an onn Pro 13.2 inch tablet (Android 16), a 16 KB page size emulator and a clean emulator. Fill in a result only from a real run. The signed APK from the release job is the one to test, not a debug build.

## Per-route acceptance
See `docs/ATLAS_ROUTE_MATRIX.md` (67 routes, all "not tested"). Regenerate with `node scripts/route-matrix.cjs`.

## Native and platform checks
| Check | How | Result |
|---|---|---|
| 16 KB page size | `node scripts/verify-16kb-alignment.cjs` on the release APK, then install and start it on the 16 KB emulator; run text, image, TTS and audio | NOT RUN |
| Upgrade from the last public build | Install the previous release, add chats, a project and a course, update over it | NOT RUN |
| Downloads | Download a model over a slow link; interrupt it; resume; try a wrong checksum | NOT RUN |
| Android ending the app | Start a document import, force-stop Atlas, reopen: the Task center shows the job as interrupted, items already added are kept and not duplicated | NOT RUN |
| Share, backup, sync | Encrypted backup round trip; nearby sync between phone and tablet, including a store replaced by the other phone (Storage shows "Replaced by sync") | NOT RUN |
| Compass level | Lay flat, tilt, rotate, face down: two circles move and meet at 0, the angle is readable, no flicker near level | NOT RUN |
| Extra rounded appearance | Appearance, Corner roundness, "Extra rounded": buttons are pills, icon buttons circles, cards keep their corners; check light and dark, large font, landscape | NOT RUN |
| Tablet panes | Open a course board on the tablet: drag the divider, rotate (panes stack in portrait), restart (the split is remembered) | NOT RUN |
| TalkBack | Walk Home, Chat, Practice, Task center, Storage: every control is reachable and labelled; the pane divider adjusts | NOT RUN |
| Voice | Record a long sample with a pause and some background noise: the chosen 12 seconds are the clean, steady speech; listen at each quality level | NOT RUN |

## Baselines to measure (do not estimate)
Cold and warm start, screen transition p50 and p95, time to first token (local and remote), sustained tokens per second with the backend actually used, peak Java and native memory, model load and unload time, text to speech first-audio delay and the gap between briefing cards, speech to text time and word accuracy on a sample, frame rate in chat, memory and disk peaks for a 1 GB import, battery and heat after 15 and 30 minute sessions. Record the APK build, device, Android version and date with each number.
