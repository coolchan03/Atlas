# Open items (GitHub Issues are disabled on this repository, so they are tracked here)

1. **Per-chip QNN libraries.** Every APK carries the NPU libraries for V68, V69, V73, V75, V79 and V81 (about 50 MB compressed); a phone uses one. Options: download the matching set on first NPU image use, or a per-chip Gradle variant. See `native-runtime-inventory.md`.
2. **R8 shrinking.** The `-PatlasMinify` trial builds and is 7.3 MB smaller but has not been exercised feature by feature. Checklist in `r8-trial.md`.
3. **Lint and types.** About 626 ESLint warnings and 776 uses of `any`; trim one rule category at a time with the 0-error gate kept.
4. **Emulator screen-flow tests** in CI (none today).
5. **Metro `image-size`** (npm audit, high, build-time only): needs a Metro release that supports image-size 2.x. Version 2.x was tried and breaks asset bundling.
6. **GenieX** is parked (`geniex-integration.md`).
7. **Older CPU-feature builds of llama.rn** (about 25 MB compressed) could be trimmed, but some phones would run slower.
