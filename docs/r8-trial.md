# R8 (code shrinking) trial

Not enabled for published builds. R8 removes and renames Java/Kotlin code it thinks is unused. Atlas calls native libraries (llama, whisper, sherpa-onnx, QNN, Vulkan, LiteRT) and the React Native bridge by NAME, which R8 cannot see, so a build that shrinks too much compiles fine and then crashes or silently loses a feature on a phone.

## What exists
- `-PatlasMinify=true` turns on `minifyEnabled` and `shrinkResources` for the release build type only (`android/app/build.gradle`). Without it nothing changes.
- `android/app/proguard-atlas-native.pro` keeps native methods, React Native modules and `@ReactMethod`s, all of `ai.offgridmobile.**`, and the native engines' Java halves. It was written from the dependency list, not from a failing build, so expect to add rules.
- The `Build Atlas APK` workflow has a manual input `minify_trial`. A trial run never publishes a release and uploads its APK as a workflow artifact only.

## How to run the trial
1. Run the workflow by hand on the branch with `minify_trial` ticked (leave `publish` off).
2. Compare the APK size with a normal build of the same commit (`unzip -l`; compare `classes*.dex` and total).
3. Install the trial APK and run every feature that has native code: chat on CPU, OpenCL and NPU backends, vision, tool calling, speech-to-text, text-to-speech and voice cloning, image generation (MNN and QNN), music, downloads, ZIP import, offline library, maps.
4. A crash in `adb logcat` that mentions `ClassNotFoundException`, `NoSuchMethodError` or `UnsatisfiedLinkError` means a missing keep rule: add `-keep class <name> { *; }` and repeat.
5. Only when every feature works, decide whether the size saved is worth turning it on. Expect the saving to be small next to the native libraries (hundreds of MB), which R8 does not touch.

## Result of the first trial (0.0.207 code, build 210)
It built. The zipped build file is 234,857,281 bytes against 242,154,534 for the normal build of the same code: 7.3 MB smaller (3.0%), which is small because the native libraries (376 MB unpacked) are not touched by R8. The shrunk app has not been run on a phone, so `-PatlasMinify` stays off for published builds. If the saving is wanted, the trial APK has to be exercised feature by feature first (the list in this file).
