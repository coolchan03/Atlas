/**
 * Real instruments from a SoundFont (.sf2): recordings of actual pianos, guitars, strings, horns and drum kits, played back at the pitch and
 * length of each note. A SoundFont file holds the recordings (samples) and, for each instrument, which sample to use for which keys, how to
 * loop it and how it swells and fades. This reads that file and renders one note from it. Pure: bytes in, samples out, so it is tested without a phone.
 *
 * Supported: presets and instruments with key and velocity zones, sample loops, tuning, the volume envelope (delay, attack, hold, decay,
 * sustain, release) and attenuation. Not supported (left out, the note still plays): filters, modulators, vibrato, reverb and chorus sends.
 */
interface Gens { [oper: number]: number }
interface Zone { keyLo: number; keyHi: number; velLo: number; velHi: number; gens: Gens; ref: number }
interface Sample { start: number; end: number; startLoop: number; endLoop: number; rate: number; rootKey: number; correction: number; type: number }
interface Preset { name: string; program: number; bank: number; zones: Zone[]; global: Gens }
interface Inst { name: string; zones: Zone[]; global: Gens }
export interface Sf2 { name: string; samples: Int16Array; sample: Sample[]; presets: Preset[]; insts: Inst[] }

const text = (b: Uint8Array, at: number, n: number): string => { let s = ''; for (let i = 0; i < n && b[at + i]; i++) s += String.fromCharCode(b[at + i]); return s; };

// Generator operators used here (SoundFont 2.04 specification, section 8.1.2).
const G = { startOffs: 0, endOffs: 1, startLoopOffs: 2, endLoopOffs: 3, startCoarse: 4, endCoarse: 12, pan: 17, delay: 33, attack: 34, hold: 35, decay: 36, sustain: 37, release: 38, instrument: 41, keyRange: 43, velRange: 44, startLoopCoarse: 45, attenuation: 48, endLoopCoarse: 50, coarseTune: 51, fineTune: 52, sampleId: 53, sampleModes: 54, scaleTuning: 56, rootKey: 58 } as const;
const DEFAULT: Gens = { [G.delay]: -12000, [G.attack]: -12000, [G.hold]: -12000, [G.decay]: -12000, [G.sustain]: 0, [G.release]: -12000, [G.scaleTuning]: 100, [G.rootKey]: -1 };

