/**
 * The station: rolls a show, gets it ready (sound, tune, titled poem) during the break between songs while the host says what is coming, then
 * plays it. The tune loops for the show's length, and the poem, when there is one, is read once, title first, in the phone's voice at a
 * steady pace, a few seconds in. Everything that touches the phone (the model, the recording, the player, the voice, the clock) comes in
 * through `deps`, so the whole loop runs in a test with a fake clock.
 */
import type { MusicScore } from '../music/types';
import { breakLine } from './announce';
import { rollShow, type History, type RadioSettings, type Random, type Show, EMPTY_HISTORY } from './dice';
import { inventTopic, INVENT_EVERY } from './invent';
import { poemForVoice } from './poem';
import { chooseSound, diceSound, tuneFor, type AskModel, type Sound } from './sound';
import { writePoem } from './writer';

/** A song that is ready to play. `handle` is whatever the player needs to find it again (the saved track). */
interface Prepared<H> { show: Show; sound: Sound; title: string; poem: string[] | null; poemTitle: string | null; handle: H; voiceText: string | null }

export interface StationDeps<H> {
  ask: AskModel;
  /** Writes the tune to a recording and returns what the player needs. */
  makeTrack: (score: MusicScore) => Promise<H>;
  play: (handle: H) => Promise<void>;
  /** Removes a recording that has played. */
  discard: (handle: H) => Promise<void>;
  /** Says the text in the phone's voice and resolves when it has finished (false when it could not). */
  speak: (text: string) => Promise<boolean>;
  stopSpeaking: () => void;
  stopMusic: () => void;
  /** Waits that many milliseconds, resolving early when the station was stopped (false) or the song skipped (true). */
  wait: (ms: number) => Promise<boolean>;
  /** True once the listener asked to skip the song that is playing. */
  skipped: () => boolean;
  rng: Random;
  /** A topic the listener asked for (handed over once), or null. */
  takeRequest: () => string | null;
  /** True for a recording the listener chose to keep: it is not thrown away. */
  isKept: (handle: H) => boolean;
  /** Said as the station changes: "Choosing the sound", "Playing ...". */
  report: (event: StationEvent) => void;
}

export type StationEvent =
  | { kind: 'preparing'; what: string }
  /** The break between songs: the host says what comes next while the model writes it. */
  | { kind: 'break'; show: Show }
  | { kind: 'playing'; show: Show; title: string; poem: string[] | null; poemTitle: string | null }
  | { kind: 'poem'; lines: string[]; poemTitle: string | null }
  | { kind: 'problem'; message: string }
  | { kind: 'stopped' };

const titleFor = (show: Show): string => `${show.tone} ${show.genre.label}: ${show.topic.text}`.replace(/^./, (c) => c.toUpperCase());

/** Gets one song ready: the sound, the tune and the poem. A poem that fails its checks is left out; a tune is always made. */
async function prepareShow<H>(show: Show, settings: RadioSettings, deps: StationDeps<H>): Promise<Prepared<H>> {
  deps.report({ kind: 'preparing', what: 'Choosing the sound' });
  const sound = await chooseSound(show, settings.theme, deps.ask).catch(() => diceSound(show));
  const title = titleFor(show);
  deps.report({ kind: 'preparing', what: 'Writing the tune' });
  const handle = await deps.makeTrack(tuneFor(show, sound, title));
  let written: { title: string; lines: string[] } | null = null;
  if (show.withPoem) {
    deps.report({ kind: 'preparing', what: 'Writing a poem' });
    written = await writePoem(show, settings.theme, deps);
  }
  return { show, sound, title, poem: written?.lines ?? null, poemTitle: written?.title ?? null, handle, voiceText: written ? poemForVoice(written.lines, show.form, written.title) : null };
}

/**
 * Plays one prepared song. `replaced` is the song before it, still looping through the break; it is thrown away once this one is playing.
 * Returns false when the station was stopped during it.
 */
