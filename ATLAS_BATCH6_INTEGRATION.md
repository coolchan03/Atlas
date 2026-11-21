# Atlas Batch 6: integration audit and release blockers
Date: 2026-10-12
Branch: atlas-audit-20261012

## What was inspected
- Repository tree under src/ and atlas/: no dedicated game source directories or game tests identified on the current audit branch. The requested 23 games must be scoped and implemented; they are **not** complete.
- GitHub Actions experimental APK builds through run 38297255459.
- Build 38297255459 failed during :atlasLlamaKt native linking with:
  ld.lld: error: unable to find library -lOpenCL
- Earlier Vulkan shader compilation problem had been addressed, but there is no successful release APK evidence.

## Required native build repair (BLOCKING)
1. Review pinned vendor/llama-kt OpenCL linking strategy and Android device-availability semantics.
2. Provide a valid NDK-compatible OpenCL loader/link library or use controlled dynamic loading without introducing a mandatory libOpenCL dependency on devices that lack it.
3. Ensure auto CPU/Vulkan fallback still works when vendor OpenCL library is absent.
4. Build arm64-v8a, inspect DT_NEEDED for libllamakt.so, verify package, libllamakt.so, diffusion binaries, signatures and install the experimental APK.
5. Test Vulkan/OpenCL text loading, image inference and model switching on actual Razr Ultra 2025 and tablet.

## Games status (BLOCKING for requested scope)
- The six-batch plan referenced 23 games, but no game module or game tests were found in this checkout.
- Define the titles and acceptance tests from the original audit/source document, then implement each as distinct reproducible checkpoints. Do not declare games complete based only on unrelated app improvements.

## Other unresolved release blockers
- ATLAS_DEFERRED_SECURITY.md: encryption at rest, individually PIN-protected encrypted chats, end-to-end sync and encrypted backups.
- ATLAS_BATCH4_VERIFICATION.md: image models, LoRA/upscalers, interrupted downloads and device Vulkan/OpenCL checks.
- ATLAS_BATCH5_VERIFICATION.md: voice, offline maps/GPS, study/podcasts and Field ID device validation.
- Full cross-feature regression suite and working installable signed experimental release remain unverified.

## Policy
- All edits and GitHub pushes only through Tunnel to Surface.
- No full native APK build per small commit. Use explicit workflow dispatch at release checkpoints.
- Source patches, integration tests, APK builds and device tests are separate proof levels.
