/** A tiny SoundFont 2 file made in memory for tests: one looped sine sample (A440, root key 69) for program 0, and one short click for the drum kit (bank 128). */
const u16 = (n: number) => [n & 255, (n >> 8) & 255];
const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
const s16 = (n: number) => u16(n & 0xffff);
const str = (s: string, len: number) => Array.from({ length: len }, (_, i) => (i < s.length ? s.charCodeAt(i) : 0));
const chunk = (id: string, body: number[]) => [...str(id, 4).map((c) => c), ...u32(body.length), ...body, ...(body.length % 2 ? [0] : [])];
const list = (type: string, chunks: number[][]) => chunk('LIST', [...str(type, 4), ...chunks.flat()]);

export function buildSf2(): Uint8Array {
  const RATE = 22050;
  const sine = Array.from({ length: 2205 }, (_, i) => Math.round(Math.sin(2 * Math.PI * 440 * i / RATE) * 20000)); // exactly 441 cycles per 100 ms
  const click = Array.from({ length: 800 }, (_, i) => Math.round(Math.sin(i * 0.9) * 22000 * Math.exp(-i / 160)));
  const data = [...sine, ...[0, 0, 0, 0], ...click, ...[0, 0, 0, 0]];
  const clickAt = sine.length + 4;
  const smpl = data.flatMap((v) => s16(v));
  // shdr: name, start, end, startLoop, endLoop, rate, rootKey, correction, link, type; last is EOS
  const sh = (name: string, a: number[]) => [...str(name, 20), ...u32(a[0]), ...u32(a[1]), ...u32(a[2]), ...u32(a[3]), ...u32(RATE), a[4], 0, ...u16(0), ...u16(1)];
  const shdr = [...sh('sine', [0, sine.length, 0, sine.length, 69]), ...sh('click', [clickAt, clickAt + click.length, clickAt, clickAt + click.length, 36]), ...str('EOS', 20), ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0), 0, 0, ...u16(0), ...u16(0)];
  const gen = (oper: number, amount: number[]) => [...u16(oper), ...amount];
  // Instrument 0 (sine): one zone, loops, sample 0, with a short release. Instrument 1 (click): sample 1 on key 36 only.
  const igens = [
    ...gen(54, u16(1)), ...gen(38, s16(-4000)), ...gen(53, u16(0)), // zone 0 (sine)
    ...gen(43, [36, 36]), ...gen(53, u16(1)), // zone 1 (click, key 36)
    ...gen(0, [0, 0]), // terminal
  ];
  const inst = [...str('Sine', 20), ...u16(0), ...str('Click', 20), ...u16(1), ...str('EOI', 20), ...u16(2)];
  // Instrument 0 has bag 0 only; instrument 1 has bag 1.
  const ibag = [...u16(0), ...u16(0), ...u16(3), ...u16(0), ...u16(5), ...u16(0)];
  const pgens = [...gen(41, u16(0)), ...gen(41, u16(1)), ...gen(0, [0, 0])];
  const pbag = [...u16(0), ...u16(0), ...u16(1), ...u16(0), ...u16(2), ...u16(0)];
  const phdr = [
    ...str('Sine Piano', 20), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0),
    ...str('Kit', 20), ...u16(0), ...u16(128), ...u16(1), ...u32(0), ...u32(0), ...u32(0),
    ...str('EOP', 20), ...u16(0), ...u16(0), ...u16(2), ...u32(0), ...u32(0), ...u32(0),
  ];
  const zero = (n: number) => new Array(n).fill(0);
  const pdta = list('pdta', [
    chunk('phdr', phdr), chunk('pbag', pbag), chunk('pmod', zero(10)), chunk('pgen', pgens),
    chunk('inst', inst), chunk('ibag', ibag), chunk('imod', zero(10)), chunk('igen', igens), chunk('shdr', shdr),
  ]);
  const body = [...str('sfbk', 4), ...list('INFO', [chunk('INAM', [...str('Test font', 10)])]), ...list('sdta', [chunk('smpl', smpl)]), ...pdta];
  return new Uint8Array([...str('RIFF', 4), ...u32(body.length), ...body]);
}