async function playShow<H>(song: Prepared<H>, station: { settings: RadioSettings; deps: StationDeps<H>; replaced: () => Promise<void> }): Promise<boolean> {
  const { deps } = station;
  await deps.play(song.handle);
  await station.replaced();
  deps.report({ kind: 'playing', show: song.show, title: song.title, poem: song.poem, poemTitle: song.poemTitle });
  const startedAt = Date.now();
  const total = song.show.seconds * 1000;
  if (song.voiceText && !deps.skipped()) {
    const early = song.show.poemDelay * 1000 - (Date.now() - startedAt);
    if (early > 0 && !(await deps.wait(early))) return false;
    if (!deps.skipped()) {
      deps.report({ kind: 'poem', lines: song.poem ?? [], poemTitle: song.poemTitle });
      await deps.speak(song.voiceText); // the title and the poem, read once
    }
  }
  if (deps.skipped()) return true;
  return deps.wait(Math.max(0, total - (Date.now() - startedAt)));
}

/**
 * Runs the station until `stopped()` says so (the wait also ends early then). Songs are separated by a break: when a song's time is up, or it
 * is skipped, the tune that was playing carries on underneath while the host says what comes next and the model chooses the sound, the tune
 * and the poem for it. The model never works while a song plays, so it cannot make the music stutter. When the next song is ready it starts,
 * and the one before it is thrown away.
 */
export async function runStation<H>(settings: RadioSettings, deps: StationDeps<H>, stopped: () => boolean): Promise<void> {
  let history: History = EMPTY_HISTORY;
  const madeUp: string[] = [];
  const roll = async (count: number): Promise<Show> => {
    const rolled = rollShow(settings, deps.rng, history);
    // A request becomes the next song's topic, and it gets a poem unless poems are off. Otherwise now and then the model thinks the topic up.
    const asked = deps.takeRequest();
    let topic = asked ? { id: `request-${history.topics.length}`, text: asked, tags: [] as string[] } : null;
    if (!topic && count % INVENT_EVERY === INVENT_EVERY - 1) {
      const text = await inventTopic(deps.ask, { show: rolled, theme: settings.theme, recent: madeUp });
      if (text) { madeUp.push(text); topic = { id: `invented-${count}`, text, tags: [] }; }
    }
    let subject = rolled.subject;
    if (!asked && count > 0 && count % INVENT_EVERY === 0) {
      const text = await inventTopic(deps.ask, { kind: 'subject', show: topic ? { ...rolled, topic } : rolled, theme: settings.theme, recent: madeUp });
      if (text) { madeUp.push(text); subject = { id: `invented-who-${count}`, text, tags: [] }; }
    }
    const show: Show = topic || subject !== rolled.subject ? { ...rolled, subject, ...(topic ? { topic, withPoem: asked ? !settings.musicOnly : rolled.withPoem } : {}) } : rolled;
    history = { genres: [...history.genres, show.genre.id].slice(-6), topics: [...history.topics, show.topic.id].slice(-20), subjects: [...history.subjects, show.subject.id].slice(-20) };
    return show;
  };
  const discard = async (handle: H): Promise<void> => { if (!deps.isKept(handle)) await deps.discard(handle).catch(() => undefined); };
  let played: Prepared<H> | null = null;
  try {
    for (let count = 0; !stopped(); count += 1) {
      // The break: the next song is made while the host says what it is.
      const show = await roll(count);
      deps.report({ kind: 'break', show });
      const preparing: Promise<Prepared<H> | null> = prepareShow(show, settings, deps).catch((e) => { deps.report({ kind: 'problem', message: String((e as Error)?.message || e) }); return null; });
      if (settings.host) await deps.speak(breakLine({ previous: played?.show, next: show, name: settings.stationName, theme: settings.theme, withTheme: count % 3 === 0, now: new Date(Date.now()) }, deps.rng));
      const next = await preparing;
      if (stopped()) { if (next) await discard(next.handle); break; }
      if (!next) { if (!(await deps.wait(5000))) break; continue; } // could not be made: try another
      const before = played;
      played = next;
      const finished = await playShow(next, { settings, deps, replaced: async () => { if (before) await discard(before.handle); } });
      if (!finished || stopped()) break;
    }
  } catch (e) {
    deps.report({ kind: 'problem', message: String((e as Error)?.message || e) });
  } finally {
    deps.stopSpeaking(); deps.stopMusic();
    if (played) await discard(played.handle);
    deps.report({ kind: 'stopped' });
  }
}
