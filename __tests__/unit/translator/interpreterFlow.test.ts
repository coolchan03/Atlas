/** A live interpreting session: listening, translating, speaking, and what happens when something goes wrong. */
export {}; // a module, so its helper names do not collide with other test files
type Session = { stop: jest.Mock; cancel: jest.Mock; result: Promise<string> };

function load(o: { heard?: Array<string | 'hang'>; listen?: 'session' | 'none' | 'throws'; translate?: 'ok' | 'fails'; to?: 'A' | 'B' | null; said?: string; whisper?: boolean } = {}) {
  jest.resetModules();
  const spoken: Array<{ text: string; lang: string }> = [];
  jest.doMock('../../../src/atlasVoice/tts', () => ({ speakInAndWait: jest.fn(async (text: string, lang: string) => { spoken.push({ text, lang }); return true; }), stop: jest.fn() }));
  const holds: boolean[] = [];
  jest.doMock('../../../src/atlasTools/runtimePower', () => ({ holdScreenOnly: (_r: string, on: boolean) => { holds.push(on); } }));
  const listens: Array<{ code: string; autoDetect?: boolean }> = [];
  const heard = [...(o.heard ?? ['Hola, ¿dónde está la estación?'])];
  const sessions: Session[] = [];
  jest.doMock('../../../src/language/listenTurn', () => ({
    hasMultilingualWhisper: () => !!o.whisper,
    listenInLanguage: jest.fn(async (code: string, opts: { autoDetect?: boolean; onPartial?: (p: string) => void }) => {
      listens.push({ code, autoDetect: opts.autoDetect });
      if (o.listen === 'none') return null;
      if (o.listen === 'throws') throw new Error('microphone busy');
      const next = heard.shift();
      const s: Session = { stop: jest.fn(), cancel: jest.fn(), result: next === undefined || next === 'hang' ? new Promise<string>(() => undefined) : Promise.resolve(next) };
      sessions.push(s);
      return s;
    }),
  }));
  const calls = { text: [] as string[], both: [] as string[] };
  jest.doMock('../../../src/translator/translateService', () => ({
    translateText: jest.fn(async (t: string) => { calls.text.push(t); if (o.translate === 'fails') throw new Error('The model is busy'); return o.said ?? 'Where is the station?'; }),
    translateBothWays: jest.fn(async (t: string) => { calls.both.push(t); if (o.translate === 'fails') throw new Error('The model is busy'); return { to: o.to === undefined ? 'B' : o.to, text: o.said ?? 'Where is the station?' }; }),
  }));
  const { createInterpreter } = require('../../../src/translator/interpreter');
  return { createInterpreter, spoken, listens, sessions, calls, holds };
}
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

describe('one way', () => {
  it('listens in the first language, translates, shows both texts and says the translation in the second language', async () => {
    const t = load({ heard: ['Hola, ¿dónde está la estación?', 'hang'] });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => true });
    it.start();
    await tick();
    expect(t.listens[0]).toEqual({ code: 'es-ES', autoDetect: false });
    expect(t.calls.text).toEqual(['Hola, ¿dónde está la estación?']);
    expect(t.calls.both).toEqual([]);
    expect(it.state().lines).toEqual([expect.objectContaining({ heard: 'Hola, ¿dónde está la estación?', said: 'Where is the station?', toCode: 'en-US' })]);
    expect(t.spoken).toEqual([{ text: 'Where is the station?', lang: 'en-US' }]);
    expect(t.listens[1].code).toBe('es-ES'); // the microphone opens again for the next sentence, in the same language
    expect(it.state()).toMatchObject({ running: true, phase: 'listening' });
  });

  it('reads the speak switch each time a translation is ready (it can change mid-session)', async () => {
    const t = load({ heard: ['Uno', 'Dos', 'hang'] });
    let it: any;
    // Off for the first translation, on for the second: the switch is read after each line is shown.
    it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => it.state().lines.length >= 2 });
    it.start();
    await tick();
    expect(it.state().lines).toHaveLength(2);
    expect(t.spoken).toHaveLength(1);
  });

  it('stops: the microphone is cancelled, the screen is let go, and the lines stay', async () => {
    const t = load({ heard: ['Hola', 'hang'] });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => false });
    it.start();
    await tick();
    it.stop();
    expect(t.sessions.at(-1)?.cancel).toHaveBeenCalled();
    expect(it.state()).toMatchObject({ running: false, phase: 'idle' });
    expect(it.state().lines).toHaveLength(1);
    expect(t.holds[0]).toBe(true);
    expect(t.holds.at(-1)).toBe(false);
  });
});

