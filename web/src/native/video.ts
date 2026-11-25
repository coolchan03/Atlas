// AtlasVideo for the web / desktop builds: narrated slides saved as a video file.
// The app has already written one WAV per slide. Each slide is drawn on a canvas and the canvas
// and the narration are recorded together with MediaRecorder (MP4 where the browser can write it,
// WebM otherwise). Recording runs in real time, so the video takes as long as the narration.
import { bus, registerNativeModule } from './registry';
import { fs, baseName } from '../host/fs';
import { saveToUser, blobUrlFor } from '../host/files';

interface SlideSpec { title: string; bullets: string[]; wav: string }

const W = 1280;
const H = 720;
const PAD = 72;
let cancelled = false;

const progress = (fraction: number, stage: 'audio' | 'video' | 'done') => bus.emit('AtlasVideoProgress', { fraction, stage });

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Same layout as the Android renderer: title, up to five bullets, progress bar, slide counter. */
function drawSlide(ctx: CanvasRenderingContext2D, slide: SlideSpec, index: number, total: number) {
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, W, H);
  const width = W - PAD * 2;
  const font = (px: number) => `${px}px system-ui, sans-serif`;
  const bullets = slide.bullets.slice(0, 5);
  let scale = 1;
  let titleLines: string[] = [];
  let bulletLines: string[][] = [];
  for (;;) {
    ctx.font = font(56 * scale); titleLines = wrap(ctx, slide.title, width);
    ctx.font = font(36 * scale); bulletLines = bullets.map((b) => wrap(ctx, `•  ${b}`, width));
    const height = titleLines.length * 56 * scale * 1.15 + 36 + bulletLines.reduce((n, l) => n + l.length * 36 * scale * 1.15 + 22 * scale, 0);
    if (height <= H - PAD * 2 - 40 || scale <= 0.5) break;
    scale -= 0.05;
  }
  ctx.textBaseline = 'top';
  let y = PAD;
  ctx.fillStyle = '#FFFFFF'; ctx.font = font(56 * scale);
  for (const l of titleLines) { ctx.fillText(l, PAD, y); y += 56 * scale * 1.15; }
  y += 36;
  ctx.fillStyle = '#CBD5E1'; ctx.font = font(36 * scale);
  for (const block of bulletLines) {
    for (const l of block) { ctx.fillText(l, PAD, y); y += 36 * scale * 1.15; }
    y += 22 * scale;
  }
  ctx.fillStyle = '#1E293B'; ctx.fillRect(0, H - 10, W, 10);
  ctx.fillStyle = '#10B981'; ctx.fillRect(0, H - 10, (W * (index + 1)) / total, 10);
  ctx.fillStyle = '#64748B'; ctx.font = font(24); ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${index + 1} / ${total}`, W - PAD - 80, H - 30);
}

function pickMime(): { mime: string; ext: string } {
  const MR = (globalThis as any).MediaRecorder;
  for (const mime of ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MR?.isTypeSupported?.(mime)) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  throw new Error('This browser cannot record video.');
}

async function record(slides: SlideSpec[], mime: string): Promise<Blob> {
  const audio = new AudioContext();
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  try {
    progress(0, 'audio');
    const buffers: AudioBuffer[] = [];
    for (const s of slides) {
      const bytes = await fs().readFile(s.wav);
      buffers.push(await audio.decodeAudioData(bytes.slice().buffer as ArrayBuffer));
    }
    const dest = audio.createMediaStreamDestination();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const parts: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise<void>((res, rej) => { rec.onstop = () => res(); rec.onerror = () => rej(new Error('Recording failed.')); });
    const total = buffers.reduce((n, b) => n + b.duration + 0.6, 0);
    let done = 0;
    rec.start(1000);
    for (let i = 0; i < slides.length; i++) {
      if (cancelled) { rec.stop(); await stopped.catch(() => undefined); throw Object.assign(new Error('Stopped'), { code: 'CANCELLED' }); }
      drawSlide(ctx, slides[i], i, slides.length);
      const src = audio.createBufferSource();
      src.buffer = buffers[i];
      src.connect(dest);
      src.start();
      const length = buffers[i].duration + 0.6; // a short pause between slides
      const t0 = performance.now();
      // Re-draw while it plays: captureStream only emits a frame when the canvas changes.
      while ((performance.now() - t0) / 1000 < length) {
        if (cancelled) break;
        await new Promise((r) => setTimeout(r, 200));
        ctx.fillStyle = '#0F172A'; ctx.fillRect(W - 6, 0, 6, 6);
        progress(Math.min(1, (done + (performance.now() - t0) / 1000) / total), 'video');
      }
      done += length;
    }
    rec.stop();
    await stopped;
    return new Blob(parts, { type: mime.split(';')[0] });
  } finally {
    audio.close().catch(() => undefined);
  }
}

registerNativeModule('AtlasVideo', {
  addListener() {}, removeListeners() {},
  async cancel() { cancelled = true; return true; },
  async exportSlides(slidesJson: string, title: string) {
    cancelled = false;
    const slides = JSON.parse(slidesJson) as SlideSpec[];
    const { mime, ext } = pickMime();
    const blob = await record(slides, mime);
    const safe = (title || 'Atlas slides').replace(/[^\w .-]+/g, '').trim().slice(0, 60) || 'Atlas slides';
    const name = `${safe}.${ext}`;
    const out = `/atlas/files/exports/${name}`;
    await fs().mkdir('/atlas/files/exports');
    await fs().writeFile(out, new Uint8Array(await blob.arrayBuffer()));
    await saveToUser(out, name, blob.type);
    progress(1, 'done');
    return { uri: `file://${out}`, name };
  },
  async share(uri: string) {
    const path = uri.replace(/^file:\/\//, '');
    const file = await fs().getFile(path);
    const f = new File([file], baseName(path), { type: file.type || 'video/webm' });
    const nav: any = navigator;
    if (nav.canShare?.({ files: [f] })) { await nav.share({ files: [f], title: f.name }); return true; }
    await saveToUser(path, f.name, f.type);
    return true;
  },
  async open(uri: string) {
    const path = uri.replace(/^file:\/\//, '');
    window.open(await blobUrlFor(path), '_blank');
    return true;
  },
});
