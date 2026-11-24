/** The AI radio loop with the phone's parts faked at the boundary: the model, the recording, the player, the voice and the clock. */
import { DEFAULT_RADIO, rollShow, seeded, type RadioSettings } from '../../src/radio/dice';
import { GENRES } from '../../src/radio/tables';
import { STYLES } from '../../src/music/styles';
import { breakLine, timeCheck } from '../../src/radio/announce';
import { runStation, type StationDeps, type StationEvent } from '../../src/radio/station';

interface Track { id: number; seconds: number }

function build(settings: Partial<RadioSettings>, opts: { songs?: number; model?: 'good' | 'garbage' | 'badtitle'; skipFirstSong?: boolean; request?: string; kept?: number[] } = {}) {
  let clock = 1_000_000;
  const realNow = Date.now;
  Date.now = () => clock;
  const log: string[] = [];
  const events: StationEvent[] = [];
  const made: Track[] = []; const discarded: number[] = [];
  let stop = false; let plays = 0; let skip = false; let skipped = false; let requestTaken = false;
  const deps: StationDeps<Track> = {
    // A fake small model: writes a line for each end word it is told, and picks a style and instruments when asked.
    ask: async (system, _user, options) => {
      if (opts.model === 'garbage') return 'I am a tiny model and I like turtles';
      if (options?.grammar?.includes('instruments')) return '{"style":"jazz","instruments":["sax","piano","upright"]}';
      // Follows the grammar it is given: one line per rule, ending in the first word that rule allows.
      const ends = [...(options?.grammar ?? '').matchAll(/^line\d+ ::=.* " " \(("\w+")/gm)].map((m) => m[1].replace(/"/g, ''));
      const title = options?.grammar?.includes('title ::=') ? `${opts.model === 'badtitle' ? 'Night 99 #1 !!!' : 'The little night walk'}\n` : '';
      return title + ends.map((e, i) => `The little thing number ${i + 1} went to the ${e}`).join('\n');
    },
    makeTrack: async (score) => { const t = { id: made.length, seconds: score.notes.length }; made.push(t); log.push(`tune:${score.title}`); return t; },
    play: async (t) => { plays += 1; skip = false; log.push(`play:${t.id}`); },
    discard: async (t) => { discarded.push(t.id); },
    speak: async (text) => { log.push(`say:${text}`); return true; },
    stopSpeaking: () => undefined,
    stopMusic: () => { log.push('music-stopped'); },
    wait: async (ms) => {
      clock += ms;
      if (opts.skipFirstSong && plays === 1 && !skipped) { skip = true; skipped = true; return true; } // the listener presses Next song a moment into the first song
      if (plays >= (opts.songs ?? 3)) stop = true;
      return !stop;
    },
    skipped: () => skip,
    rng: seeded(7),
    takeRequest: () => (opts.request && !requestTaken ? ((requestTaken = true), opts.request) : null),
    isKept: (t) => (opts.kept ?? []).includes(t.id),
    report: (e) => events.push(e),
  };
  const run = () => runStation({ ...DEFAULT_RADIO, ...settings }, deps, () => stop).finally(() => { Date.now = realNow; });
  return { run, log, events, made, discarded };
}

const spoken = (log: string[]) => log.filter((l) => l.startsWith('say:')).map((l) => l.slice(4));

it('plays song after song: a break while the host says what is coming and the model writes it, a titled poem is read once over the song, the old recording is thrown away', async () => {
  const radio = build({ theme: 'a haunted lighthouse late-night station', stationName: 'Lamp FM', poemChance: 1 });
  await radio.run();
  const said = spoken(radio.log);
  expect(said[0]).toMatch(/Lamp FM/); // the first break opens with the station name and the theme
  expect(said[0]).toMatch(/haunted lighthouse/);
  const readings = radio.events.filter((e): e is Extract<StationEvent, { kind: 'poem' }> => e.kind === 'poem');
  expect(readings.length).toBeGreaterThan(0);
  for (const r of readings) expect(said.filter((s) => s.includes(r.lines[0]))).toHaveLength(1); // each poem is read exactly once, whole
  expect(radio.events.filter((e) => e.kind === 'playing').length).toBe(3);
  expect(radio.events.some((e) => e.kind === 'poem')).toBe(true);
  expect(radio.log.filter((l) => l === 'music-stopped')).toHaveLength(1);
  // The poem has a name, shown and spoken first.
  expect(readings[0].poemTitle).toBe('The Little Night Walk');
  expect(said.some((t) => t.startsWith('A poem called The Little Night Walk.'))).toBe(true);
  const playingEvent = radio.events.find((e): e is Extract<StationEvent, { kind: 'playing' }> => e.kind === 'playing');
  expect(playingEvent?.poemTitle).toBe('The Little Night Walk');
  // The model works in the break, never while a song plays: every break comes before the song it makes, and the tune is made after the break starts.
  const kinds = radio.events.map((e) => e.kind).filter((k) => k === 'break' || k === 'playing');
  expect(kinds).toEqual(['break', 'playing', 'break', 'playing', 'break', 'playing']);
  const firstTune = radio.log.findIndex((l) => l.startsWith('tune:'));
  const firstPlayLog = radio.log.findIndex((l) => l.startsWith('play:'));
  expect(firstTune).toBeLessThan(firstPlayLog);
  const secondBreakAt = radio.events.findIndex((e, i) => e.kind === 'break' && radio.events.slice(0, i).some((x) => x.kind === 'playing'));
  const tunesBeforeSecondBreak = radio.events.slice(0, secondBreakAt).filter((e) => e.kind === 'preparing' && e.what === 'Writing the tune').length;
  expect(tunesBeforeSecondBreak).toBe(1); // nothing is prepared in the background during song one
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

it('leaves the poem out when its title is not a plain name', async () => {
  const radio = build({ poemChance: 1 }, { model: 'badtitle' });
  await radio.run();
  expect(radio.events.some((e) => e.kind === 'poem')).toBe(false);
  expect(radio.events.filter((e) => e.kind === 'playing').length).toBe(3); // the songs still play
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

it('makes the first song about what was asked for, with a poem, and keeps a song the listener chose to keep', async () => {
  const radio = build({ poemChance: 0 }, { request: 'a lost umbrella', kept: [0], songs: 2 });
  await radio.run();
  const first = radio.events.find((e): e is Extract<StationEvent, { kind: 'playing' }> => e.kind === 'playing');
  expect(first?.show.topic.text).toBe('a lost umbrella');
  expect(first?.poem).not.toBeNull(); // a request gets a poem even when poems are rare
  expect(spoken(radio.log)[0]).toMatch(/a lost umbrella/);
  expect(radio.discarded).not.toContain(0); // song 0 was kept
  expect(radio.discarded.length).toBe(radio.made.length - 1);
});

it('rolls only calm genres, tones and tunes when calm songs are asked for', () => {
  const rng = seeded(3);
  for (let i = 0; i < 80; i += 1) {
    const show = rollShow({ ...DEFAULT_RADIO, calmOnly: true }, rng);
    expect(show.genre.calm).toBe(true);
    expect(show.energy).toBe('calm');
    expect(['tender', 'dreamy', 'hopeful', 'mournful', 'mysterious']).toContain(show.tone);
  }
});

it('has a genre for every Music Studio style, so the station can play anything the studio can make', () => {
  const used = new Set(GENRES.map((g) => g.style));
  expect(Object.keys(STYLES).filter((s) => !used.has(s as keyof typeof STYLES))).toEqual([]);
  expect(new Set(GENRES.map((g) => g.id)).size).toBe(GENRES.length); // no id twice
  expect(GENRES.length).toBeGreaterThan(65);
});

it('says radio things in every break: what just played, the station name, now and then the time, and what is next', async () => {
  const radio = build({ stationName: 'AI FM', host: true, musicOnly: true }, { songs: 4 });
  await radio.run();
  const said = spoken(radio.log);
  expect(said.length).toBe(4);
  for (const line of said) expect(line).toMatch(/AI FM\./); // the name is said in every break, not every third
  expect(said[0]).not.toMatch(/^(That was|You just heard)/); // nothing has played before the first break
  for (const line of said.slice(1)) expect(line).toMatch(/^(That was|You just heard) an? .+ (song|poem) about /); // the song that just ended is named
  for (const line of said) expect(line).toMatch(/(Up next|Coming up|Next on the station),/);
});

it('adds the time of day to a break about one time in four, said the way a host says it', () => {
  const show = rollShow(DEFAULT_RADIO, seeded(2));
  const at = new Date(2026, 10, 24, 21, 41);
  const base = { next: show, name: 'AI FM', theme: '', withTheme: false, now: at };
  expect(timeCheck(at)).toBe('It is 9:41 PM.');
  expect(timeCheck(new Date(2026, 10, 24, 0, 5))).toBe('It is 12:05 AM.');
  expect(breakLine(base, () => 0.1)).toContain('It is 9:41 PM.'); // a low roll adds it
  expect(breakLine(base, () => 0.9)).not.toContain('It is 9:41 PM.'); // a high roll does not
  expect(breakLine({ ...base, name: '  ' }, () => 0.9)).toContain('AI FM'); // an empty name falls back to the default
});
