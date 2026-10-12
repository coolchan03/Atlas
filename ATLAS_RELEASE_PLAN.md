# Atlas release readiness plan — October 12, 2026

Working branch: atlas-audit-20261012
All GitHub edits and operations MUST use Tunnel to Surface.

## Step 1 of 4 — Build an installable experimental APK (IN PROGRESS)
- Repair native ARM64 Vulkan build. The last confirmed failure was mandatory -lOpenCL in optional llama.kt CMake; Atlas already has a separate llama.rn OpenCL runtime.
- Run deterministic vendor CMake preparation before CMake configure; preserve llama.kt Vulkan and CPU, leave llama.rn OpenCL/HTP intact.
- Dispatch experimental APK workflow manually. Do not trigger a new hour-long APK build for every source change.
- Require a successful assembly, verification of libllamakt.so and diffusion libraries, APK signing, successful artifact upload, and install test. Do not call this step complete until these pass.

## Step 2 of 4 — Complete critical security (NOT STARTED)
- Implement authenticated encryption at rest and safe migration from existing plaintext chat storage.
- Implement per-chat PIN protection with secure key management; add encrypted backups and authenticated end-to-end cross-device sync.
- Run migration/key-loss/tamper tests and verify on phone and tablet.
- See ATLAS_DEFERRED_SECURITY.md for detailed acceptance criteria.

## Step 3 of 4 — Finish requested features and hardware validation (NOT STARTED)
- Validate model imports, LoRA/ESRGAN, Vulkan and OpenCL diffusion, text NPU/CPU fallback, flexible context and interrupted downloads on real devices.
- Verify voice/maps/GPS/study/Field ID behavior using ATLAS_BATCH4_VERIFICATION.md and ATLAS_BATCH5_VERIFICATION.md.
- Scope and implement requested 23 games. No dedicated game module was found in the inspected branch; games are not complete.

## Step 4 of 4 — Full regression, release and handoff (NOT STARTED)
- Run static/unit/integration and Android tests plus device smoke tests. Resolve release-blocking failures.
- Review privacy claims, required permissions, artifacts, reproducibility and signed release strategy.
- Merge the tested branch and publish the stable release APK with changelog and rollback instructions.
- Do not promote an untested experimental APK to stable release.

Progress policy: list exact step, last committed SHA, verification evidence and next command. A source commit is not proof of a successful APK or device behavior.
