// react-native-audio-api over the Web Audio API: AudioContext (with decodeAudioData reading the app's file
// paths), AudioRecorder (microphone -> 16-bit WAV file in the virtual file system, plus live buffers) and
// AudioManager (session handling that browsers do not need).
import { fs, norm, trackWrite, dirName } from '../host/fs';
import { toWav } from '../engines/tts/pcmPlayer';

export class AudioContext extends ((globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext ?? class {}) {
  async decodeAudioData(input: string | ArrayBuffer, ...rest: any[]) {
    let buf = input as ArrayBuffer;
    if (typeof input === 'string') {
      const bytes = /^(https?:|blob:|data:)/.test(input) ? new Uint8Array(await (await fetch(input)).arrayBuffer()) : await fs().readFile(norm(input));
      buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }
    return (super.decodeAudioData as any)(buf, ...rest);
  }
}

const listeners = new Map<string, Set<(e: any) => void>>();
export const AudioManager = {
  setAudioSessionOptions() {},
  async setAudioSessionActivity() { return true; },
  observeAudioInterruptions() {},
  addSystemEventListener(event: string, cb: (e: any) => void) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
    return { remove: () => listeners.get(event)?.delete(cb) };
  },
  getDevicesInfo: async () => ({ availableInputs: [], availableOutputs: [], currentInputs: [], currentOutputs: [] }),
  requestRecordingPermissions: async () => 'Granted',
  checkRecordingPermissions: async () => 'Granted',
  setLockScreenInfo() {}, resetLockScreenInfo() {}, enableRemoteCommand() {},
};

export const FileFormat = { Wav: 'wav', Caf: 'caf', M4A: 'm4a', Flac: 'flac' } as const;
export const FileDirectory = { Document: 'document', Cache: 'cache' } as const;
export const BitDepth = { Bit16: 16, Bit24: 24, Bit32: 32 } as const;
export const IOSAudioQuality = { Min: 0, Low: 1, Medium: 2, High: 3, Max: 4 } as const;
export const FlacCompressionLevel = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6, L7: 7, L8: 8 } as const;

export class AudioRecorder {
  private cfg: any = null;
  private onReady: { cfg: { sampleRate: number; bufferLength: number }; cb: (e: any) => void } | null = null;
  private ctx: any = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;
  private path = '';
  private failed: string | null = null;
  private ready: Promise<void> = Promise.resolve();

  enableFileOutput(cfg: any) {
    this.cfg = cfg;
    return { status: 'success' };
  }
  onAudioReady(cfg: { sampleRate: number; bufferLength: number }, cb: (e: any) => void) {
    this.onReady = { cfg, cb };
  }
  clearOnAudioReady() { this.onReady = null; }

  /** Synchronous like the native API; the microphone opens in the background and failures surface from stop(). */
  start() {
    const rate = this.onReady?.cfg.sampleRate ?? this.cfg?.preset?.sampleRate ?? 16000;
    const sub = this.cfg?.subDirectory ?? 'audio-input';
    this.path = `/atlas/files/${sub}/${this.cfg?.fileNamePrefix ?? `rec_${Date.now()}`}.wav`;
    this.chunks = [];
    this.failed = null;
    this.startedAt = performance.now();
    this.ready = (async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const Ctor = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
        this.ctx = new Ctor({ sampleRate: rate });
        const src = this.ctx.createMediaStreamSource(this.stream);
        const size = 4096;
        this.node = this.ctx.createScriptProcessor(size, 1, 1);
        const mute = this.ctx.createGain();
        mute.gain.value = 0;
        this.node!.onaudioprocess = (e: AudioProcessingEvent) => {
          const data = new Float32Array(e.inputBuffer.getChannelData(0));
          this.chunks.push(data);
          if (this.onReady) {
            const want = this.onReady.cfg.bufferLength || data.length;
            for (let i = 0; i < data.length; i += want) {
              const part = data.subarray(i, Math.min(data.length, i + want));
              this.onReady.cb({ buffer: { getChannelData: () => part, length: part.length, sampleRate: rate }, numFrames: part.length });
            }
          }
        };
        src.connect(this.node!);
        this.node!.connect(mute);
        mute.connect(this.ctx.destination);
      } catch (e: any) {
        this.failed = e?.name === 'NotAllowedError' ? 'Microphone permission denied' : String(e?.message ?? e);
      }
    })();
    return { status: 'success', path: this.path };
  }
  stop() {
    const rate = this.ctx?.sampleRate ?? 16000;
    const duration = (performance.now() - this.startedAt) / 1000;
    const path = this.path;
    const chunks = this.chunks;
    const done = this.ready.then(async () => {
      try { this.node?.disconnect(); } catch { /* ok */ }
      this.stream?.getTracks().forEach((t) => t.stop());
      try { await this.ctx?.close(); } catch { /* ok */ }
      if (this.failed) throw new Error(this.failed);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(total);
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      await fs().mkdir(dirName(path));
      await fs().writeFile(path, toWav(all, rate));
    });
    trackWrite(path, done);
    done.catch(() => undefined);
    this.node = null; this.stream = null; this.ctx = null;
    return { status: 'success', path, duration };
  }
}
