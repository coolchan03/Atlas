# Atlas 0.0.213 audit (changes since 0.0.209)

## What was checked, and by whom
- 0.0.206 to 0.0.208: independent line-by-line review plus all gates (`AUDIT_v0.0.206.md`, `AUDIT_v0.0.207.md`).
- 0.0.209 to 0.0.213 (this note): my own review of the full diff (`git diff 2cae6f70..HEAD`, 51 files) plus every gate. Not independently reviewed. The earlier independent pass found 12 issues in about 25 files of new code; treat a self-review of 0.0.209 to 0.0.213 as weaker evidence.

## Gates
TypeScript clean; ESLint 0 errors, 505 warnings; `knip` clean; `dependency-cruiser` 0 violations; route matrix and release contract pass; `npm audit --omit=dev` 0 findings; Metro bundle builds with the patch (185 assets); full Jest result in the version commit.

## Changes reviewed
| Change | Verdict |
|---|---|
| Icon fonts limited to Feather and MaterialIcons | Only those two are imported in `src`. Run 216 built and passed its release checks with it. |
| Removed the asset copy of `libstable_diffusion_core.so` | The app runs the copy extracted to `nativeLibraryDir` (`useLegacyPackaging = true`), the asset was only a fallback. Run 216 built and passed. Image generation on a phone is not exercised here. |
| `localeFilters = ['en']`, packaging excludes | Built in run 216. |
| npm: `image-size` 2.x + Metro patch, `uuid`/`xml2js` overrides | Bundle built with 185 assets. The patch makes Metro read the file instead of passing a path. Risk: a Metro upgrade silently drops the patch; `patch-package` fails loudly if it no longer applies, and `patchesMatchDependencies` needs `metro` declared (done). |
| Lint fixes (`--fix` removal of unused disables, 8 single returns, 3 regex escapes, `no-void` allowed as a statement) | Diff read line by line: behaviour unchanged (`[=]` equals `=`, hyphen at the end of a class is literal). Removing the `max-lines` disable in `ChatsListScreen` and `appStore` is accepted by the linter. |
| Debug Logs level filter, shared text builder | Rendered test. |
| Lean per-chip build (`atlasQnnChip`) | Not built yet: the asset ignore pattern syntax is untested until a run with `qnn_chip` set. Default path unaffected (property empty). |
| Cache restore/save split | Syntax checked; first real test is the next run. A save step runs `always()`; the image-engine save is guarded on the OpenCL engine existing. |
| GenieX removed | Nothing in `src`, `android`, the workflow or docs except the removal note and history. |
| Test limit 10 s to 30 s | Hides slow tests rather than fixing them; the word-search monkey test was also made lighter. |

## Open risks
- Publishing: run 216 built and verified the APK but `gh release create` returned 403 (see the run log). Needs a repository setting or the bot's branch.
- The lean build, cache saves and run-time image generation after removing the duplicate engine file are unproven until CI and a phone.
- 505 lint warnings, 776 `any`, see `OPEN_ITEMS.md`.
