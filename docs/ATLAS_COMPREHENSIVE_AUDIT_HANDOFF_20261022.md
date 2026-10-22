# Atlas — Comprehensive Engineering Audit and Final Release Handoff
**Prepared:** October 22, 2026
**Project:** Atlas (offline-first Android AI chat, images, projects, tools, emergency features)
**Repository:** https://github.com/coolchan03/Atlas
**Working development branch:** `atlas/build81-health-connect`
**Use latest HEAD:** Never assume the branch has remained at the earlier verified `7e9862899905388917e4f0a8dd04c0a1609b72f5` commit.
**Surface local working tree:** `P:\AI Projects\Atlas-Vulkan-Experimental`
**Connection:** `@new-tunnel`, not the deprecated tunnel.

## YOUR MISSION — PERFORM AN AUDIT AND FIX WHAT YOU FIND
Take over the existing Atlas development branch. Conduct a comprehensive **source-code, architecture, performance, navigation, visual consistency, native-device, permission, and release audit**. Fix real deficiencies, test the changes, and push commits to the same development branch. Do not merely propose another roadmap. Do not treat passing a unit test as equivalent to a verified feature working on a phone.

The owner specifically wants Atlas clean/organized, fast, responsive, consistent, easy to navigate, and able to **actually change its fonts on Motorola phones**. Examine the whole app, not just the latest features. Do not regress existing working models or remove user data.

## BEGINNING THE NEXT CHAT
1. Request the `@new-tunnel` connection and read `P:\AI Projects\TUNNEL_STORAGE_GUARDRAILS.md`. Reuse the existing tree. Never delete `P:\Recovery_20261016_135758`.
2. Inspect `git status --short --branch`, `git log`, remotes, branch tip and all uncommitted files. Resolve differences with the GitHub remote without overwriting work or force-pushing.
3. Check the latest three GitHub workflows for the **same commit SHA**:
   - `Atlas Build 81 Feature Checks` — TypeScript plus focused/full Jest
   - `Android unit tests` — Gradle JVM/Robolectric tests
   - `Build Atlas APK` — release signed APK, Vulkan/runtime assertions, upload artifact
4. If the APK workflow is stalled/fails at `llama.kt` Vulkan bootstrap or native compile, inspect the exact running step and logs, repair the actual cause, and let GitHub Actions do the expensive Android build. Never assume a queued job passed.
5. Implement and verify fixes in batches; add focused tests and run the full suite. Push to the existing development branch and verify resulting workflow runs. Do not merge or publish uncertified release builds without the owner approving the final candidate.

## RELEASE-SCOPE REQUIREMENTS (NOT FUTURE IDEAS)
The owner explicitly deferred original feature-list items **6, 7, 8, 15, 19, 20, 21, 22 and 23**. These include unattended SMS sending, reply monitoring, conditional background watches, nearby Bluetooth scanning, recorded heart-rate requests and cloud/skills enhancements. Existing source implementations can remain, but **do not treat deferred work as a release blocker or expand it without a new request**.

Keep and verify the other 24 requirements:
- Consent-gated email/SMS drafts and dialer actions. Contact-name lookup must explain why and ask before `READ_CONTACTS`; a supplied telephone number needs no Contacts permission. Opening a draft does not send.
- Contextual, useful and occasional **ideas** to contact a person by connecting conversation context and real calendar events; do not invent relationships or spam suggestions. Resolve contacts only after approval.
- Scheduled **unsent** SMS draft reminders, correctly encrypted at rest with notification permission, list/cancel; Android may delay WorkManager.
- Controllable conversation emoji and follow-up-question frequency.
- Built-in tool catalog, request-access gateway (Allow Once / Always / Not Now), and safe execution retry preserving all tool-specific consent checks.
- Wi-Fi/Bluetooth status, pressure barometer, ambient thermometer if actually fitted, 5-minute temperature/pressure trends, and the dedicated emergency Sensor Toolkit screen.
- Health Connect steps (where Android supports it and the user has authorized access; no personal data unless explicitly asked).
- Generating code in multiple languages, multi-file projects, and honest build/run/test support: offline dependency-free JavaScript runner plus optional user-configured/approved external Piston API runner for other languages.
- Editable PowerPoint and PDF presentations with the new layouts/themes; validate exported files **on a real device or emulator**.
- Daily News with credible source-backed story detail and a separate **English vocabulary** Word of the Day section (definition/part of speech/example; not a movie/celebrity word).
- GitHub-hosted validation and a reproducible, signed APK for this release branch.

