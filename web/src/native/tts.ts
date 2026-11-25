// AtlasTts for the web / Windows builds. Two engines behind one module, chosen the way the Android module
// does it: a natural (neural) voice when one is selected and loaded, otherwise the system voice
// (speechSynthesis: the OS voices in Chrome / Edge / Windows).
import { bus, registerNativeModule } from './registry';
import { fs, dirName } from '../host/fs';
import { speechChunks } from '../engines/tts/chunks';
import { PcmQueue, toWav, type Chunk } from '../engines/tts/pcmPlayer';
import { isKokoro, kokoroInstalled, loadKokoro, removeKokoro, speakerCount, synth } from '../engines/tts/kokoro';

const synthApi: SpeechSynthesis | undefined = typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined;
let rate = 1;
let pitch = 1;
let voiceName = '';
let neural: { id: string; sid: number } | null = null;
let fileCancel = false;

interface Job {
  id: string;
  stopped: boolean;
  /** Called by stop(); engines abort their work. */
  abort: () => void;
}
let current: Job | null = null;
function begin(id: string, abort: () => void): Job {
  stopCurrent();
  return (current = { id, stopped: false, abort });
}
function stopCurrent() {
  const j = current;
  if (!j) return;
  current = null;
  j.stopped = true;
  try { j.abort(); } catch { /* ignore */ }
  bus.emit('AtlasTtsStopped', { utteranceId: j.id });
}
const finish = (j: Job, ok = true, message?: string) => {
  if (j.stopped || current !== j) return;
  current = null;
  if (ok) bus.emit('AtlasTtsDone', { utteranceId: j.id });
  else bus.emit('AtlasTtsError', { utteranceId: j.id, message: message ?? 'The voice failed' });
};

// ---- system voice ----------------------------------------------------------------------------------
function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const all = synthApi?.getVoices() ?? [];
  if (voiceName) { const v = all.find((x) => x.name === voiceName || x.voiceURI === voiceName); if (v) return v; }
  if (lang) {
    const base = lang.toLowerCase().split(/[-_]/)[0];
    return all.find((x) => x.lang.toLowerCase().replace('_', '-') === lang.toLowerCase()) ?? all.find((x) => x.lang.toLowerCase().startsWith(base) && x.localService) ?? all.find((x) => x.lang.toLowerCase().startsWith(base));
  }
  return undefined;
}
function sayChunk(text: string, lang: string, onStart?: () => void): { done: Promise<void>; } {
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang);
  if (v) { u.voice = v; u.lang = v.lang; } else if (lang) u.lang = lang;
  u.rate = Math.max(0.1, Math.min(4, rate));
  u.pitch = Math.max(0, Math.min(2, pitch));
  keep.add(u); // Chrome garbage-collects an utterance that is only referenced by the queue, and the end event never fires
  const done = new Promise<void>((res, rej) => {
    u.onstart = () => onStart?.();
    u.onend = () => { keep.delete(u); res(); };
    u.onerror = (e) => { keep.delete(u); (e.error === 'canceled' || e.error === 'interrupted') ? res() : rej(new Error(`speech error: ${e.error}`)); };
  });
  synthApi!.speak(u);
  return { done };
}
const keep = new Set<SpeechSynthesisUtterance>();

// ---- neural -------------------------------------------------------------------------------------------
async function neuralSpeak(text: string, id: string, rateNow: number) {
  const q = new PcmQueue();
  const job = begin(id, () => q.stop());
  q.onFirstSound = () => !job.stopped && bus.emit('AtlasTtsStart', { utteranceId: id });
  const parts = speechChunks(text, 380);
  (async () => {
    try {
      let last: Promise<void> = Promise.resolve();
      for (const p of parts) {
        if (job.stopped) return;
        // Keep about 4 seconds of audio ahead; synthesising faster than that only wastes battery.
        while (q.buffered > 4 && !job.stopped) await new Promise((r) => setTimeout(r, 120));
        if (job.stopped) return;
        const chunk = await synth(p, neural!.id, neural!.sid, rateNow);
        if (job.stopped) return;
        last = q.push(chunk);
      }
      await last;
      finish(job);
    } catch (e: any) { finish(job, false, String(e?.message ?? e)); }
  })();
}

