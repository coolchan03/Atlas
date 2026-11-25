// @react-native-voice/voice over the Web Speech API (SpeechRecognition). Where the browser supports
// on-device recognition (Chrome's processLocally) it is requested, so speech stays on the device.
// Atlas's offline Whisper (whisper.rn shim) is the preferred recogniser; this is the "system" one.
const Rec: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

type Handler = ((e: any) => void) | undefined;
let rec: any = null;
let recognizing = false;

const Voice: any = {
  onSpeechStart: undefined as Handler,
  onSpeechEnd: undefined as Handler,
  onSpeechResults: undefined as Handler,
  onSpeechPartialResults: undefined as Handler,
  onSpeechError: undefined as Handler,
  onSpeechVolumeChanged: undefined as Handler,
  onSpeechRecognized: undefined as Handler,
  async isAvailable() { return !!Rec; },
  async getSpeechRecognitionServices() { return Rec ? ['browser'] : []; },
  async isRecognizing() { return recognizing; },
  async start(locale?: string, _opts?: unknown) {
    if (!Rec) throw new Error('This browser has no speech recognition.');
    if (rec) { try { rec.abort(); } catch { /* gone */ } }
    rec = new Rec();
    rec.lang = locale || navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    try { if ('processLocally' in rec) rec.processLocally = true; } catch { /* unsupported */ }
    rec.onstart = () => { recognizing = true; Voice.onSpeechStart?.({}); };
    rec.onend = () => { recognizing = false; Voice.onSpeechEnd?.({}); };
    rec.onerror = (e: any) => { recognizing = false; Voice.onSpeechError?.({ error: { code: e.error, message: e.message || e.error } }); };
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      const texts = Array.from(r as ArrayLike<any>).map((a) => a.transcript);
      (r.isFinal ? Voice.onSpeechResults : Voice.onSpeechPartialResults)?.({ value: texts });
    };
    rec.start();
  },
  async stop() { try { rec?.stop(); } catch { /* not running */ } },
  async cancel() { try { rec?.abort(); } catch { /* not running */ } },
  async destroy() { try { rec?.abort(); } catch { /* not running */ } rec = null; recognizing = false; },
  removeAllListeners() {
    for (const k of ['onSpeechStart', 'onSpeechEnd', 'onSpeechResults', 'onSpeechPartialResults', 'onSpeechError', 'onSpeechVolumeChanged', 'onSpeechRecognized']) Voice[k] = undefined;
  },
};
export default Voice;
export type SpeechResultsEvent = { value?: string[] };
export type SpeechErrorEvent = { error?: { code?: string; message?: string } };
export type SpeechStartEvent = object;
export type SpeechEndEvent = object;
export type SpeechVolumeChangeEvent = { value?: number };
