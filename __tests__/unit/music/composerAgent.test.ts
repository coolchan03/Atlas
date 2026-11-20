/** The hidden composer: reading its score safely, asking twice, falling back to the built-in composer, and the make_music tool. */
import { installNativeBoundary } from '../../harness/nativeBoundary';
import { instrumentsForPrompt, INSTRUMENTS } from '../../../src/music/catalog';
import { parseAgentScore } from '../../../src/music/agentScore';
import { composeMusic, composerBrief, composerSystemPrompt, COMPOSER_AGENT } from '../../../src/music/composerAgent';

/** A usable score: chords, a bass line, a melody and drums over four bars. */
function goodScore(extra = ''): string {
  const lines = ['TITLE: Rainy Window', 'BPM: 84'];
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4;
    lines.push(`NOTE C3 ${b} 4 0.45 upright`, `NOTE C4 ${b} 4 0.25 warmpad`, `NOTE E4 ${b} 4 0.25 warmpad`, `NOTE G4 ${b} 4 0.25 warmpad`);
    lines.push(`NOTE E5 ${b} 1.5 0.55 flute`, `NOTE D5 ${b + 1.5} 0.5 0.5 flute`, `NOTE C5 ${b + 2} 2 0.55 flute`);
    lines.push(`DRUM kick ${b} 0.8`, `DRUM snare ${b + 1} 0.6`, `DRUM hat ${b + 0.5} 0.3`);
  }
  return `${lines.join('\n')}\n${extra}`;
}

describe('the instrument list', () => {
  it('names every instrument once, and the prompt lists them all with the drums', () => {
    const ids = INSTRUMENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    const text = instrumentsForPrompt();
    for (const id of ids) expect(text).toContain(id);
    expect(text).toContain('drums:');
    expect(text).toContain('crash');
  });
});

describe('reading a score', () => {
  it('reads titles, tempo, notes and drums with their instruments', () => {
    const r = parseAgentScore(goodScore());
    expect(r.score.title).toBe('Rainy Window');
    expect(r.score.bpm).toBe(84);
    expect(r.instruments).toEqual(expect.arrayContaining(['Upright bass', 'Warm pad', 'Flute']));
    expect(r.drums).toEqual(expect.arrayContaining(['kick', 'snare', 'hat']));
    expect(r.score.notes.find((n) => n.voice === 'upright')?.role).toBe('bass');
    expect(r.score.notes.find((n) => n.voice === 'warmpad')?.role).toBe('pad');
    expect(r.score.notes.find((n) => n.voice === 'kick')?.role).toBe('perc');
  });

  it('drops bad lines and keeps the good ones', () => {
    const r = parseAgentScore(`${goodScore()}NOTE C4 0 1 0.5 kazoo\nNOTE H9 0 1 0.5 piano\nNOTE C4 -1 1 0.5 piano\nNOTE C4 0 99 0.5 piano\nNOTE C4 0 1 3 piano\nDRUM gong 0 0.5\nNOTE C4 0 1\nlyrics la la la`);
    expect(r.dropped).toBe(7);
    expect(r.score.notes.every((n) => n.voice !== undefined)).toBe(true);
  });

  it('accepts fenced and thinking-wrapped replies, a bullet prefix, sharps and flats, and ignores a bad tempo', () => {
    const wrapped = `<think>hmm</think>\n\`\`\`\n${goodScore('- NOTE F#4 0 1 0.5 piano\nNOTE Bb3 1 1 0.5 cello\nBPM: 400')}\`\`\``;
    const r = parseAgentScore(wrapped);
    expect(r.score.bpm).toBe(84);
    expect(r.score.notes.some((n) => n.voice === 'cello')).toBe(true);
  });

  it.each([
    ['too few notes', 'TITLE: x\nNOTE C4 0 1 0.5 piano'],
    ['only drums', Array.from({ length: 20 }, (_, i) => `DRUM kick ${i} 0.5`).join('\n')],
    ['a tune that is too long', `BPM: 60\n${Array.from({ length: 14 }, (_, i) => `NOTE C4 ${i * 9} 8 0.5 piano`).join('\n')}`],
    ['no score at all', 'I would love to write you a song about rain.'],
  ])('refuses %s', (_n, raw) => { expect(() => parseAgentScore(raw)).toThrow(); });

  it('caps the number of notes', () => {
    const many = Array.from({ length: 900 }, (_, i) => `NOTE C4 ${(i % 120)} 0.5 0.5 piano`).join('\n');
    expect(parseAgentScore(many).score.notes).toHaveLength(700);
  });
});

