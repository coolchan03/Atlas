# Open items (GitHub Issues are disabled on this repository, so they are tracked here)

1. **Per-chip QNN libraries.** A chip-specific lean build now exists (workflow input `qnn_chip`, Gradle `-PatlasQnnChip=V79`, never published; not yet built or run on a phone). The published APK still carries the NPU libraries for V68, V69, V73, V75, V79 and V81 (about 50 MB compressed); a phone uses one. Options: download the matching set on first NPU image use, or a per-chip Gradle variant. See `native-runtime-inventory.md`.
2. **R8 shrinking.** The `-PatlasMinify` trial builds and is 7.3 MB smaller but has not been exercised feature by feature. Checklist in `r8-trial.md`.
3. **Lint and types.** About 505 ESLint warnings (282 nested template literals, 182 bitwise operations in hashing/audio code, 24 hook dependency lists) and 776 uses of `any`; trim one rule category at a time with the 0-error gate kept.
4. **Emulator screen-flow tests** in CI (none today).
5. **Metro patch** (`patches/metro+0.83.3.patch`): lets Metro read assets with image-size 2.x; drop it when Metro itself moves to image-size 2.x. `npm audit` is at 0 findings.
7. **Older CPU-feature builds of llama.rn** (about 25 MB compressed) could be trimmed, but some phones would run slower.
