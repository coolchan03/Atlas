import { cleanForReading, createReadAloud, readingMinutes, splitForReading } from '../../../src/atlasVoice/readAloud';

describe('preparing text to be read aloud', () => {
  it('drops markdown marks, code, images and web addresses but keeps the words', () => {
    const text = cleanForReading('# Title\n\n- **Bold** point with a [link](https://x.test)\n\n```js\nconst a = 1;\n```\n![pic](p.png) See https://example.com now.');
    expect(text).toContain('Title');
    expect(text).toContain('Bold point with a link');
    expect(text).not.toMatch(/const a|https|!\[|\*\*|#/);
  });

  it('keeps whole sentences together up to a size limit and starts a new piece at each paragraph', () => {
    const sentence = 'This is one sentence that is a little bit long. ';
    const parts = splitForReading(`${sentence.repeat(30)}\n\nSecond paragraph here.`);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((p) => p.length <= 600)).toBe(true);
    expect(parts[parts.length - 1]).toBe('Second paragraph here.');
  });

  it('cuts a sentence with no stops at a space, and ignores pieces with no letters', () => {
    const parts = splitForReading(`${'word '.repeat(300)}\n\n-----`);
    expect(parts.every((p) => p.length <= 600)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ').trim()).toBe('word '.repeat(300).trim());
  });

  it('estimates the minutes at a speed and never says zero', () => {
    expect(readingMinutes(1600, 1)).toBe(10);
    expect(readingMinutes(1600, 2)).toBe(5);
    expect(readingMinutes(3, 1)).toBe(1);
  });
});

describe('reading a document one piece at a time', () => {
  /** A voice that finishes each piece when the test says so. */
  function fakeVoice() {
    const spoken: string[] = [];
    let finish: ((ok: boolean) => void) | null = null;
    const stopSpeaking = jest.fn(() => { finish?.(false); finish = null; });
    const speak = (text: string) => new Promise<boolean>((resolve) => { spoken.push(text); finish = resolve; });
    const done = async () => { finish?.(true); finish = null; await Promise.resolve(); await Promise.resolve(); };
    return { spoken, speak, stopSpeaking, done };
  }
  const THREE = 'One. \n\nTwo. \n\nThree.';

  it('reads every piece in order, then goes back to ready at the top', async () => {
    const v = fakeVoice();
    const r = createReadAloud({ speak: v.speak, stopSpeaking: v.stopSpeaking });
    r.load(THREE, 'Doc');
    expect(r.useReader.getState()).toMatchObject({ status: 'idle', index: 0, title: 'Doc' });
    r.play();
    await v.done(); await v.done(); await v.done();
    expect(v.spoken).toEqual(['One.', 'Two.', 'Three.']);
    expect(r.useReader.getState()).toMatchObject({ status: 'idle', index: 0 });
  });

  it('pauses where it is and resumes from that piece', async () => {
    const v = fakeVoice();
    const r = createReadAloud({ speak: v.speak, stopSpeaking: v.stopSpeaking });
    r.load(THREE);
    r.play();
    await v.done();
    r.pause();
    await Promise.resolve();
    expect(r.useReader.getState()).toMatchObject({ status: 'paused', index: 1 });
    r.play();
    await v.done(); await v.done();
    expect(v.spoken).toEqual(['One.', 'Two.', 'Two.', 'Three.']);
  });

  it('stop returns to the top, and skip moves by whole pieces and carries on reading', async () => {
    const v = fakeVoice();
    const r = createReadAloud({ speak: v.speak, stopSpeaking: v.stopSpeaking });
    r.load(THREE);
    r.jump(1);
    expect(r.useReader.getState().index).toBe(1);
    r.jump(10);
    expect(r.useReader.getState().index).toBe(2);
    r.jump(-10);
    r.play();
    await Promise.resolve();
    r.jump(1);
    await Promise.resolve();
    expect(r.useReader.getState()).toMatchObject({ status: 'reading', index: 1 });
    expect(v.spoken.slice(-1)).toEqual(['Two.']);
    r.stop();
    expect(r.useReader.getState()).toMatchObject({ status: 'idle', index: 0 });
  });

  it('keeps its place when something else takes over the voice', async () => {
    const v = fakeVoice();
    const r = createReadAloud({ speak: v.speak, stopSpeaking: v.stopSpeaking });
    r.load(THREE);
    r.play();
    await v.done();
    // The voice reports "stopped" without the reader asking (a chat reply started speaking).
    (v as any).stopSpeaking();
    await Promise.resolve(); await Promise.resolve();
    expect(r.useReader.getState()).toMatchObject({ status: 'paused', index: 1 });
  });

  it('does nothing when there is no text', () => {
    const v = fakeVoice();
    const r = createReadAloud({ speak: v.speak, stopSpeaking: v.stopSpeaking });
    r.load('   ');
    r.play();
    expect(v.spoken).toEqual([]);
    expect(r.useReader.getState().status).toBe('idle');
  });
});

describe('while the voice is getting ready', () => {
  it('says it is preparing from the moment play is pressed until sound starts, and not after a stop or a pause', async () => {
    let start: () => void = () => undefined;
    const gate: { finish: (v: boolean) => void } = { finish: () => undefined };
    const reader = createReadAloud({
      speak: () => new Promise<boolean>((resolve) => { gate.finish = resolve; }), stopSpeaking: jest.fn(),
      watchStart: (cb: () => void) => { start = cb; return () => undefined; },
    });
    reader.load('Hey man how is it going');
    expect(reader.useReader.getState().preparing).toBe(false);
    reader.play();
    expect(reader.useReader.getState()).toMatchObject({ status: 'reading', preparing: true });
    start();
    expect(reader.useReader.getState().preparing).toBe(false);
    gate.finish(true);
    await new Promise((r) => setImmediate(r));
    expect(reader.useReader.getState()).toMatchObject({ status: 'idle', preparing: false });
    reader.load('Another sentence here');
    reader.play();
    expect(reader.useReader.getState().preparing).toBe(true);
    reader.pause();
    expect(reader.useReader.getState().preparing).toBe(false);
    reader.play();
    reader.stop();
    expect(reader.useReader.getState().preparing).toBe(false);
  });
});
