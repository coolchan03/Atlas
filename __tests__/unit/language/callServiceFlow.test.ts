/** A practice phone call: the caller speaks, the learner answers by voice or typing, hints, and the review on hanging up. */
type Session = { stop: jest.Mock; cancel: jest.Mock; result: Promise<string> };

function load(o: { model?: 'ok' | 'fails'; reply?: string; listen?: 'session' | 'none' | 'throws'; heard?: string; hint?: string; review?: string } = {}) {
  jest.resetModules();
  const spoken: string[] = [];
  jest.doMock('../../../src/atlasVoice/tts', () => ({ speakInAndWait: jest.fn(async (t: string) => { spoken.push(t); return true; }), stop: jest.fn() }));
  const llmState = { reply: o.reply ?? 'Hola. ¿Qué desea tomar?', hint: o.hint, review: o.review, fails: o.model === 'fails', calls: [] as string[] };
  const generate = jest.fn(async (msgs: Array<{ content: string }>, opts: { onStream?: (t: { content: string }) => void }) => {
    llmState.calls.push(msgs.map((m) => m.content).join('|'));
    if (llmState.hint !== undefined && /suggest|hint|what to say/i.test(msgs[0].content + msgs.at(-1)?.content)) return llmState.hint;
    if (llmState.review !== undefined && /mistake|correct|review/i.test(msgs[0].content)) return llmState.review;
    opts?.onStream?.({ content: llmState.reply });
    return llmState.reply;
  });
  jest.doMock('../../../src/language/languageService', () => ({
    LANGUAGES: [{ code: 'es-ES', name: 'Spanish', native: 'Español' }],
    model: jest.fn(async () => { if (llmState.fails) throw new Error('No model is loaded'); return { generateResponse: generate }; }),
  }));
  jest.doMock('../../../src/language/voices', () => ({ slotForText: () => 0, voiceForSlot: async () => 'voice-a' }));
  const sessions: Session[] = [];
  jest.doMock('../../../src/language/listenTurn', () => ({
    listenInLanguage: jest.fn(async (_c: string, opts: { onPartial?: (p: string) => void; onTranscribing?: () => void }) => {
      if (o.listen === 'none') return null;
      if (o.listen === 'throws') throw new Error('microphone busy');
      opts.onPartial?.('Qui');
      opts.onTranscribing?.();
      const s: Session = { stop: jest.fn(), cancel: jest.fn(), result: sessions.length >= 3 ? new Promise<string>(() => undefined) : Promise.resolve(o.heard ?? 'Quiero un café') };
      sessions.push(s);
      return s;
    }),
  }));
  const { createCall } = require('../../../src/language/callService');
  const { scenarioFor } = require('../../../src/language/phoneCall');
  const { useLanguage } = require('../../../src/language/store');
  useLanguage.setState({ language: 'es-ES', level: 1 });
  const call = createCall(scenarioFor('food'));
  return { call, spoken, sessions, generate, llmState };
}
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

describe('answering the phone', () => {
  it('loads the model, lets the caller speak sentence by sentence, then listens', async () => {
    const t = load();
    expect(t.call.state().phase).toBe('ringing');
    t.call.start();
    t.call.start();
    expect(t.call.state().note).toMatch(/Loading the AI model/);
    await tick();
    expect(t.spoken.slice(0, 2)).toEqual(['Hola.', '¿Qué desea tomar?']);
    expect(t.call.state().turns[0]).toMatchObject({ who: 'them' });
    expect(['listening', 'thinking', 'transcribing', 'speaking']).toContain(t.call.state().phase);
  });

  it('says the model is needed when it cannot load, and retries when the learner taps talk', async () => {
    const t = load({ model: 'fails' });
    t.call.start();
    await tick();
    expect(t.call.state()).toMatchObject({ phase: 'idle', needsModel: true });
    t.call.talk();
    await tick();
    expect(t.call.state().note).toMatch(/No model/);
    t.llmState.fails = false;
    t.call.talk();
    await tick();
    expect(t.call.state().needsModel).toBe(false);
  });

  it('says so when the caller says nothing', async () => {
    const t = load({ reply: '   ' });
    t.call.start();
    await tick();
    expect(t.call.state()).toMatchObject({ phase: 'idle' });
    expect(t.call.state().note).toMatch(/did not say anything/);
  });
});

describe('the learner\'s turn', () => {
  it('uses what was heard, counts the turn, and passes after enough turns', async () => {
    const t = load({ heard: 'Quiero un café' });
    t.call.start();
    await tick(30);
    expect(t.call.state().turns.some((x: any) => x.who === 'me')).toBe(true);
    expect(t.call.state().partial).toBeDefined();
    t.call.doneTalking();
    for (let i = 0; i < 6; i++) t.call.say(`Línea ${i} del estudiante`);
    await tick(30);
    expect(t.call.state().passed).toBe(true);
  });

  it('asks the learner to try again when nothing was heard, and to type when there is no recognizer or it fails', async () => {
    const quiet = load({ heard: '   ' });
    quiet.call.start();
    await tick(30);
    expect(quiet.call.state().note).toMatch(/Nothing heard/);
    const none = load({ listen: 'none' });
    none.call.start();
    await tick(30);
    expect(none.call.state()).toMatchObject({ typing: true });
    const broken = load({ listen: 'throws' });
    broken.call.start();
    await tick(30);
    expect(broken.call.state().note).toMatch(/microphone busy/);
    none.call.say('   ');
  });

  it('interrupts the caller when the learner taps talk', async () => {
    const t = load();
    t.call.start();
    await tick(30);
    t.call.talk();
    await tick(30);
    expect(t.sessions.length).toBeGreaterThan(0);
  });
});

describe('hints and hanging up', () => {
  it('offers a two-line hint, or the raw line when it is not in that form, and reports a failure', async () => {
    const good = load({ hint: 'Line 1: Quiero un café.\nLine 2: I want a coffee.' });
    good.call.start();
    await tick(30);
    good.call.askHint();
    await tick();
    expect(good.call.state().hint).toMatchObject({ say: expect.any(String) });
    const raw = load({ hint: 'Un café, por favor.\nextra' });
    raw.call.start();
    await tick(30);
    raw.call.askHint();
    await tick();
    expect(raw.call.state().hint).not.toBeNull();
    const failing = load();
    failing.call.start();
    await tick(30);
    failing.llmState.fails = true;
    failing.call.askHint();
    await tick();
    expect(failing.call.state().note).toMatch(/No model/);
  });

  it('checks the learner\'s lines on hang up, skips the check with none, and reports a failed check', async () => {
    const none = load();
    await none.call.hangUp();
    expect(none.call.state()).toMatchObject({ phase: 'ended', corrections: [] });
    const some = load({ review: '- Yo quiero café | Quiero café | pronoun left out' });
    some.call.start();
    await tick(30);
    some.call.say('Yo quiero café');
    await tick(30);
    await some.call.hangUp();
    expect(some.call.state().corrections).not.toBeNull();
    const failing = load();
    failing.call.start();
    await tick(30);
    failing.call.say('Hola amigo');
    await tick(10);
    failing.llmState.fails = true;
    await failing.call.hangUp();
    expect(failing.call.state().note).toMatch(/Could not check your lines/);
  });

  it('subscribes, unsubscribes, and disposes without checking', async () => {
    const t = load();
    const fn = jest.fn();
    const off = t.call.subscribe(fn);
    t.call.start();
    await tick();
    expect(fn).toHaveBeenCalled();
    off();
    t.call.dispose();
    t.call.talk();
  });
});

export {};