## RECENT CHANGES / WHERE TO LOOK
- `android/app/src/main/java/ai/offgridmobile/atlasdevice/AtlasEnvironmentModule.kt`: sensor snapshots; barometer, pressure trend, ambient temperature/trend, relative humidity, light, proximity, accelerometer, gyroscope, magnetometer, battery charge/temperature and Wi-Fi/Bluetooth state.
- `src/screens/SensorToolkitScreen.tsx`: new responsive, offline, refresh-on-focus sensor dashboard. Links in `EmergencyScreen.tsx`, `CompassScreen.tsx` and `DeviceInfoScreen.tsx`. Register in `AppNavigator.tsx`, `navigation/types.ts`, `screens/index.ts`. Hardware may be missing; **battery temperature is NOT ambient air temperature**.
- `src/services/tools/deviceSensors.ts`: text AI tool for the same native readings.
- `src/services/tools/releaseDiagnostics.ts`: optional consent-gated privacy-preserving native smoke test; only detects module availability for some features, not full export verification.
- `src/services/tools/contactLookup.ts` + `AtlasContactsModule.kt`: user consent, Android READ_CONTACTS, single-name search with selection/disambiguation.
- `src/services/tools/contextualTextSuggestions.ts`: context-linked calendar suggestions.
- `src/services/tools/toolAccess.ts`, `generationToolLoop.ts`, `registry.ts`, `handlers.ts`: permissioned capability discovery and on-request activation.
- `src/services/tools/codeExecution.ts` and `AtlasCodeRunnerModule.kt`: restricted on-device JS tests; audit WebView isolation, timeouts and file selection.
- `src/services/tools/remoteCodeRunner.ts`: consented, user-selected external compiler; inspect SSRF/path safety and guarantees.
- `src/services/presentationExport.ts`, `presentationTemplates.ts`, `screens/PresentationScreen.tsx`, native `AtlasPresentationExporterModule.kt`.
- `src/atlasTools/dailyBrief.ts`, `src/atlasTools/englishWordOfDay.ts`, `src/screens/DailyBriefScreen.tsx`.
- The tests `__tests__/unit/services/tools/sensorToolkit.test.ts`, `deviceSensorSnapshot.test.ts`, `atlasContactPermission.test.ts`, `releaseDiagnostics.test.ts` complement existing tool, presentation, news and CI tests.

## AUDIT WORKSTREAMS AND ACCEPTANCE CRITERIA
### 1. Code architecture / correctness
Find dead code, duplicated capabilities, unhandled promise rejections, permission leaks, NativeModule inconsistencies, stale navigation routes, TypeScript `any` and runtime errors, mutable global state, races, bad timeouts, exception swallowing, memory leaks and unreliable cleanup. Repair them with regression tests. Preserve on-device data, encryption, model libraries and current source history.

### 2. Speed, memory and model acceleration
Profile cold launch, chat list, opening chats/projects, context loading, first-token latency, streaming tokens/sec, model unload/cancel, image generation, native Vulkan/NPU/GPU/CPU selection, long conversations, WorkManager background operations, memory and disk use. Test on **Motorola Razr Ultra 2025** and **onn Pro 13.2 Android tablet** where available. Never claim NPU/GPU use without measurement. Reduce unnecessary rerenders, repeated reads, spinners and high-cost work.