describe('both ways', () => {
  it('without a multilingual Whisper model, listens in A, then in the language the last turn was translated into', async () => {
    const t = load({ heard: ['Hola', 'Thank you', 'hang'], to: 'B' });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: true, speak: () => false });
    it.start();
    await tick(20);
    expect(t.listens.map((l) => l.code).slice(0, 3)).toEqual(['es-ES', 'en-US', 'en-US']); // A spoke (to B), B answered (to B again, as the fake says), ...
    expect(t.listens.every((l) => l.autoDetect === false)).toBe(true);
  });

  it('with a multilingual Whisper model, lets it recognise the language of every turn', async () => {
    const t = load({ whisper: true, heard: ['Hola', 'hang'], to: 'B' });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: true, speak: () => true });
    it.start();
    await tick();
    expect(t.listens[0].autoDetect).toBe(true);
    expect(t.spoken[0].lang).toBe('en-US'); // said in the language it was translated into
  });

  it('says a turn translated into A in language A', async () => {
    const t = load({ heard: ['Thank you', 'hang'], to: 'A', said: 'Gracias' });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: true, speak: () => true });
    it.start();
    await tick();
    expect(t.spoken).toEqual([{ text: 'Gracias', lang: 'es-ES' }]);
    expect(it.state().lines[0].toCode).toBe('es-ES');
  });

  it('when the AI does not say which way it went, guesses the other language from the one that was listened for', async () => {
    const t = load({ heard: ['Hola', 'hang'], to: null });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: true, speak: () => false });
    it.start();
    await tick();
    expect(it.state().lines[0].toCode).toBe('en-US');
  });
});

describe('when something goes wrong', () => {
  it('asks for typing when nothing on the phone can listen, and translates a typed line', async () => {
    const t = load({ listen: 'none' });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => true });
    it.start();
    await tick();
    expect(it.state()).toMatchObject({ typing: true, running: false });
    await it.say('Buenos días');
    expect(t.calls.text).toEqual(['Buenos días']);
    expect(it.state().lines[0].said).toBe('Where is the station?');
    expect(it.state().running).toBe(false);
  });

  it('shows the reason and stops when the microphone cannot be used', async () => {
    const t = load({ listen: 'throws' });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => true });
    it.start();
    await tick();
    expect(it.state()).toMatchObject({ running: false, error: 'microphone busy' });
    expect(t.holds.at(-1)).toBe(false);
  });

  it('shows the reason and stops when the translation fails, without adding an empty line', async () => {
    const t = load({ translate: 'fails' });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => true });
    it.start();
    await tick();
    expect(it.state()).toMatchObject({ running: false, error: 'The model is busy' });
    expect(it.state().lines).toEqual([]);
  });

  it('skips a turn that came back with nothing to say', async () => {
    const t = load({ heard: ['Hola', 'hang'], said: '   ' });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => true });
    it.start();
    await tick();
    expect(it.state().lines).toEqual([]);
    expect(t.spoken).toEqual([]);
  });

  it('listens again after silence', async () => {
    const t = load({ heard: ['', 'Hola', 'hang'] });
    const it = t.createInterpreter({ a: 'es-ES', b: 'en-US', bothWays: false, speak: () => false });
    it.start();
    await new Promise((r) => setTimeout(r, 450));
    await tick();
    expect(it.state().lines).toHaveLength(1);
    expect(t.listens.length).toBeGreaterThanOrEqual(3);
  });
});
