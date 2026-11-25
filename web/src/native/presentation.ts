// AtlasPresentationExporter: PDF slides (jsPDF), and saving / sharing the PPTX the app builds itself.
import { registerNativeModule } from './registry';
import { fs, norm, baseName } from '../host/fs';
import { saveToUser } from '../host/files';

interface Slide { layout: string; title: string; subtitle: string; bullets: string[] }
interface Template { background: string; foreground: string; secondary: string; accent: string; panel: string }
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];

async function exportsDir(name: string) {
  const dir = '/atlas/files/exports';
  await fs().mkdir(dir);
  return `${dir}/${name}`;
}

registerNativeModule('AtlasPresentationExporter', {
  async exportPdf(slides: Slide[], t: Template, name: string) {
    const { jsPDF } = await import('jspdf');
    const W = 960, H = 540;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H], compress: true });
    slides.forEach((s, i) => {
      if (i) doc.addPage([W, H], 'landscape');
      doc.setFillColor(...rgb(t.background)); doc.rect(0, 0, W, H, 'F');
      const big = s.layout === 'title' || s.layout === 'closing';
      doc.setFillColor(...rgb(t.accent));
      if (big) doc.rect(64, 190, 120, 6, 'F'); else doc.rect(0, 0, 14, H, 'F');
      doc.setTextColor(...rgb(t.foreground)); doc.setFont('helvetica', 'bold');
      doc.setFontSize(big ? 44 : 32);
      const titleLines = doc.splitTextToSize(s.title || '', W - 140) as string[];
      doc.text(titleLines.slice(0, 3), 64, big ? 150 : 90);
      if (s.subtitle) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(big ? 22 : 16); doc.setTextColor(...rgb(t.secondary));
        doc.text(doc.splitTextToSize(s.subtitle, W - 140).slice(0, 3), 64, big ? 235 : 125);
      }
      if (!big) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(22); doc.setTextColor(...rgb(t.foreground));
        let y = 175;
        for (const b of s.bullets) {
          const lines = doc.splitTextToSize(b, W - 170) as string[];
          doc.setFillColor(...rgb(t.accent)); doc.circle(72, y - 7, 4, 'F');
          doc.text(lines, 90, y);
          y += lines.length * 28 + 12;
          if (y > H - 40) break;
        }
      }
    });
    const out = await exportsDir(name);
    await fs().writeFile(out, new Uint8Array(doc.output('arraybuffer')));
    await saveToUser(out, name, 'application/pdf');
    return `file://${out}`;
  },
  async publishFile(archivePath: string, name: string, mime: string) {
    // The caller deletes the archive right after this resolves, so the bytes are copied first.
    const out = await exportsDir(name);
    await fs().writeFile(out, await fs().readFile(norm(archivePath)));
    await saveToUser(out, name, mime);
    return `file://${out}`;
  },
  async shareUri(uri: string, mime: string) {
    const p = norm(uri);
    const f = await fs().getFile(p);
    const file = new File([f], baseName(p), { type: mime });
    const nav: any = navigator;
    if (nav.canShare?.({ files: [file] })) { try { await nav.share({ files: [file] }); return true; } catch { return false; } }
    await saveToUser(p, baseName(p), mime);
    return true;
  },
});
