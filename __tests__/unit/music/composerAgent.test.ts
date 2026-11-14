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

  it('uses the composer\'s score when it is good', async () => {
    const ask = jest.fn(async () => goodScore());
    const out = await composeMusic('rainy window', { ask });
    expect(out.via).toBe('composer');
    expect(out.instruments).toContain('Flute');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('asks again, saying what was wrong, when the first score is unusable', async () => {
    const ask = jest.fn().mockResolvedValueOnce('Sure! Here is a song.').mockResolvedValueOnce(goodScore());
    const out = await composeMusic('calm piano', { ask });
    expect(out.via).toBe('composer');
    expect(ask).toHaveBeenCalledTimes(2);
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
