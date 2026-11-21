# Atlas 0.0.219 audit (changes since 0.0.209)

Method: an independent review pass over the whole diff `2cae6f70..HEAD` (the code-review skill at high effort, run by a separate reviewer), then fixes and tests for every finding, then all gates. Earlier independent audits covered up to 0.0.208 (`AUDIT_v0.0.206.md`, `AUDIT_v0.0.207.md`). Nothing here was run on a phone.

## Findings and what was done
| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | important | "tonight at 10" was read as 10:00 and, being past, set for tomorrow morning; the same for "this evening at 7" | A bare hour 1 to 11 with tonight, evening or afternoon in the sentence means the evening | `quickReminder.test.ts` |
| 2 | important | A project set to Short answers raised an agent's own smaller `maxTokens` to 256 | The cap is `min(agent limit, project cap)` | `projectDefaults.test.ts` |
| 3 | important | A project's default agent set the system prompt but not the sampling (temperature, top-p, limit): sampling read only the global agent | Sampling uses the chat's own agent first, the same rule as the system prompt | `projectDefaults.test.ts` |
| 4 | important | A variation was rendered with the Duration slider's length, cutting off or padding a tune of another length | It renders for the tune's own length | covered by the Music Studio rendered tests |
| 5 | important | Continuing a tune did not check what the model wrote against the asked-for bars, so a long answer could push the tune past the 128-beat track limit | Notes outside the asked-for bars are dropped and the rest are cut to fit | `composerAgent.test.ts` |
| 6 | important | The twice-weekly cache build could publish a release if the default branch is a publishing branch | The publish step never runs for a scheduled build | by inspection of the workflow |
| 7 | nit | The Word document had the lesson title twice | Only the document title is written at the top | `docxExport.test.ts` |
| 8 | nit | The concurrency rule treated pushes to the publishing branches as cancellable | The same condition now decides the group and whether a build may be cancelled | by inspection |
| 9 | nit | A continuation faded in at the join with the original | No fade-in for the added section | `critic.test.ts` |
| 10 | nit | The three new components used hard-coded font sizes and spacing | They use `TYPOGRAPHY` and `SPACING` | lint, rendered tests |

## Also checked
- Privacy: the briefing and the Home card never name PIN-protected projects, protected or private chats; a rendered test covers the Home card.
- Import cycles: a first version of the project defaults created store cycles; the dependency check caught it and it was rebuilt on the leaf `storeRefs` module (0 violations).
- The MIDI importer is checked against files Atlas exports itself (round trip), truncated and empty files, wrong format, and size.

## Open risks
- Nothing in this version has been run on a phone: reminders from a sentence, the Word file opening in Word, MIDI import of real-world files, how continuations sound.
- The Word file is a minimal hand-written .docx; it is tested for structure, not opened in Word here.
- A reminder made from a sentence runs as an AI prompt when it fires (the scheduled-task design), so the notification text is the task name and the AI's sentence appears when opened.
- Publishing has failed with a 403 from the workflow token on every run so far; see the run page for the result of the newest build.

# Addendum: 0.0.220 (self-review; not independent)

Changes: Music Studio rebuilt (`MakePanel`, `TrackList`, `Select`, `SwipeRow`), AI-named tunes, background music with media controls (`musicControls.ts`, `mediaOwner.ts`, a Kotlin foreground service), swipe and hold options on lists, Home customize changes, call-launch statuses and the call log.

Checked: all gates (types, lint, knip, dependency check, version check, full Jest). A rendered or unit test covers each new behaviour (the hold sheet deleting nothing by itself, the swipe buttons, drop-downs including multi-select instruments, background and ownership of the media notification, call-launch statuses, Home customize).

Not verified, and the most likely places for a bug on a phone:
- **The Kotlin foreground service** compiles only in CI and has never run: whether Android lets it start, whether music continues after the app is closed from the recent apps, whether the notification appears on Android 13+ without the notification permission.
- **Calls**: reported as not transcribing and not speaking. Not reproduced or fixed: nothing in the code points to one cause. What was added: plain statuses, a Call log, and the tts trace. The log from a failed call is what is needed next.
- Pressing and holding rows now needs a tap on a sheet button; any other list that still deletes on hold was not changed (maps waypoints already open an options list).
