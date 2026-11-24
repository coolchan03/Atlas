# AI radio

A station that plays one generated song after another. Open it from Home (AI radio), the Atlas hub or search.

## What a show is

Each song is a **show**, rolled from the tables in `src/radio/tables.ts` by `src/radio/dice.ts`:

| Roll | Choices |
|---|---|
| Genre | 24 (pop, punk, rock, funk, disco, reggae, country, blues, jazz, hip hop, dance, lo-fi, classical, bossa nova, western, 8-bit, synthwave, surf rock, folk, electronic, lullaby, sea shanty, spooky, cinematic). Each is a Music Studio style, so there is always a real tune behind it |
| Topic | 51 (a love song, revenge, a road trip, a lost sock...) |
| Subject | 41 (my ex-husband, my dog, a pirate, a ghost...) |
| Tone | 12 (silly, tender, dramatic, deadpan...) |
| Poem shape | 6 (stanzas and lines, and which line ends rhyme: AABB, ABAB, ABCB, AA) |
| Liveliness | calm, medium, lively (a genre can fix it: punk is always lively) |
| Length | 60 to 300 seconds, never more than the "Song length" setting; the tune is one 16-bar pass that loops until the time is up |
| Spotlight | an instrument to feature (half of the songs) |
| Poem or not | the "Poems" setting: Often 60%, Sometimes 40% (default), Rarely 20%, Never (music only) |

Adding a genre, topic or subject is one line in `tables.ts`. The last few genres, topics and subjects are passed over, so a long listen does not repeat.

## The station theme

The person types what the station is about ("a haunted lighthouse's late-night station"). It does three things: entries whose tags or words appear in it become six times likelier (it never removes the rest), it is given to the model when it picks the sound and writes the poem, and it is said by the host on every third song with the station name.

## What the model does, and what code does

A tiny model only has to **choose** and **fill in**; code holds the rules.

1. **Sound** (`sound.ts`): the model is shown every Music Studio style and instrument and the song's description, and answers one line of JSON. A grammar makes the answer a valid style and 2 to 4 valid instruments (the engine cannot write anything else). The built-in composer then writes the notes for that style and band, so the music is always valid. If the model cannot answer, the dice's own genre and instruments are used.
2. **Poem** (`writer.ts`, `poem.ts`, `rhymes.ts`): rhymes are never left to the model. The dice give each line a few words to end with, taken from curated rhyme groups in `rhymes.ts` (two lines that must rhyme share a group, split between them so they cannot end in the same word). A grammar makes the reply exactly the right number of short lines, each ending in one of its words; the model chooses which fits. The check in `poem.ts` is then run on the result (line count, line length, no repeated line, no unsuitable word, rhymes). A poem that fails is asked for again, up to three times; if none passes, the song plays without one.
3. **Host** (`announce.ts`): written lines with the dice dropped in ("Up next, a silly punk song about revenge, about my ex-husband. A poem comes with it."). Not model output.

## Extras on the screen

- **Request a song**: type a topic ("a lost umbrella"); the next song is about it and gets a poem unless poems are off. Words the station will not say are refused.
- **Keep this song**: the song playing is not deleted afterwards and stays in the Music Studio list.
- **Sleep timer** (15, 30, 60 or 90 minutes): the music fades out over 20 seconds and the station stops. The fade uses the music volume, which is put back as soon as the station stops; if the app were killed in the middle of the 20 seconds the volume would stay lowered (Music Studio has the volume control).
- **Mood: Calm songs only**: only soft genres (jazz, lo-fi, classical, bossa nova, folk, lullaby), calm tunes and gentle tones.

## Playing (`station.ts`, `service.ts`)

The next song is made while the current one plays. The host speaks over the start of the song (the music lowers while speech is heard), the poem is read once, 8 to 20 seconds in, in the phone's voice at a steady pitch, and the tune loops until the song's time is up. Stop and Next song end waits at once. Recordings are deleted when they have played. All of the phone's parts (model, recording, player, voice, clock) are passed in, so `__tests__/integration/radioStation.test.ts` runs the whole loop with fakes.

The AI that writes is the one chosen as the background model in Model settings (else the chat model). A small model is enough. The Vulkan text engine has no grammar support, so there the answer is checked but not held to a shape.

## Not run on a phone

Everything above is covered by tests with fakes, and a small model was tried on a computer (see the model comparison in `docs/REMAINING_WORK_2026-11-21.md`). Not yet seen on a phone: how fast a model writes there, whether the station keeps going with the screen off, and how the voice sounds over the music.

## Which model

Tried on a computer (4 CPU threads, llama.cpp with the same grammar support as the app's engine, 24 shows, two poems and one sound choice each). "Shape ok" is the share of poems that passed the code's checks. Speed is while writing under a grammar. Reading samples is the only test of how good the verse is: none of these models writes good poetry, and the comparison below is about which is least bad and still fast.

| Model (4-bit unless noted) | Size | Shape ok | Sound answer valid | Speed | Notes |
|---|---|---|---|---|---|
| LFM2-350M | 229 MB | 96 to 98% | 100%, 2+ instruments 100% | 26 tok/s | Most fluent lines. Licence "LFM Open License" (personal use is fine, read it before redistributing) |
| SmolLM2-360M | 271 MB | 98% | 100%, 92% | 20 tok/s | Chatty, slangy lines. Apache 2.0; in the app's model list |
| SmolLM2-135M | 105 MB | 90% | 100% | 36 tok/s | Weak verse |
| Supra2.5-Pro-Instruct 65M | 54 MB | 88 to 98% | 100% | 73 to 108 tok/s | Fastest by far; verse is the weakest and it wanders off the topic; 512-token context |
| Gemma 3 270M (8-bit) | 292 MB | 40% | 100% | 9 tok/s | Follows the genre best, but a grammar is very slow on its 262,000-word vocabulary |
| Qwen3 0.6B (8-bit) | 639 MB | 83% | 100% | 13 tok/s | Drifted into Spanish and nonsense; slow |

**Recommendation: LFM2-350M** (download "LFM2-350M-GGUF", the Q4_K_M file, and choose it as the background model). Supra2.5 is the pick if speed matters more than the verse. The Aurora2 and Quark models cannot be loaded at all (their architectures are not in the engine). The bundled engine includes the LFM2, Qwen3 and SmolLM3 architectures.

Every model gave a valid sound answer, because the grammar allows nothing else. With the dice's genre shown as a suggestion, 71 to 100% of the answers kept it, and the rest chose another style from the list.
