/**
 * The station: rolls a show, gets it ready (sound, tune, poem) while the song before it plays, then plays it. The tune loops for the show's
 * length; the host says what is coming over the start of the song, and the poem, when there is one, is read once, in the phone's voice at a
 * steady pace, a few seconds in. Everything that touches the phone (the model, the recording, the player, the voice, the clock) comes in
 * through `deps`, so the whole loop runs in a test with a fake clock.
 */
import type { MusicScore } from '../music/types';
import { nextUp, stationId } from './announce';
import { rollShow, type History, type RadioSettings, type Random, type Show, EMPTY_HISTORY } from './dice';
import { poemForVoice } from './poem';
import { chooseSound, diceSound, tuneFor, type AskModel, type Sound } from './sound';
import { writePoem } from './writer';

/** A song that is ready to play. `handle` is whatever the player needs to find it again (the saved track). */
interface Prepared<H> { show: Show; sound: Sound; title: string; poem: string[] | null; handle: H; voiceText: string | null }

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
  /** Said as the station changes: "Choosing the sound", "Playing ...". */
  report: (event: StationEvent) => void;
}

export type StationEvent =
  | { kind: 'preparing'; what: string }
  | { kind: 'playing'; show: Show; title: string; poem: string[] | null }
  | { kind: 'poem'; lines: string[] }
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
  let poem: string[] | null = null;
  if (show.withPoem) {
    deps.report({ kind: 'preparing', what: 'Writing a poem' });
    poem = (await writePoem(show, settings.theme, deps))?.lines ?? null;
  }
  return { show, sound, title, poem, handle, voiceText: poem ? poemForVoice(poem, show.form) : null };
}

/** Plays one prepared song. Returns false when the station was stopped during it. */
async function playShow<H>(song: Prepared<H>, station: { settings: RadioSettings; deps: StationDeps<H> }, count: number): Promise<boolean> {
  const { settings, deps } = station;
  await deps.play(song.handle);
  deps.report({ kind: 'playing', show: song.show, title: song.title, poem: song.poem });
  const startedAt = Date.now();
  // The host speaks over the start of the song; the station name is said every third song, so it does not get tiresome.
  if (settings.host) await deps.speak(count % 3 === 0 ? `${stationId(settings.stationName, settings.theme, deps.rng)} ${nextUp(song.show, deps.rng)}` : nextUp(song.show, deps.rng));
  const total = song.show.seconds * 1000;
  if (song.voiceText && !deps.skipped()) {
    const early = song.show.poemDelay * 1000 - (Date.now() - startedAt);
    if (early > 0 && !(await deps.wait(early))) return false;
    if (!deps.skipped()) {
      deps.report({ kind: 'poem', lines: song.poem ?? [] });
      await deps.speak(song.voiceText); // read once
    }
  }
  if (deps.skipped()) return true;
  return deps.wait(Math.max(0, total - (Date.now() - startedAt)));
}

/**
 * Runs the station until `stopped()` says so (the wait also ends early then). The next song is prepared while the current one plays, so
 * there is no silence between them; the song before it is discarded once the next is playing.
 */
export async function runStation<H>(settings: RadioSettings, deps: StationDeps<H>, stopped: () => boolean): Promise<void> {
  let history: History = EMPTY_HISTORY;
  const roll = (): Show => {
    const show = rollShow(settings, deps.rng, history);
    history = { genres: [...history.genres, show.genre.id].slice(-6), topics: [...history.topics, show.topic.id].slice(-20), subjects: [...history.subjects, show.subject.id].slice(-20) };
    return show;
  };
  let played: Prepared<H> | null = null;
  try {
    let current = await prepareShow(roll(), settings, deps);
    for (let count = 0; !stopped(); count += 1) {
      // The next song is made in the background while this one plays.
      const upcoming: Promise<Prepared<H> | null> = prepareShow(roll(), settings, deps).catch((e) => { deps.report({ kind: 'problem', message: String((e as Error)?.message || e) }); return null; });
      const finished = await playShow(current, { settings, deps }, count);
      if (played) await deps.discard(played.handle).catch(() => undefined);
      played = current;
      if (!finished || stopped()) { void upcoming.then((u) => u && deps.discard(u.handle).catch(() => undefined)); break; }
      const next = await upcoming;
      if (!next) { if (!(await deps.wait(5000))) break; current = await prepareShow(roll(), settings, deps); continue; }
      current = next;
    }
  } catch (e) {
    deps.report({ kind: 'problem', message: String((e as Error)?.message || e) });
  } finally {
    deps.stopSpeaking(); deps.stopMusic();
    if (played) await deps.discard(played.handle).catch(() => undefined);
    deps.report({ kind: 'stopped' });
  }
}
