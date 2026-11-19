/**
 * Reads a standard MIDI file (format 0 or 1) into a score Atlas can play, edit, vary and export again. Tracks and channels are sorted into
 * the three parts a score has: the lowest pitched channel is the bass, a channel that often plays 3 or more notes at once is the chords
 * (pad), the rest is the melody; channel 10 is the drums. Pitches are moved by octaves into the range the editor allows, times are put on
 * the editor's sixteenth-note grid, and a file longer than the editor's limit is cut at the limit. Nothing is trusted: every length and
 * count is checked, and a damaged file gives a readable error. Pure.
 */
import { DRUM_ROWS, GRID, MAX_BEATS, MAX_BPM, MAX_NOTES, MAX_PITCH, MIN_BPM, MIN_PITCH, PROGRAM } from './editor';
import type { DrumKind, MusicNote, MusicRole, MusicScore, Voice } from './types';

const MAX_BYTES = 2 * 1024 * 1024;
const GM_VOICE = new Map<number, Voice>((Object.entries(PROGRAM) as Array<[Voice, number]>).map(([voice, program]) => [program, voice]));
const DRUM_BY_PITCH = new Map<number, DrumKind>(DRUM_ROWS.map((d) => [d.pitch, d.kind]));
// General MIDI drum names outside the editor's ten sounds, mapped to the nearest one.
const DRUM_ALIAS: Record<number, DrumKind> = { 35: 'kick', 40: 'snare', 44: 'hat', 51: 'hat', 53: 'hat', 55: 'crash', 57: 'crash', 41: 'tom', 43: 'tom', 47: 'tom', 48: 'tom', 50: 'tom', 54: 'shaker', 69: 'shaker', 82: 'shaker', 75: 'rim', 76: 'rim', 77: 'rim', 56: 'cowbell' };

interface RawNote { channel: number; pitch: number; start: number; end: number; velocity: number }

class Reader {
  pos = 0;
  constructor(readonly b: Uint8Array) {}
  get left(): number { return this.b.length - this.pos; }
  u8(): number { if (this.pos >= this.b.length) throw new Error('The MIDI file ends too early.'); return this.b[this.pos++]; }
  u16(): number { return (this.u8() << 8) | this.u8(); }
  u32(): number { return ((this.u8() * 2 ** 24) + (this.u8() << 16) + (this.u8() << 8) + this.u8()); }
  tag(): string { return String.fromCharCode(this.u8(), this.u8(), this.u8(), this.u8()); }
  vlq(): number { let v = 0; for (let i = 0; i < 4; i++) { const c = this.u8(); v = (v << 7) | (c & 0x7f); if (!(c & 0x80)) return v; } throw new Error('The MIDI file has a damaged time value.'); }
  skip(n: number): void { if (n > this.left) throw new Error('The MIDI file ends too early.'); this.pos += n; }
}

interface TrackResult { notes: RawNote[]; programs: Map<number, number>; tempo?: number; name?: string }

/** A meta event (tempo, track name, end of track); returns true at the end of the track. */
function readMeta(r: Reader, out: TrackResult): boolean {
  const type = r.u8(); const len = r.vlq();
  const from = r.pos; r.skip(len);
  if (type === 0x51 && len === 3 && out.tempo === undefined) out.tempo = (r.b[from] << 16) | (r.b[from + 1] << 8) | r.b[from + 2];
  else if (type === 0x03 && out.name === undefined) out.name = new TextDecoder().decode(r.b.slice(from, from + len)).trim();
  return type === 0x2f;
}

/** A channel event: a program change, or a note starting or stopping (a note on with no loudness is a note off). */
function readChannelEvent(at: { r: Reader; status: number; first: number; tick: number }, out: TrackResult, open: Map<string, RawNote>): void {
  const { r, status, first, tick } = at;
  const kind = status & 0xf0; const channel = status & 0x0f;
  const second = kind === 0xc0 || kind === 0xd0 ? 0 : r.u8();
  if (kind === 0xc0) { out.programs.set(channel, first); return; }
  const key = `${channel}:${first}`;
  const sounding = open.get(key);
  if (kind === 0x90 && second > 0) {
    if (sounding) { sounding.end = tick; out.notes.push(sounding); }
    open.set(key, { channel, pitch: first, start: tick, end: tick, velocity: second });
  } else if ((kind === 0x80 || kind === 0x90) && sounding) {
    sounding.end = tick; out.notes.push(sounding); open.delete(key);
  }
}

function readTrack(r: Reader, end: number): TrackResult {
  const out: TrackResult = { notes: [], programs: new Map() };
  const open = new Map<string, RawNote>();
  let tick = 0; let status = 0;
  while (r.pos < end) {
    tick += r.vlq();
    let first = r.u8();
    if (first === 0xff) { if (readMeta(r, out)) break; continue; }
    if (first === 0xf0 || first === 0xf7) { r.skip(r.vlq()); continue; } // system exclusive
    if (first & 0x80) { status = first; first = r.u8(); } else if (!status) throw new Error('The MIDI file has a damaged event.');
    readChannelEvent({ r, status, first, tick }, out, open);
  }
  for (const n of open.values()) { n.end = Math.max(n.end, tick); out.notes.push(n); }
  return out;
}

