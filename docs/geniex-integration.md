# GenieX (Qualcomm) integration status

**Status: parked.** GenieX is text-only (no tools, vision or MTP), runs on two chips, and adds 89 MB. It is not in the shipped APK and gets no further work until Qualcomm adds those features. What remains is the flag-gated trial (`-PatlasGeniex=true` / the `geniex_trial` workflow input) so it can be measured later. The default build carries only the do-nothing stub.

## What GenieX is
Qualcomm's open on-device runtime: llama.cpp plus the Qualcomm AI Runtime, running GGUF models on the CPU, Adreno GPU or Hexagon NPU, and pre-compiled Qualcomm AI Hub bundles on the NPU. Android artifact: `com.qualcomm.qti:geniex-android:0.10.0` on Maven Central. Status: developer preview.

## Licence (checked from the artifact and Qualcomm's pages)
- The SDK is BSD 3-Clause, and its POM also lists the Qualcomm Terms of Use. No fee or royalty is stated anywhere.
- The AAR bundles Qualcomm's runtime libraries. Neither the repository page nor the docs reproduce their redistribution terms: confirm them on the Qualcomm AI Engine Direct page before publishing a build that contains them.
- Models are separate: Qualcomm AI Hub bundles and Hugging Face models each carry their own licence, and some are gated. Atlas does not download any.

## What was integrated
- `AtlasGeniexModule` (always compiled, imports nothing from GenieX) and `GeniexEngine`, with the real engine in `android/app/src/geniexOn` and a do-nothing stub in `src/geniexOff`. A normal build uses the stub: no new library, no size change, `geniexStatus()` says "not in this APK".
- `-PatlasGeniex=true` adds the dependency, selects the real engine, and allows the library's minSdk 27 in the manifest.
- `src/services/geniexEngine.ts` (status, load a GGUF on the NPU or CPU, stream a reply with GenieX's own timings, stop, unload) and `src/services/engineCompare.ts` (runs the same prompts through two engines and produces the figures `compareEngines` needs).
- The `Build Atlas APK` workflow has a manual `geniex_trial` input. A trial run never publishes and uploads its APK under its own artifact name.

## Facts that decide whether it ships
- Chips: the SDK documents only the Snapdragon 8 Elite (SM8750) and 8 Elite Gen 5 (SM8850) for Android. On any other chip Atlas reports why and uses llama.rn.
- Size: the AAR is 89 MB compressed (221 MB unpacked) for arm64. That is added to every APK built with the flag.
- No file-name clash with llama.rn's libraries in the APK (llama.rn keeps its `libggml-htp-*` files in assets; GenieX ships its own, different builds, in the library folder). Whether the two engines can run in one process, and which `ADSP_LIBRARY_PATH` wins, is untested.
- Not yet run on a phone, and not yet compiled: the Kotlin was written against the AAR's public signatures (read with `javap`) and the SDK's documented usage.

## Decision rule
Run the trial APK on a Razr Ultra 2025, load the same Q4_0 GGUF in llama.rn (best backend) and GenieX, and use `measureEngine` + `compareEngines` (at least 5 replies each, same prompts). Adopt GenieX as an option only if the verdict is `replace`, vision/tools/MTP/Q4_0 still work, and the QAIRT redistribution terms are confirmed. Until then it stays a trial build.
