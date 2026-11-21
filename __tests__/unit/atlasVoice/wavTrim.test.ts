import { trimWavSilence, readPcm16, fromBase64 } from '../../../src/atlasVoice/wavTrim';
import { wavBytes, toBase64 } from '../../../src/atlasVoice/jingles';

const RATE = 22050;
/** `lead` seconds of silence, `speech` seconds of a tone, `tail` seconds of silence, as a mono 16-bit WAV. */
function line(lead: number, speech: number, tail: number, rate = RATE): Uint8Array {
  const a = Math.round(lead * rate), b = Math.round(speech * rate), c = Math.round(tail * rate);
  const s = new Int16Array(a + b + c);
  for (let i = 0; i < b; i++) s[a + i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 12000);
  return wavBytes(s, rate);
}
const seconds = (bytes: Uint8Array): number => { const p = readPcm16(bytes)!; return p.dataLength / 2 / p.channels / p.rate; };

describe('trimming the silence of a rendered line', () => {
  it('cuts long silence at both ends down to a short lead and tail, keeping all the speech', () => {
    const original = line(0.5, 2.0, 0.6);
    const out = trimWavSilence(original)!;
    expect(out).not.toBeNull();
    expect(seconds(original)).toBeCloseTo(3.1, 2);
    expect(seconds(out)).toBeCloseTo(0.12 + 2.0 + 0.08, 1); // lead + speech + tail
    expect(readPcm16(out)).toMatchObject({ rate: RATE, channels: 1 });
    // the speech itself is intact: the same loud samples survive
    const loudCount = (b: Uint8Array) => { const p = readPcm16(b)!; const v = new DataView(b.buffer, b.byteOffset); let n = 0; for (let i = 0; i < p.dataLength / 2; i++) if (Math.abs(v.getInt16(p.dataStart + i * 2, true)) > 1000) n++; return n; };
    expect(loudCount(out)).toBe(loudCount(original));
  });

  it('leaves a line alone when there is little to trim, or nothing but silence', () => {
    expect(trimWavSilence(line(0.12, 1.0, 0.08))).toBeNull();
    expect(trimWavSilence(line(0.2, 1.0, 0.1))).toBeNull(); // saves under 0.15 s
    expect(trimWavSilence(line(1.0, 0, 1.0))).toBeNull(); // all quiet
  });

  it('writes a valid file that can be trimmed no further', () => {
    const out = trimWavSilence(line(0.7, 1.0, 0.7))!;
    expect(readPcm16(out)).not.toBeNull();
    expect(trimWavSilence(out)).toBeNull();
  });

  it('never alters anything that is not plain 16-bit PCM', () => {
    expect(trimWavSilence(new Uint8Array(10))).toBeNull();
    expect(trimWavSilence(new TextEncoder().encode('not a wav file at all, just some text, long enough to pass the length check'))).toBeNull();
    const float = line(0.5, 1, 0.5);
    float[20] = 3; // format tag 3 = IEEE float
    expect(trimWavSilence(float)).toBeNull();
    const eightBit = line(0.5, 1, 0.5);
    eightBit[34] = 8;
    expect(trimWavSilence(eightBit)).toBeNull();
  });

  it('handles stereo, and a streamed file whose data size says 0', () => {
    const rate = 16000;
    const frames = rate * 2;
    const stereo = new Int16Array(frames * 2);
    for (let i = rate * 0.5; i < rate * 1.5; i++) { stereo[i * 2] = 9000; stereo[i * 2 + 1] = -9000; }
    const base = wavBytes(stereo, rate); // this writer makes mono headers: rewrite as 2 channels
    const view = new DataView(base.buffer);
    view.setUint16(22, 2, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true);
    const out = trimWavSilence(base)!;
    expect(readPcm16(out)!.channels).toBe(2);
    expect(seconds(out)).toBeCloseTo(0.12 + 1.0 + 0.08, 1);
    const streamed = line(0.8, 1.0, 0.8);
    new DataView(streamed.buffer).setUint32(40, 0, true); // size unknown
    expect(seconds(trimWavSilence(streamed)!)).toBeCloseTo(1.2, 1);
  });

  it('a soft opening is not cut into (the lead keeps the fade-in)', () => {
    const rate = RATE; const s = new Int16Array(rate * 2);
    for (let i = 0; i < rate; i++) s[Math.round(0.7 * rate) + i] = Math.round(Math.sin((2 * Math.PI * 200 * i) / rate) * (i < 800 ? 300 + i * 10 : 8000)); // fades in
    const out = trimWavSilence(wavBytes(s, rate))!;
    const p = readPcm16(out)!; const v = new DataView(out.buffer);
    let firstAbove = 0; while (Math.abs(v.getInt16(p.dataStart + firstAbove * 2, true)) < 131) firstAbove++;
    expect(firstAbove / rate).toBeGreaterThan(0.09); // about 0.12 s of lead remains before the first sound
  });
});

describe('base64', () => {
  it.each([[[]], [[1]], [[1, 2]], [[1, 2, 3]], [[255, 0, 128, 7, 99]], [Array.from({ length: 300 }, (_, i) => i % 256)]])('round-trips %j', (list) => {
    const bytes = new Uint8Array(list as number[]);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