/** Reads a SoundFont 2 file. Throws a readable error when the bytes are not one. */
export function parseSf2(bytes: Uint8Array): Sf2 {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'sfbk') throw new Error('That is not a SoundFont (.sf2) file.');
  let smpl: Int16Array | null = null;
  const pdta: Record<string, { at: number; size: number }> = {};
  let name = '';
  const walk = (from: number, to: number, list: string) => {
    for (let at = from; at + 8 <= to;) {
      const id = text(bytes, at, 4); const size = view.getUint32(at + 4, true); const body = at + 8;
      if (id === 'LIST') walk(body + 4, Math.min(to, body + size), text(bytes, body, 4));
      else if (list === 'sdta' && id === 'smpl') {
        const count = size >> 1;
        smpl = body % 2 === 0 && (bytes.byteOffset + body) % 2 === 0 ? new Int16Array(bytes.buffer, bytes.byteOffset + body, count) : Int16Array.from({ length: count }, (_, i) => view.getInt16(body + i * 2, true));
      } else if (list === 'pdta') pdta[id] = { at: body, size };
      else if (list === 'INFO' && id === 'INAM') name = text(bytes, body, Math.min(size, 64));
      at = body + size + (size & 1);
    }
  };
  walk(12, bytes.length, 'sfbk');
  if (!smpl || !pdta.phdr || !pdta.pbag || !pdta.pgen || !pdta.inst || !pdta.ibag || !pdta.igen || !pdta.shdr) throw new Error('This SoundFont file is incomplete or damaged.');

  const rec = (c: { at: number; size: number }, len: number) => Array.from({ length: Math.floor(c.size / len) }, (_, i) => c.at + i * len);
  const gensOf = (c: { at: number; size: number }) => rec(c, 4).map((o) => ({ oper: view.getUint16(o, true), lo: bytes[o + 2], hi: bytes[o + 3], s16: view.getInt16(o + 2, true), u16: view.getUint16(o + 2, true) }));
  const bagsOf = (c: { at: number; size: number }) => rec(c, 4).map((o) => view.getUint16(o, true));

  const buildZones = ({ bagStart, bagEnd, bags, gens, refOper }: { bagStart: number; bagEnd: number; bags: number[]; gens: ReturnType<typeof gensOf>; refOper: number }) => {
    const zones: Zone[] = []; let global: Gens = {};
    for (let b = bagStart; b < bagEnd; b++) {
      const zone: Zone = { keyLo: 0, keyHi: 127, velLo: 0, velHi: 127, gens: {}, ref: -1 };
      for (let g = bags[b]; g < (bags[b + 1] ?? gens.length); g++) {
        const x = gens[g]; if (!x) continue;
        if (x.oper === G.keyRange) { zone.keyLo = x.lo; zone.keyHi = x.hi; }
        else if (x.oper === G.velRange) { zone.velLo = x.lo; zone.velHi = x.hi; }
        else if (x.oper === refOper) zone.ref = x.u16;
        else zone.gens[x.oper] = x.oper === G.sampleModes ? x.u16 : x.s16;
      }
      if (zone.ref < 0) { if (b === bagStart) global = zone.gens; } else zones.push(zone);
    }
    return { zones, global };
  };

  const pbags = bagsOf(pdta.pbag); const pgens = gensOf(pdta.pgen); const ibags = bagsOf(pdta.ibag); const igens = gensOf(pdta.igen);
  const phdr = rec(pdta.phdr, 38).map((o) => ({ name: text(bytes, o, 20), program: view.getUint16(o + 20, true), bank: view.getUint16(o + 22, true), bag: view.getUint16(o + 24, true) }));
  const presets: Preset[] = phdr.slice(0, -1).map((h, i) => ({ name: h.name, program: h.program, bank: h.bank, ...buildZones({ bagStart: h.bag, bagEnd: phdr[i + 1].bag, bags: pbags, gens: pgens, refOper: G.instrument }) }));
  const ihdr = rec(pdta.inst, 22).map((o) => ({ name: text(bytes, o, 20), bag: view.getUint16(o + 20, true) }));
  const insts: Inst[] = ihdr.slice(0, -1).map((h, i) => ({ name: h.name, ...buildZones({ bagStart: h.bag, bagEnd: ihdr[i + 1].bag, bags: ibags, gens: igens, refOper: G.sampleId }) }));
  const sample: Sample[] = rec(pdta.shdr, 46).map((o) => ({ start: view.getUint32(o + 20, true), end: view.getUint32(o + 24, true), startLoop: view.getUint32(o + 28, true), endLoop: view.getUint32(o + 32, true), rate: view.getUint32(o + 36, true), rootKey: bytes[o + 40], correction: view.getInt8(o + 41), type: view.getUint16(o + 44, true) }));
  return { name, samples: smpl, sample, presets, insts };
}

/** The preset for a bank and program; the drum kit is bank 128. Falls back to the first preset of that program in any bank, then of bank 0. */
export function findPreset(sf: Sf2, bank: number, program: number): Preset | null {
  return sf.presets.find((p) => p.bank === bank && p.program === program) ?? (bank === 128 ? sf.presets.find((p) => p.bank === 128) : sf.presets.find((p) => p.program === program && p.bank === 0)) ?? null;
}

const seconds = (timecents: number): number => 2 ** (timecents / 1200);
const inRange = (z: Zone, key: number, vel: number): boolean => key >= z.keyLo && key <= z.keyHi && vel >= z.velLo && vel <= z.velHi;

export interface NoteRequest { bank: number; program: number; key: number; velocity: number; /** How long the note is held, in seconds. */ held: number; rate: number; /** The most the sound may ring on after the note is let go. */ maxTail?: number; /** A drum hit plays to its end whatever the note length. */ oneShot?: boolean }

/** One note from the SoundFont, as mono samples, or null when the SoundFont has no sound for it. */
export function renderNote(sf: Sf2, req: NoteRequest): Float32Array | null {
  const preset = findPreset(sf, req.bank, req.program);
  if (!preset) return null;
  const layers: Array<{ sample: Sample; gens: Gens; pre: Gens }> = [];
  for (const pz of preset.zones) {
    if (!inRange(pz, req.key, req.velocity)) continue;
    const inst = sf.insts[pz.ref]; if (!inst) continue;
    for (const iz of inst.zones) {
      if (!inRange(iz, req.key, req.velocity)) continue;
      const sample = sf.sample[iz.ref]; if (!sample || sample.type & 0x8000) continue; // a ROM sample has no data here
      layers.push({ sample, gens: { ...DEFAULT, ...inst.global, ...iz.gens }, pre: { ...preset.global, ...pz.gens } });
    }
  }
  if (!layers.length) return null;
  const tail = Math.min(req.maxTail ?? 1.2, 3);
  const total = Math.max(16, Math.ceil((req.held + tail) * req.rate));
  const out = new Float32Array(total);
  for (const layer of layers.slice(0, 4)) mixLayer({ out, layer, req, data: sf.samples });
  return out;
}

