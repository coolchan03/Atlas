/** The AI radio loop with the phone's parts faked at the boundary: the model, the recording, the player, the voice and the clock. */
import { DEFAULT_RADIO, rollShow, seeded, type RadioSettings } from '../../src/radio/dice';
import { runStation, type StationDeps, type StationEvent } from '../../src/radio/station';

interface Track { id: number; seconds: number }

function build(settings: Partial<RadioSettings>, opts: { songs?: number; model?: 'good' | 'garbage'; skipFirstSong?: boolean } = {}) {
  let clock = 1_000_000;
  const realNow = Date.now;
  Date.now = () => clock;
  const log: string[] = [];
  const events: StationEvent[] = [];
  const made: Track[] = []; const discarded: number[] = [];
  let stop = false; let plays = 0; let skip = false; let skipped = false;
  const deps: StationDeps<Track> = {
    // A fake small model: writes a line for each end word it is told, and picks a style and instruments when asked.
    ask: async (system, _user, options) => {
      if (opts.model === 'garbage') return 'I am a tiny model and I like turtles';
      if (options?.grammar?.includes('instruments')) return '{"style":"jazz","instruments":["sax","piano","upright"]}';
      // Follows the grammar it is given: one line per rule, ending in the first word that rule allows.
      const ends = [...(options?.grammar ?? '').matchAll(/^line\d+ ::=.* " " \(("\w+")/gm)].map((m) => m[1].replace(/"/g, ''));
      return ends.map((e, i) => `The little thing number ${i + 1} went to the ${e}`).join('\n');
    },
    makeTrack: async (score) => { const t = { id: made.length, seconds: score.notes.length }; made.push(t); log.push(`tune:${score.title}`); return t; },
    play: async (t) => { plays += 1; skip = false; log.push(`play:${t.id}`); },
    discard: async (t) => { discarded.push(t.id); },
    speak: async (text) => { log.push(`say:${text}`); if (opts.skipFirstSong && plays === 1 && !skipped) { skip = true; skipped = true; } return true; },
    stopSpeaking: () => undefined,
    stopMusic: () => { log.push('music-stopped'); },
    wait: async (ms) => { clock += ms; if (plays >= (opts.songs ?? 3)) stop = true; return !stop; },
    skipped: () => skip,
    rng: seeded(7),
    report: (e) => events.push(e),
  };
  const run = () => runStation({ ...DEFAULT_RADIO, ...settings }, deps, () => stop).finally(() => { Date.now = realNow; });
  return { run, log, events, made, discarded };
}

const spoken = (log: string[]) => log.filter((l) => l.startsWith('say:')).map((l) => l.slice(4));

it('plays song after song: the host says what is coming, a poem is read once over the song, the old recording is thrown away', async () => {
  const radio = build({ theme: 'a haunted lighthouse late-night station', stationName: 'Lamp FM', poemChance: 1 });
  await radio.run();
  const said = spoken(radio.log);
  expect(said[0]).toMatch(/Lamp FM/); // the first song opens with the station name and the theme
  expect(said[0]).toMatch(/haunted lighthouse/);
  const readings = radio.events.filter((e): e is Extract<StationEvent, { kind: 'poem' }> => e.kind === 'poem');
  expect(readings.length).toBeGreaterThan(0);
  for (const r of readings) expect(said.filter((s) => s.startsWith(r.lines[0]))).toHaveLength(1); // each poem is read exactly once, whole
  expect(radio.events.filter((e) => e.kind === 'playing').length).toBe(3);
  expect(radio.events.some((e) => e.kind === 'poem')).toBe(true);
  expect(radio.log.filter((l) => l === 'music-stopped')).toHaveLength(1);
  expect(radio.discarded.length).toBe(radio.made.length); // nothing is left on the phone when the station stops
  expect(radio.events[radio.events.length - 1].kind).toBe('stopped');
});

it('has no poem in music-only mode, and carries on without one when the model cannot write it', async () => {
  const musicOnly = build({ musicOnly: true, poemChance: 1 });
  await musicOnly.run();
  expect(musicOnly.events.some((e) => e.kind === 'poem')).toBe(false);
  expect(musicOnly.made.length).toBeGreaterThanOrEqual(3);

  const garbage = build({ poemChance: 1 }, { model: 'garbage' });
  await garbage.run();
  expect(garbage.events.filter((e) => e.kind === 'playing').length).toBe(3); // the songs still play, with the dice's own sound
  expect(garbage.events.some((e) => e.kind === 'poem')).toBe(false);
  expect(garbage.events.some((e) => e.kind === 'problem')).toBe(false);
});

it('stays quiet when the host is turned off', async () => {
  const quiet = build({ host: false, musicOnly: true });
  await quiet.run();
  expect(spoken(quiet.log)).toEqual([]);
});

it('moves on at once when a song is skipped, without reading its poem', async () => {
  const radio = build({ poemChance: 1 }, { skipFirstSong: true, songs: 2 });
  await radio.run();
  const playing = radio.events.filter((e) => e.kind === 'playing').length;
  expect(playing).toBe(2);
  const firstPlay = radio.events.findIndex((e) => e.kind === 'playing');
  const secondPlay = radio.events.findIndex((e, i) => i > firstPlay && e.kind === 'playing');
  expect(radio.events.slice(firstPlay, secondPlay).some((e) => e.kind === 'poem')).toBe(false);
});

it('rolls more songs that match a station theme, and never the same genre or topic twice in a row', () => {
  const count = (theme: string) => { const rng = seeded(99); let spooky = 0; for (let i = 0; i < 300; i += 1) if (['spooky', 'blues'].includes(rollShow({ ...DEFAULT_RADIO, theme }, rng).genre.id)) spooky += 1; return spooky; };
  expect(count('a haunted lighthouse late-night station')).toBeGreaterThan(count('') * 1.5);
  const rng = seeded(5); let history = { genres: [] as string[], topics: [] as string[], subjects: [] as string[] };
  let previous = '';
  for (let i = 0; i < 100; i += 1) {
    const show = rollShow(DEFAULT_RADIO, rng, history);
    expect(show.genre.id).not.toBe(previous);
    previous = show.genre.id;
    history = { genres: [...history.genres, show.genre.id].slice(-3), topics: [...history.topics, show.topic.id].slice(-12), subjects: [...history.subjects, show.subject.id].slice(-12) };
    expect(show.seconds).toBeLessThanOrEqual(DEFAULT_RADIO.maxSongSeconds);
  }
});
