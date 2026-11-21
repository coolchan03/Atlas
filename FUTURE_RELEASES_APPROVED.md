# Atlas approved ideas (added by the user on 2026-11-12)

These are ideas the user approved in conversation, kept apart from the user's original nine-item list in FUTURE_RELEASES.md (the release guard checks that list is unchanged). Nothing here is checked off until it has been tried on a phone.

Approved by the user on 2026-11-12. Each item needs a check against the current code first, and a phone test before it is checked off.

- [ ] **FF-10 - Store and manage what the app keeps**
  - Download the voice-cloning model directly, with no download-then-upload step.
  - One list of everything the app stores or downloads, with easy delete.
  - Needed recordings stored in the app, and transferable.
  - **Status 2026-11-12 (built, not yet verified on a phone):** the cloning engine downloads inside the app; Storage lists models, voices, cloned samples, maps and recordings with sizes and delete; recordings were already savable, importable and synced between paired phones.
- [ ] **FF-11 - Maps**
  - Smaller offline map downloads (less detail, less storage) and map updates.
  - **Status 2026-11-12 (built, not yet verified on a phone):** map downloads show Installed or Update, warn when there is not enough free space and point to smaller areas. There is no lower-detail version of the same region on the map server.
- [ ] **FF-12 - Compass**
  - Redesign to match the look and feel of the old iOS Compass app.
  - **Status 2026-11-12 (built, not yet verified on a phone):** compass and level redrawn after the old iOS ones; units setting added (Appearance, Units).
- [ ] **FF-13 - Read aloud glitch**
  - The first part of the first word is repeated after the speech ends. Cause not found yet; needs a device log.
  - **Status 2026-11-12:** not fixed. Needs a device log; see docs/ATLAS_NEXT_VERSION_DRAFT.md.
- [ ] **FF-14 - Teach the AI as projects**
  - Projects-style layout, so the knowledge base is hard to change by accident once teaching has started (the Change setup lock is the first step).
  - **Status 2026-11-12 (built, not yet verified on a phone):** Teach the AI is a list of subject cards; each opens its own page; the setup is locked once teaching has started.
- [ ] **FF-15 - Music**
  - Decide whether to add a real text-to-music model; it needs a new on-device runtime.
  - **Status 2026-11-12:** a real text-to-music model was not added. Music Studio gained 33 built-in styles (jazz, vaporwave, eerie, the seasons and holidays, places and settings).
- [ ] **FF-16 - More voice cloning**
  - Several samples per voice, per-voice speed or emotion, and a quality check before creating a voice.
  - **Status 2026-11-12 (built, not yet verified on a phone):** cloned voices get a speed, and a poor sample is flagged before Create. Several samples per voice is not built.
- [ ] **FF-17 - Multi-step workflow engine**
  - Fixed steps with user approval. First workflow: accountant mode (bank statement to a date/description/amount table, categories, questions to the user, CSV output, then a code-based reconciliation that every transaction is included). GnuCash and QuickBooks formats later.
  - **Status 2026-11-12 (built, not yet verified on a phone):** workflow engine and accountant mode (CSV only; GnuCash and QuickBooks dropped by the user on 2026-11-12, CSV is enough).
- [ ] **FF-18 - Workflows on the engine, ranked**
  - Meeting recording to summary, action items and calendar entries; bills and warranties with planner reminders; document reader for contracts and leases.
  - Later: form filler, medical paperwork explainer, voice memo to structured note, language role-play, photo text read aloud, photo identifier (plants, bites; needs a firm disclaimer), trip planner, guided emergency helper, offline translator, journal and memory search, home inventory, flashcards from documents.
  - **Status 2026-11-12 (built, not yet verified on a phone):** meeting follow-ups and bill reminders. The contract and lease reader was added later with the everyday helpers.
- [ ] **FF-19 - Everyday helpers**
  - Explain this to me: photo of a letter, label or error message, with a plain-language explanation and next steps.
  - Repair helper: guided troubleshooting for a household item, using photos.
  - Cooking and pantry: meals from a photo of the fridge, with scaling and substitutions.
  - Writing coach: rewrite or shorten the user's text in their own voice, offline.
  - Explain-how-it-works: a code snippet, config file, formula or unknown data format, or a photo of an appliance. Not real binary reverse engineering, which a phone model cannot do reliably.
  - Not wanted: budget watcher.
  - **Status 2026-11-12 (built, not yet verified on a phone):** repair helper, dinner from what you have, explain this to me, writing coach, explain how it works, and the contract reader are in Multi-step helpers. Photo input is not built (paste text). Budget watcher and kids' tutor are not wanted.
