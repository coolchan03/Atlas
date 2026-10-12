# Atlas Batch 5: voice, offline maps, study and field tools

Status: source hardening checkpoint completed; Android integration validation pending.

## Source changes pushed
- 52edbcb: Validate mapsforge map download paths before constructing URLs and local file paths.
- 39c6814: Reject invalid GPS latitude, longitude and accuracy readings, including cached locations.
- b3f6b0c: Prevent stale TTS failures from clearing a newer utterance; reject incomplete multiple-choice quiz outputs.

## Remaining verification and enhancements
- Verify TTS start/stop/routing and speech continuity during real Android background/foreground transitions, including hands-free and neural voices.
- Verify GPS permission denial, sensor disabled, invalid fix recovery, waypoint handling, and offline .map rendering on the phone/tablet.
- Verify study quiz/flashcards/citations against actual imported documents; add source-reference validation and user-visible recovery for malformed model output.
- Verify generated podcasts/slides and requested audio/video export against supported device codecs.
- Verify Field ID/compass safety flows using real sensor readings and camera captures. Photo identification must not label wild plants/mushrooms safe to consume.
- Track any feature requiring native build and physical device; do not mark those as implemented solely from passing TypeScript/Jest.
- Do not trigger a full native APK for every audit commit; use an explicit build checkpoint.

## Next checkpoint
Batch 6: game feature implementation and full integration. Final release remains blocked by deferred encrypted storage/sync and pending native/device tests recorded in ATLAS_DEFERRED_SECURITY.md and ATLAS_BATCH4_VERIFICATION.md.