describe('asking the composer', () => {
  it('tells the composer the style, a tempo, a bar count and fitting instruments', () => {
    const brief = composerBrief('a rainy day jazz cafe', 'jazz', 60);
    expect(brief.text).toContain('Jazz');
    expect(brief.text).toMatch(/exactly \d+ bars/);
    expect(brief.bars).toBeGreaterThanOrEqual(8);
    expect(composerSystemPrompt()).toContain('You never write lyrics');
    expect(composerSystemPrompt()).toContain('upright');
  });

  it('uses the composer\'s score, and sends a weak one back once with what is wrong before keeping the better', async () => {
    // This fixture plays the same bar four times: playable, but the listening check marks it down.
    const ask = jest.fn(async (_system: string, _user: string) => goodScore());
    const out = await composeMusic('rainy window', { ask });
    expect(out.via).toBe('composer');
    expect(out.instruments).toContain('Flute');
    expect(ask).toHaveBeenCalledTimes(3); // the tune, the rewrite of the weak tune, and a short question for its name
    expect(String(ask.mock.calls[1][1])).toContain('playable but weak');
    expect(out.note).toContain('Quality check');
  });

  it('asks again, saying what was wrong, when the first score is unusable', async () => {
    const ask = jest.fn().mockResolvedValueOnce('Sure! Here is a song.').mockResolvedValueOnce(goodScore());
    const out = await composeMusic('calm piano', { ask });
    expect(out.via).toBe('composer');
    expect(String(ask.mock.calls[1][1])).toContain('could not be used');
  });

  it('falls back to the built-in composer after two failures, and says so', async () => {
    const out = await composeMusic('a rainy day jazz cafe', { ask: async () => 'no' });
    expect(out.via).toBe('built-in');
    expect(out.style).toBe('jazz');
    expect(out.score.notes.length).toBeGreaterThan(20);
    expect(out.note).toContain('built-in');
  });

  it('does not keep asking when there is no model', async () => {
    const ask = jest.fn(async () => { throw new Error('No model selected'); });
    const out = await composeMusic('lullaby', { ask });
    expect(out.via).toBe('built-in');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('is not an agent anyone can see or chat with', () => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const { useAgentStore } = require('../../../src/stores/agentStore');
    expect(useAgentStore.getState().agents.some((a: { id: string }) => a.id === COMPOSER_AGENT.id)).toBe(false);
    expect(COMPOSER_AGENT.hidden).toBe(true);
  });
});

describe('the make_music tool', () => {
  function load(ask: () => Promise<string>) {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    jest.doMock('../../../src/study/engine', () => ({ askModel: ask }));
    const play = jest.fn(async () => undefined);
    jest.doMock('../../../src/music/backgroundPlayer', () => ({ instrumentalPlayer: { play } }));
    return { agent: require('../../../src/music/composerAgent'), play, library: require('../../../src/music/library').useMusicLibrary, RNFS: require('react-native-fs') };
  }

  it('composes, saves the sound and the score, starts playing and reports what was made', async () => {
    const { agent, play, library, RNFS } = load(async () => goodScore());
    const text = await agent.makeMusicForChat({ description: 'rainy window', seconds: 20, style: 'jazz' });
    expect(text).toContain('Made "Rainy Window"');
    expect(text).toContain('Written by the composer');
    expect(text).toContain('playing now');
    const track = library.getState().tracks[0];
    expect(await RNFS.exists(track.path)).toBe(true);
    expect(JSON.parse(await RNFS.readFile(track.scorePath, 'utf8')).by).toBe('Atlas composer');
    expect(play).toHaveBeenCalled();
  }, 60000);

  it('still saves the tune when playback cannot start, and uses the built-in composer when the agent fails', async () => {
    const { agent, play, library } = load(async () => 'nonsense');
    play.mockRejectedValueOnce(new Error('no audio'));
    const text = await agent.makeMusicForChat({ description: 'epic film trailer', seconds: 20 });
    expect(text).toContain('built-in');
    expect(text).toContain('saved in Music Studio');
    expect(text).not.toContain('playing now');
    expect(library.getState().tracks).toHaveLength(1);
  }, 60000);

  it('needs a description', async () => {
    const { agent } = load(async () => goodScore());
    await expect(agent.makeMusicForChat({})).rejects.toThrow('description');
  });
});

describe('making a variation of a saved tune', () => {
  const { composeVariation } = require('../../../src/music/composerAgent');
  const original = () => parseAgentScore(goodScore()).score;

  it('shows the composer the original and its key, keeps the length, and names the result a variation', async () => {
    const ask = jest.fn(async (_system: string, _user: string) => goodScore());
    const out = await composeVariation(original(), { ask, mood: 'jazz' });
    expect(out.via).toBe('composer');
    expect(out.score.title).toBe('Rainy Window (variation)');
    const brief = String(ask.mock.calls[0][1]);
    expect(brief).toContain('a variation of the tune below');
    expect(brief).toContain('KEY:');
    expect(brief).toContain('THE ORIGINAL (4 bars');
    expect(brief).toContain('NOTE C3 0 4');
  });

  it('falls back to the next variant from the built-in composer when the composer fails', async () => {
    const out = await composeVariation(original(), { ask: async () => 'no', mood: 'jazz', variant: 2 });
    expect(out.via).toBe('built-in');
    expect(out.note).toContain('could not write a variation');
    expect(out.score.notes.length).toBeGreaterThan(20);
  });
});

describe('continuing a saved tune', () => {
  const { composeContinuation } = require('../../../src/music/composerAgent');
  const original = () => parseAgentScore(goodScore()).score;

  it('asks for a contrasting next section and returns the tune followed by it, moved to start after the original', async () => {
    const ask = jest.fn(async (_system: string, _user: string) => goodScore());
    const out = await composeContinuation(original(), { ask, mood: 'jazz' });
    expect(out.via).toBe('composer');
    expect(out.score.title).toBe('Rainy Window (extended)');
    expect(String(ask.mock.calls[0][1])).toContain('continue the tune below');
    expect(String(ask.mock.calls[0][1])).toContain('exactly 4 bars');
    const beats = out.score.notes.map((n: { beat: number }) => n.beat);
    expect(Math.min(...beats)).toBe(0);
    expect(Math.max(...beats)).toBeGreaterThanOrEqual(16); // the new section starts after the 4 original bars (16 beats)
    expect(out.score.notes.length).toBeGreaterThan(original().notes.length);
    expect(out.note).toContain('Extended "Rainy Window" by 4 bars');
  });

  it('refuses a tune that is already as long as a track can be, and reports a composer that fails', async () => {
    const long = { title: 'Long', bpm: 90, notes: Array.from({ length: 32 }, (_, bar) => ({ pitch: 48, beat: bar * 4, length: 4, gain: 0.5, role: 'bass' as const })) };
    await expect(composeContinuation(long, { ask: async () => goodScore() })).rejects.toThrow(/already as long/);
    await expect(composeContinuation(original(), { ask: async () => 'no' })).rejects.toThrow();
  });

  it('keeps only the asked-for bars, so a model that writes too much cannot push the tune past the track limit', async () => {
    const { composeContinuation: extend } = require('../../../src/music/composerAgent');
    // asked for 4 bars (16 beats) but returns notes out to beat 60
    const greedy = `${goodScore()}${Array.from({ length: 12 }, (_, i) => `NOTE E5 ${20 + i * 3} 2 0.5 flute`).join('\n')}\n`;
    const out = await extend(original(), { ask: async () => greedy });
    const ends = out.score.notes.map((n: { beat: number; length: number }) => n.beat + n.length);
    expect(Math.max(...ends)).toBeLessThanOrEqual(32 + 1e-6); // 4 original bars + 4 new bars = 32 beats
  });
});

describe('the AI names the tune it made', () => {
  const { cleanTitle } = require('../../../src/music/composerAgent');
  it('cleans a reply into a title, and refuses what is not one', () => {
    expect(cleanTitle('Night Train Home')).toBe('Night Train Home');
    expect(cleanTitle('"Window Rain."')).toBe('Window Rain');
    expect(cleanTitle('Title: **Quiet Harbour**\nIt is a calm piece.')).toBe('Quiet Harbour');
    expect(cleanTitle('<think>hmm</think>\nSlow Morning')).toBe('Slow Morning');
    expect(cleanTitle('A calm instrumental tune')).toBe(''); // names itself a tune
    expect(cleanTitle('One two three four five six seven')).toBe('');
    expect(cleanTitle('')).toBe('');
  });

  it('asks for a name after the tune, and uses it instead of the title the composer wrote', async () => {
    const answers = [goodScore(), 'Window Rain', 'Window Rain'];
    const ask = jest.fn(async (_s: string, _u: string) => answers.shift() ?? 'Window Rain');
    const out = await composeMusic('rainy window', { ask });
    const asked = ask.mock.calls.map((c) => String(c[1]));
    expect(asked[asked.length - 1]).toContain('Give it a title');
    expect(asked[asked.length - 1]).toContain('rainy window');
    expect(out.score.title).toBe('Window Rain');
  });

  it('keeps the composer\'s own title when the model cannot name it, and gives an untitled tune a made-up one', async () => {
    const asks = [goodScore().replace('TITLE: Rainy Window', 'TITLE: Original instrumental'), '', ''];
    const ask = jest.fn(async () => asks.shift() ?? '');
    const out = await composeMusic('calm piano', { ask });
    expect(out.score.title).not.toBe('Original instrumental');
    expect(out.score.title.length).toBeGreaterThan(2);
  });
});

describe('reading the ways a small model really writes a score', () => {
  const four = (line: (b: number) => string) => ['TITLE: Test', 'BPM: 90', ...Array.from({ length: 14 }, (_, i) => line(i * 2))].join('\n');
  it.each([
    ['colons and commas', (b: number) => `NOTE: C4, ${b}, 1, 0.6, piano`],
    ['bars between the fields', (b: number) => `NOTE | C4 | ${b} | 1 | 0.6 | piano`],
    ['the loudness left out', (b: number) => `NOTE C4 ${b} 1 piano`],
    ['the instrument before the loudness', (b: number) => `NOTE C4 ${b} 1 piano 0.6`],
    ['the instrument by its name', (b: number) => `NOTE C4 ${b} 1 0.6 Electric piano`],
    ['a lower case pitch and bold words', (b: number) => `**NOTE** c4 ${b} 1 0.6 PIANO`],
    ['a numbered list', (b: number) => `${b / 2 + 1}. NOTE C4 ${b} 1 0.6 piano`],
  ])('reads %s', (_name, line) => {
    expect(parseAgentScore(four(line)).score.notes.length).toBe(14);
  });
  it('reads a drum line with a colon or without a loudness, and a short tune needs fewer notes', () => {
    const r = parseAgentScore(['NOTE C4 0 1 0.5 piano', 'NOTE E4 1 1 0.5 piano', 'NOTE G4 2 1 0.5 piano', 'NOTE C5 3 1 0.5 piano', 'NOTE C3 0 4 0.5 upright', 'DRUM: kick 0 0.8', 'DRUM snare 1'].join('\n'), 6);
    expect(r.score.notes).toHaveLength(7);
  });
  it('says what it found when there is not enough to play', () => {
    expect(() => parseAgentScore('Sure! Here is a lovely song about the rain.')).toThrow(/replied "Sure! Here is a lovely song/);
    expect(() => parseAgentScore('NOTE C4 0 1 0.5 piano\nNOTE X9 0 1 0.5 piano')).toThrow(/1 usable, 1 lines it wrote could not be read/);
  });
});

describe('when the full score cannot be read', () => {
  it('uses the melody alone with the bass and chords from the app, and names the tune', async () => {
    const replies = [
      'I think this would be nice.', 'Sorry, here is a poem.', // both full-score tries unusable
      'TITLE: Slow Lanterns\nBPM: 80\nMELODY: E5:1 G5:1 A5:2 G5:1 E5:1 D5:2 C5:1 D5:1 E5:2 -:1 C5:3 E5:1 G5:1 A5:2 G5:1 E5:1 D5:2 C5:4',
      'Paper Lanterns', // the name
    ];
    const ask = jest.fn(async () => replies.shift() ?? '');
    const out = await composeMusic('a calm jazz tune', { ask });
    expect(out.via).toBe('composer');
    expect(out.note).toMatch(/melody only/);
    expect(out.score.title).toBe('Paper Lanterns');
    expect(out.score.notes.some((n) => n.role === 'melody')).toBe(true);
    expect(out.score.notes.some((n) => n.role === 'bass')).toBe(true);
  });

  it('gives the built-in tune a name of its own, not the request text', async () => {
    const ask = jest.fn(async () => 'nothing useful');
    const out = await composeMusic('make me some jazz music please', { ask });
    expect(out.via).toBe('built-in');
    expect(out.score.title).not.toMatch(/make me some jazz/i);
  });
});
