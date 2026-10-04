<div align="center">

<img src="src/assets/logo.png" alt="Atlas" width="120" />

# Atlas

### An offline AI, library and field guide for your phone or tablet

**For emergencies, travel and life off the grid, for becoming an expert at anything, and for a private assistant you can talk to. Everything runs on the device. No internet needed once it is set up.**

[**Download the latest Android app (APK)**](https://github.com/coolchan03/Off-Grid/releases/latest)

</div>

---

## Install

1. On your Android phone or tablet, open the [latest release](https://github.com/coolchan03/Off-Grid/releases/latest) and download the `Atlas-<number>.apk` file.
2. Open it and allow installing from this source when Android asks. New versions install over the old one and keep your chats and settings.
3. Open **Models** and download a text model (a small one like Qwen or Gemma 1-4B runs well on most phones). Do this on Wi-Fi.
4. Optional, while you still have internet: download a natural voice (**Models → Voice**), the Atlas library packs and offline encyclopedias (**Settings → Offline Library**), and a map of your area (**Atlas → Maps**).

After that, airplane mode is fine.

## What it does

### Atlas: emergencies, travel and off-grid life
Open **Atlas** from the Agents tab or Settings.
- **Emergency cards** – bleeding, CPR, choking, burns, broken bones, heat stroke, severe allergic reactions, snakebite, cold, dehydration, infected wounds, safe water, phone power, getting found when lost, making fire. Big text, can be read aloud.
- **Survival Manual** – the full open Survival Manual (water, fire, shelter, food, plants, navigation, first aid) with pictures, search and your own notes.
- **Offline maps** – download your state or country once (OpenStreetMap data), then the map, your GPS position and saved places (camp, car, water) with distance and direction all work with no signal.
- **Phrases** – emergency and travel phrases in many languages, shown large or spoken aloud, plus translate anything with the AI.
- **Compass** – appears only if your device has a compass sensor.
- **Off-grid mode** – one switch: Atlas agent on, internet tools off, low-battery mode on. Optional red night screens.
- **Offline Library** – the Atlas library (hundreds of free medical, water, farming, engineering and survival manuals, turned into searchable text) and optional Kiwix encyclopedias such as WikiMed, Wikipedia, Wikivoyage and iFixit. The AI can search and quote them.

### Agents and projects
- **Agents** decide who answers and how: each has its own instructions, model, temperature, context length and tools. Built-in agents include Atlas (survival/medical), Field ID (plants and animals from a photo, with an EDIBLE / POISONOUS / NOT SURE verdict and lookalikes), Phone Assistant (files, calendar, web pages), Writer and Talk.
- **Projects** hold your chats and documents. Each project can have its own instructions and knowledge base.
- **Chats** can have their own instructions, can be **private** (never saved), and long chats are **compressed automatically** so they can keep going.
- **Tools** – web search (DuckDuckGo, SearXNG, Exa, Parallel, Tavily and more, never in off-grid mode), offline library search, files, calendar, "my location", memory.

### Learning mode (make an agent an expert)
Give an agent a task. A **learner** writes a bank of study questions, a **judge** approves or rejects them (the learner can argue back), the learner researches each question and writes short reports, the judge checks every report for logic and sources, and every so often a **manager** reviews both against the original task and steers them back on course. Choose **Keep learning** (lessons and checked answers are saved into the agent and project) or a temporary **Practice session**. You can use a different model for each role.

### Study mode (like NotebookLM, offline)
Pick a project and get a study guide, flashcards, a quiz, a mind map, an answer to a question, a narrated slideshow, or a **podcast episode**: choose the length, the style, optional extra research, and the number of hosts (when more than one voice is installed). Every item links back to the exact passage it came from. Players show the time and let you skip and seek.

### Voice
- Read answers aloud, talk by voice, and **hands-free mode** for a back-and-forth like a phone call (speech-to-text with Whisper).
- **Natural voices** – human-sounding neural voices (Kokoro with 11 voices, and Piper voices) that run on the device.

### Also
Image generation, vision models, models on a computer on your Wi-Fi (Ollama, LM Studio), backup and restore, low-battery mode, and layouts for phones, foldables and large tablets.

## Privacy
Chats, documents, notes, locations and voice stay on your device. The internet is only used when you download something or use a web tool, and off-grid mode turns web tools off completely.

## For builders
- The Android app is built by GitHub Actions (`.github/workflows/atlas-apk.yml`) on every change and published as a release.
- The Atlas library is built by `.github/workflows/atlas-packs.yml` from `atlas/atlas_all.py`: it downloads free public documents, converts them to text (with OCR for scans) and publishes one pack per subject on the `atlas-library` release. The same script can also build the library on a Windows PC.
- Natural voices are repackaged by `.github/workflows/atlas-voices.yml` onto the `atlas-voices` release.

## Credits and license
MIT licensed (see [LICENSE](LICENSE)). Built on the open-source Off Grid app, [llama.cpp](https://github.com/ggerganov/llama.cpp), [whisper.cpp](https://github.com/ggerganov/whisper.cpp), [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), [Kiwix](https://www.kiwix.org), [Mapsforge](https://github.com/mapsforge/mapsforge) with OpenStreetMap data, and the [Survival Manual](https://github.com/ligi/SurvivalManual). Library documents belong to their publishers and are free public resources.

**Medical content is general guidance, not a doctor. Get professional care whenever you can.**