/** Moves a pitch by octaves into the editor's range. */
function intoRange(pitch: number): number { let p = pitch; while (p < MIN_PITCH) p += 12; while (p > MAX_PITCH) p -= 12; return p; }

/** Most notes sounding at once in a channel (3 or more, often, means chords). */
function polyphony(notes: RawNote[]): number {
  const edges = notes.flatMap((n) => [[n.start, 1], [n.end, -1]] as Array<[number, number]>).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0; let max = 0;
  for (const [, d] of edges) { now += d; max = Math.max(max, now); }
  return max;
}

/** The header, then every track: all notes, the first program of each channel, the first tempo and the first track's name. */
function readFile(bytes: Uint8Array): { notes: RawNote[]; programs: Map<number, number>; tempo?: number; name?: string; division: number } {
  if (bytes.length > MAX_BYTES) throw new Error('That MIDI file is larger than 2 MB.');
  const r = new Reader(bytes);
  if (r.tag() !== 'MThd') throw new Error('This is not a MIDI file.');
  const headLen = r.u32(); const format = r.u16(); const trackCount = r.u16(); const division = r.u16();
  if (headLen < 6) throw new Error('The MIDI file header is damaged.');
  r.skip(headLen - 6);
  if (format > 1) throw new Error('This kind of MIDI file (several separate songs) is not supported. Use a format 0 or 1 file.');
  if (division & 0x8000 || division === 0) throw new Error('MIDI files timed in frames (not beats) are not supported.');
  const notes: RawNote[] = []; const programs = new Map<number, number>();
  let tempo: number | undefined; let name: string | undefined;
  for (let t = 0; t < Math.min(trackCount, 64) && r.left >= 8; t++) {
    const tag = r.tag(); const len = r.u32();
    if (len > r.left) throw new Error('The MIDI file ends too early.');
    const end = r.pos + len;
    if (tag === 'MTrk') {
      const track = readTrack(r, end);
      notes.push(...track.notes);
      track.programs.forEach((p, c) => { if (!programs.has(c)) programs.set(c, p); });
      tempo = tempo ?? track.tempo;
      if (t === 0 && track.name) name = track.name;
    }
    r.pos = end;
  }
  return { notes, programs, tempo, name, division };
}

/** Which part each pitched channel plays: the lowest is the bass, the one with the most chords is the pad, the rest the melody. */
function assignParts(all: RawNote[]): Map<number, MusicRole> {
  const channels = [...new Set(all.filter((n) => n.channel !== 9).map((n) => n.channel))];
  const stats = channels.map((c) => { const ns = all.filter((n) => n.channel === c); return { c, avg: ns.reduce((s, n) => s + n.pitch, 0) / ns.length, poly: polyphony(ns) }; });
  const parts = new Map<number, MusicRole>();
  if (stats.length < 2) return parts;
  const bass = [...stats].sort((a, b) => a.avg - b.avg)[0];
  if (bass.avg < 55) parts.set(bass.c, 'bass');
  const chords = stats.filter((s) => !parts.has(s.c) && s.poly >= 3).sort((a, b) => b.poly - a.poly)[0];
  if (chords) parts.set(chords.c, 'pad');
  return parts;
}

export function fromMidi(bytes: Uint8Array, fileName = ''): MusicScore {
  const { notes: all, programs, tempo, name: rawName, division } = readFile(bytes);
  if (!all.length) throw new Error('That MIDI file has no notes.');
  const parts = assignParts(all);
  const bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(60_000_000 / (tempo ?? 500_000))));
  const snap = (beat: number) => Math.round(beat / GRID) * GRID;

  const notes: MusicNote[] = [];
  for (const n of [...all].sort((a, b) => a.start - b.start || a.pitch - b.pitch)) {
    const beat = snap(n.start / division);
    if (beat >= MAX_BEATS) continue;
    const length = Math.max(GRID, snap((n.end - n.start) / division));
    const gain = Math.round(Math.max(0.05, Math.min(1, n.velocity / 127)) * 100) / 100;
    if (n.channel === 9) {
      const kind = DRUM_BY_PITCH.get(n.pitch) ?? DRUM_ALIAS[n.pitch];
      if (kind) notes.push({ pitch: DRUM_ROWS.find((d) => d.kind === kind)!.pitch, beat, length: GRID, gain, role: 'perc', voice: kind });
      continue;
    }
    const voice = GM_VOICE.get(programs.get(n.channel) ?? -1);
    notes.push({ pitch: intoRange(n.pitch), beat, length: Math.min(length, MAX_BEATS - beat), gain, role: parts.get(n.channel) ?? 'melody', ...(voice ? { voice } : {}) });
  }
  if (!notes.some((n) => n.role !== 'perc')) throw new Error('That MIDI file has only drums.');
  const name = rawName === 'Atlas tune' ? undefined : rawName; // the name Atlas gives an untitled export
  const base = fileName.replace(/\.[a-z0-9]{1,4}$/i, '').replace(/[_-]+/g, ' ').trim();
  return { title: (name || base || 'Imported tune').slice(0, 70), bpm, notes: notes.slice(0, MAX_NOTES) };
}