### 3. Navigation / layout / UI consistency
Review tab bar/side rail, back handling, screen headers, Settings, Tools, Projects/Agents workspace, model picker, chats, emergency, Sensor Toolkit, presentations, Daily News, search, dialogs, document preview, light/dark and fold/unfold. Audit safe-area insets, landscape and large screens: the tablet must NOT look like a stretched phone. Use consistent spacing, controls, typography, icon behavior, touch targets and accessibility labels. Preserve user-customizable layouts.

### 4. Motorola font switching — mandatory real-device test
Inspect `Appearance` font settings, theme/typography tokens, custom Text wrappers, React Native Text `fontFamily`, Android resources/assets, any overlays and hardcoded fonts, and display/font scaling. Prove switching fonts changes the displayed typeface on a Motorola device; include screenshots or an equivalent reproducible real-device verification, and fallback handling. Confirm correct behavior after theme change, restart and relaunch. Do not mark this resolved based only on unit tests.

### 5. Permissions, privacy and security
Confirm READ_CONTACTS is requested on name lookup, not for a known number. Denying permissions must not crash or expose contacts; no auto SMS, call or calendar mutation. Check SMS reminder encryption, Android 13+ notification permission, no leakage of addresses/messages via logs. Sensor screen reads only while active and needs no network. Confirm remote code upload prompts, strict HTTPS source allow-list and robust runner isolation. Assess native WebView script runner boundaries and whether sensitive Atlas storage is accessible. Review PIN/encrypted chat/project flows and consent across tool enable/disable.

### 6. Device sensors/emergency usage
Test on each device for pressure, ambient thermometer presence/absence, trends only after valid 5-minute samples, battery vs air temp, humidity, light, proximity, accelerometer, gyro, magnetic field and network/Bluetooth status. Android sensor sets vary; never invent data for missing hardware. Confirm navigation Emergency → Sensors ↔ Compass, refresh stops when unfocused and Bluetooth permission is optional. Sensor readings are informational, not certified medical/survival equipment.

### 7. News, presentations, coding and messaging
Verify one coherent Daily News show with English Word of Day, article-source accuracy/no hallucinated details, PPTX that opens with **editable slides**, PDF that opens with the correct layout on Android, project code generation and actual tested output, and real contact-name / calendar / scheduled-draft workflows including cancel and permission denial.

## BUILD / RELEASE REQUIREMENTS
Use the repository workflow (`.github/workflows/atlas-apk.yml`) and pinned native llama.kt / llama.rn sources; do not secretly bypass Vulkan, signing, test or source-identity gates. The APK signing key is held in GitHub secrets, not the working tree. Validate **for the same source SHA**: TypeScript, full Jest, Android tests, signed arm64 APK, presence of `libllamakt.so` and llama.rn native libraries, and a readable published artifact. Test install/upgrade on the phone/tablet; user approval is required to perform device actions on their behalf.

The CI job prior to these sensor-screen changes (`7e98628`) had green TypeScript/Jest and Android-unit workflows, but APK run `39812235824` was still building when this handoff was prepared. Obtain current statuses; do not recycle stale pass/fail statements.

## STORAGE AND COMMIT GUARDRAILS
Use `P:\AI Projects` and the existing tree; no fresh clone/worktree, no auto-delete of recovery, backups or models. Warn at 5 GiB scratch; pause disk-heavy work at 10 GiB. Prefer GitHub Actions to large local builds. Commit small, clear, test-backed changes. Do not merge to the release branch or publish an uncertified production APK.

## REQUIRED OUTPUT FROM THE AUDIT CHAT
Provide a priority-sorted issue list with exact file paths, severity, reproduction steps and root causes; a clear fix log with Git commit hashes; benchmark/performance results (with measurements and device names); screenshots or recorded verification for navigation/font changes; complete GitHub Actions links for the same SHA; APK/release link when genuinely available; and a concise list of genuinely unresolved blockers. Clearly distinguish **source implemented**, **CI passed**, **real-device verified**, and **released**.