interface Voicing { start: number; end: number; loopStart: number; loopEnd: number; looping: boolean; step: number; peak: number }
interface Envelope { delay: number; attack: number; hold: number; decay: number; sustain: number; release: number }

/** How to play a sample for a note: where it starts and ends, its loop, and how fast to step through it to reach the pitch. */
function voicing(layer: { sample: Sample; gens: Gens; pre: Gens }, req: NoteRequest, data: Int16Array): Voicing {
  const { sample: sh, gens: g, pre } = layer;
  const add = (op: number): number => (g[op] ?? 0) + (pre[op] ?? 0);
  const coarse = (op: number, coarseOp: number): number => (g[op] ?? 0) + (g[coarseOp] ?? 0) * 32768;
  const loopStart = sh.startLoop + coarse(G.startLoopOffs, G.startLoopCoarse);
  const loopEnd = sh.endLoop + coarse(G.endLoopOffs, G.endLoopCoarse);
  const root = g[G.rootKey] >= 0 ? g[G.rootKey] : (sh.rootKey > 127 ? 60 : sh.rootKey);
  const cents = (req.key - root) * (g[G.scaleTuning] ?? 100) + add(G.coarseTune) * 100 + add(G.fineTune) + sh.correction;
  return {
    start: sh.start + coarse(G.startOffs, G.startCoarse), end: Math.min(data.length, sh.end + coarse(G.endOffs, G.endCoarse)), loopStart, loopEnd,
    looping: ((g[G.sampleModes] ?? 0) & 1) === 1 && loopEnd - loopStart > 8 && !req.oneShot,
    step: 2 ** (cents / 1200) * (sh.rate || 44100) / req.rate, peak: 10 ** (-Math.max(0, add(G.attenuation)) / 200) / 32768,
  };
}

function envelopeOf(layer: { gens: Gens; pre: Gens }, req: NoteRequest): Envelope {
  const add = (op: number): number => (layer.gens[op] ?? 0) + (layer.pre[op] ?? 0);
  return {
    delay: seconds(add(G.delay)), attack: Math.max(0.001, seconds(add(G.attack))), hold: seconds(add(G.hold)), decay: Math.max(0.005, seconds(add(G.decay))),
    sustain: 10 ** (-Math.max(0, Math.min(1000, add(G.sustain))) / 200), release: Math.max(0.01, Math.min(req.maxTail ?? 1.2, seconds(add(G.release)))),
  };
}

/** The volume at time t while the note is held: silent through the delay, a rise, a hold, then a fall to the sustain level (the fall is 100 dB over the decay time). */
function heldLevel(t: number, e: Envelope): number {
  if (t < e.delay) return 0;
  if (t < e.delay + e.attack) return (t - e.delay) / e.attack;
  if (t < e.delay + e.attack + e.hold) return 1;
  return Math.max(e.sustain, 10 ** (-5 * (t - e.delay - e.attack - e.hold) / e.decay));
}

function mixLayer({ out, layer, req, data }: { out: Float32Array; layer: { sample: Sample; gens: Gens; pre: Gens }; req: NoteRequest; data: Int16Array }): void {
  const v = voicing(layer, req, data);
  const e = envelopeOf(layer, req);
  const heldEnd = req.oneShot ? Infinity : req.held;
  let pos = v.start; let level = 0; let releaseFrom = -1; let releaseAt = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / req.rate;
    if (releaseFrom < 0 && t >= heldEnd) { releaseFrom = level; releaseAt = t; }
    if (releaseFrom < 0) level = heldLevel(t, e);
    else { level = releaseFrom * 10 ** (-5 * (t - releaseAt) / e.release); if (level < 1e-4 || t - releaseAt > e.release * 1.5) break; }
    if (pos >= v.end - 1 && !v.looping) break;
    const k = Math.floor(pos);
    const a = data[k] ?? 0; const b = data[k + 1] ?? a;
    out[i] += (a + (b - a) * (pos - k)) * v.peak * level;
    pos += v.step;
    if (v.looping && pos >= v.loopEnd) pos -= v.loopEnd - v.loopStart;
  }
}
