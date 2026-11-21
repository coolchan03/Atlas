# Atlas 0.0.207: result of acting on the 0.0.206 audit

0.0.207 is the version made from `docs/AUDIT_v0.0.206.md`. Every finding in that audit was fixed or explained below, each with a test where the behaviour can be tested without a phone.

## Findings from the 0.0.206 audit

| ID | What changed | Test |
|---|---|---|
| F-1 | The speed history no longer imports the text engine (the engine registers its backend with it), the compare card gets its engines from `services/engineHandles.ts`, and the unused `voiceCompare.ts` is deleted. `dependency-cruiser` is back to the 3 violations inherited from 0.0.205. | gate |
| F-2 | Retests are scheduled per mode: one run that misses in all three modes waits 1 day, not 7. The model-alone mode only counts when it is the only mode ever run. | 4 new cases in `exams.test.ts` |
| F-3 | The controlling-authority warning is in the lesson prompt even when no passages were found. | `controlling.test.ts` |
| F-4 | Who the rules are for is read from the course title and topic, never one square's wording. | by construction (no test: the function is private to the service) |
| F-5 | Stop and the time limit now tell the running work it was cancelled (it makes no further model call and saves nothing), and the next lesson starts only after the model has stopped. | `generationQueue.test.ts` |
| F-6 | The open lesson switches to the in-depth version when it is saved. | `deepeningSwitch.test.tsx` |
| F-7 | A number and its unit must stay together: "35 years ... 21 percent" no longer matches "35 percent". While fixing this, a second bug turned up and was fixed: a dollar amount such as "$1,200" was rewritten as "1 dollars 200" before matching. | `exams.test.ts` |
| F-8 | Work through steps: the message is saved as soon as there is a plan, tools get the chat's project and a stop signal, a tool step is never retried, a failure after the plan ends in a saved explanation rather than a second send, and Stop ends it instead of sending the message normally. | `stepChat.test.ts` |
| F-9 | The keyword search reads up to 20,000 passages per project and reports a cut-off search as partial. | `retrieval.test.ts` |
| F-10 | The new screens use the project's `TYPOGRAPHY` and `SPACING` tokens. | gate |
| F-11 | A stopped GenieX reply now reports "Stopped." (Kotlin). iOS: Atlas ships for Android only and the JS service reports "not in this APK" without the module. | not compiled |
| F-12 | No direct `console` calls remain in `src` (11 in the document service, others in the hardware, download, CoreML and LLM services moved to the logger). | gate |

## Cleaning

- 186 function exports that nothing outside their own file used lost their `export` (the compiler and linter confirm nothing broke; 47 that tests or other modules reach by name were kept). `knip` unused exports: 311 to 128. The remaining 128 are real candidates for deletion or are reached by dynamic `require`; each needs a manual look rather than a blanket removal.
- Dependencies: nothing was changed. The remaining `npm audit` items (`markdown-it` and `linkify-it` slow-input issues through the markdown renderer, `image-size`, and `xmldom` in a build-time plugin) need major-version upgrades of the markdown renderer and the voice package; these should be done as their own tested change.

## Gates for this version

TypeScript clean; ESLint 0 errors; dependency-cruiser 3 (inherited); route matrix current; full Jest result recorded in the commit that bumps the version.