// ---- streaming (speak while the answer is still being written) ------------------------------------------
interface Stream { job: Job; pending: string; queue: string[]; ended: boolean; wake?: () => void; q?: PcmQueue; lang: string }
let stream: Stream | null = null;
const SENT = /^([\s\S]*?[.!?…]["')\]]*)(\s+)/;
function takeSentences(s: Stream, flush: boolean) {
  for (let m = SENT.exec(s.pending); m; m = SENT.exec(s.pending)) { s.queue.push(m[1]); s.pending = s.pending.slice(m[0].length); }
  if (flush && s.pending.trim()) { s.queue.push(...speechChunks(s.pending)); s.pending = ''; }
  while (s.queue.length && s.queue[0].length > 380) s.queue.splice(0, 1, ...speechChunks(s.queue[0]));
  s.wake?.();
}
async function runStream(s: Stream) {
  try {
    let last: Promise<void> = Promise.resolve();
    let started = false;
    for (;;) {
      if (s.job.stopped) return;
      const next = s.queue.shift();
      if (next === undefined) {
        if (s.ended) break;
        await new Promise<void>((r) => (s.wake = r));
        continue;
      }
      if (neural && s.q) {
        while (s.q.buffered > 4 && !s.job.stopped) await new Promise((r) => setTimeout(r, 120));
        const chunk = await synth(next, neural.id, neural.sid, rate);
        if (s.job.stopped) return;
        last = s.q.push(chunk);
      } else {
        const { done } = sayChunk(next, s.lang, () => { if (!started) { started = true; bus.emit('AtlasTtsStart', { utteranceId: s.job.id }); } });
        last = done;
        await done; // one system utterance at a time keeps stop() immediate
      }
    }
    await last;
    finish(s.job);
  } catch (e: any) { finish(s.job, false, String(e?.message ?? e)); }
}

registerNativeModule('AtlasTts', {
  addListener() {}, removeListeners() {},
  async warmUp() {
    synthApi?.getVoices();
    if (neural) void loadKokoro().catch(() => undefined);
    return true;
  },
  async setRate(r: number) { rate = r || 1; return true; },
  async setPitch(p: number) { pitch = p || 1; return true; },
  async setVoice(name: string) { voiceName = name.startsWith('sid:') ? '' : name; return true; },
  async setEarpiece() { return true; },
  async setVoicesBase() { return true; },
  async keepScreenOn() { return true; },
  async isSpeaking() { return !!current; },
  async speak(text: string, id: string) { return (this as any).speakIn(text, id, ''); },
  async speakIn(text: string, id: string, lang: string) {
    if (neural) { await neuralSpeak(text, id, rate); return true; }
    if (!synthApi) throw new Error('This browser has no speech engine.');
    const parts = speechChunks(text, 280);
    if (!parts.length) { bus.emit('AtlasTtsDone', { utteranceId: id }); return true; }
    synthApi.cancel();
    const job = begin(id, () => synthApi.cancel());
    (async () => {
      try {
        let started = false;
        for (const p of parts) {
          if (job.stopped) return;
          await sayChunk(p, lang, () => { if (!started) { started = true; bus.emit('AtlasTtsStart', { utteranceId: id }); } }).done;
        }
        finish(job);
      } catch (e: any) { finish(job, false, String(e?.message ?? e)); }
    })();
    return true;
  },
  async speakStreamStart(id: string) {
    synthApi?.cancel();
    const s: Stream = { job: begin(id, () => { synthApi?.cancel(); s.q?.stop(); s.ended = true; s.wake?.(); }), pending: '', queue: [], ended: false, lang: '' };
    if (neural) s.q = new PcmQueue();
    if (s.q) s.q.onFirstSound = () => !s.job.stopped && bus.emit('AtlasTtsStart', { utteranceId: id });
    stream = s;
    void runStream(s);
    return true;
  },
  async speakStreamAppend(text: string) {
    if (!stream || stream.job.stopped) return true;
    stream.pending += text;
    takeSentences(stream, false);
    return true;
  },
  async speakStreamEnd() {
    if (!stream) return true;
    stream.ended = true;
    takeSentences(stream, true);
    stream.wake?.();
    return true;
  },
  async stop() { synthApi?.cancel(); stopCurrent(); return true; },
  async cancelSynthesis() { fileCancel = true; return true; },
  async listVoices(lang: string) {
    if (neural) return Array.from({ length: speakerCount(neural.id) }, (_, i) => ({ name: `sid:${i}`, locale: 'en-US', quality: 500 }));
    const get = () => synthApi?.getVoices() ?? [];
    let voices = get();
    if (!voices.length && synthApi) await new Promise<void>((res) => { const t = setTimeout(res, 1500); synthApi.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true }); }), (voices = get());
    const base = (lang || '').toLowerCase().split(/[-_]/)[0];
    return voices.filter((v) => !base || v.lang.toLowerCase().startsWith(base)).sort((a, b) => a.name.localeCompare(b.name)).map((v) => ({ name: v.name, locale: v.lang, quality: v.localService ? 400 : 300 }));
  },
  async synthesizeToFile(text: string, outPath: string, lang: string) {
    if (!neural) throw new Error('Saving speech to a file needs a natural voice here (Models > Voice > Kokoro). The browser\'s own voice can only speak out loud.');
    fileCancel = false;
    const chunks: Chunk[] = [];
    for (const p of speechChunks(text, 380)) {
      if (fileCancel) throw new Error('Cancelled');
      chunks.push(await synth(p, neural.id, neural.sid, 1));
    }
    const rate0 = chunks[0]?.rate ?? 24000;
    const total = chunks.reduce((n, c) => n + c.samples.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of chunks) { all.set(c.samples, o); o += c.samples.length; }
    await fs().mkdir(dirName(outPath));
    await fs().writeFile(outPath, toWav(all, rate0));
    void lang;
    return outPath;
  },
  // ---- natural voices --------------------------------------------------------------------------------
  async setNeuralVoice(id: string, sid: number) {
    if (!isKokoro(id)) throw new Error('This voice is not available in the web build yet. Kokoro voices are.');
    neural = { id, sid };
    await loadKokoro();
    return speakerCount(id);
  },
  async setNeuralSpeaker(sid: number) { if (neural) neural.sid = sid; return true; },
  async installedNeuralVoices() {
    return kokoroInstalled() ? [{ id: 'kokoro-v1-en', bytes: 92 * 1024 * 1024 }, { id: 'kokoro-en', bytes: 92 * 1024 * 1024 }] : [];
  },
  async downloadNeuralVoice(id: string) {
    if (!isKokoro(id)) throw new Error('This voice package is not available in the web build yet. Kokoro voices work offline once downloaded.');
    await loadKokoro((p) => bus.emit('AtlasVoiceDownload', { id, progress: p }));
    return true;
  },
  async cancelNeuralDownload() { return true; },
  async deleteNeuralVoice(id: string) {
    if (isKokoro(id)) { neural = null; await removeKokoro(); }
    return true;
  },
  async importNeuralVoice() { throw new Error('Importing voice files needs the Android or Windows app.'); },
  async downloadAndImportNeuralVoice() { throw new Error('Importing voice files needs the Android or Windows app.'); },
});
