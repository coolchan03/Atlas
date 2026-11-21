/**
 * What a slide looks like in the editor: the same shapes, positions and text sizes the PowerPoint file gets (presentationExport.ts), for every
 * layout, in the template's own fonts. Pure (no React), so it is tested without a device. Positions are in the file's units (EMU) on a slide
 * of 12192000 x 6858000; text sizes are in points on a slide 960 points wide.
 */
import { titleGeometry } from './presentationLayout';
import type { PresentationSlide, PresentationTemplate } from './presentationTemplates';

export const SLIDE_W = 12_192_000;
export const SLIDE_H = 6_858_000;
export const SLIDE_PT_WIDTH = 960;

export interface PreviewText { text: string; color: string; font: 'heading' | 'body'; size: number; bold: boolean; italic?: boolean }
export interface PreviewShape { x: number; y: number; w: number; h: number; fill?: string; lines?: PreviewText[] }

// A shape is its position and size in one list, then its fill and text; a line of text is its words and colour, then its font and size. (Few arguments, many call sites.)
type Rect = [x: number, y: number, w: number, h: number];
const box = ([x, y, w, h]: Rect, fill?: string, lines?: PreviewText[]): PreviewShape => ({ x, y, w, h, fill, lines });
const line = (text: string, color: string, look: [font: 'heading' | 'body', size: number, bold?: boolean]): PreviewText => ({ text, color, font: look[0], size: look[1], bold: !!look[2] });

/** The shapes of one slide, in drawing order. */
export function previewShapes(slide: PresentationSlide, t: PresentationTemplate): PreviewShape[] {
  const bullets = slide.bullets.length ? slide.bullets : ['Add your points'];
  const title = slide.title || 'Your title';
  switch (slide.layout) {
    case 'section': return [
      box([0, 0, 3_300_000, SLIDE_H], t.accent),
      box([4_000_000, 2_300_000, 7_600_000, 1_700_000], undefined, [line(title, t.foreground, ['heading', 48, true])]),
      ...(slide.subtitle ? [box([4_020_000, 4_150_000, 7_400_000, 900_000], undefined, [line(slide.subtitle, t.secondary, ['body', 22])])] : []),
    ];
    case 'quote': return [
      box([900_000, 700_000, 1_600_000, 1_500_000], undefined, [line('“', t.accent, ['heading', 120, true])]),
      box([1_300_000, 2_200_000, 9_600_000, 2_700_000], undefined, [{ ...line(title, t.foreground, ['body', 34]), italic: true }]),
      box([1_300_000, 5_150_000, 1_200_000, 60_000], t.accent),
      ...(slide.subtitle ? [box([1_300_000, 5_350_000, 9_000_000, 600_000], undefined, [line(slide.subtitle, t.secondary, ['body', 20])])] : []),
    ];
    case 'stat': return [
      box([900_000, 1_100_000, 1_200_000, 60_000], t.accent),
      box([900_000, 1_500_000, 10_400_000, 2_300_000], undefined, [line(title, t.accent, ['heading', 110, true])]),
      ...(slide.subtitle ? [box([960_000, 3_900_000, 10_200_000, 700_000], undefined, [line(slide.subtitle, t.foreground, ['body', 28])])] : []),
      box([960_000, 4_800_000, 10_200_000, 1_700_000], undefined, bullets.slice(0, 4).map((b) => line(b, t.secondary, ['body', 19]))),
    ];
    case 'agenda': {
      const out = [box([680_000, 520_000, 150_000, 820_000], t.accent), box([960_000, 560_000, 10_500_000, 900_000], undefined, [line(title, t.foreground, ['heading', 36, true])])];
      bullets.slice(0, 6).forEach((b, i) => {
        const y = 1_750_000 + i * 780_000;
        out.push(box([960_000, y, 800_000, 640_000], undefined, [line(String(i + 1).padStart(2, '0'), t.accent, ['heading', 30, true])]));
        out.push(box([1_900_000, y + 40_000, 9_400_000, 640_000], undefined, [line(b, t.foreground, ['body', 24])]));
      });
      return out;
    }
    case 'twoColumn': {
      const items = bullets.slice(0, 10);
      const half = Math.ceil(items.length / 2);
      const column = (list: string[]) => list.map((b) => line(`•  ${b}`, t.foreground, ['body', 20]));
      return [
        box([680_000, 520_000, 150_000, 820_000], t.accent),
        box([960_000, 560_000, 10_500_000, 900_000], undefined, [line(title, t.foreground, ['heading', 36, true])]),
        ...(slide.subtitle ? [box([960_000, 1_530_000, 9_800_000, 500_000], undefined, [line(slide.subtitle, t.secondary, ['body', 19])])] : []),
        box([750_000, 2_220_000, 5_150_000, 3_980_000], t.panel),
        box([1_000_000, 2_500_000, 4_700_000, 3_500_000], undefined, column(items.slice(0, half))),
        box([6_150_000, 2_220_000, 5_150_000, 3_980_000], t.panel),
        box([6_400_000, 2_500_000, 4_700_000, 3_500_000], undefined, column(items.slice(half))),
      ];
    }
    case 'title': {
      const g = titleGeometry(t.id);
      return [
        box([g.accentX, g.accentY, g.accentW, g.accentH], t.accent),
        box([g.titleX, g.titleY, 10_200_000, 1_700_000], undefined, [line(title, t.foreground, ['heading', 49, true])]),
        box([g.titleX + 20_000, g.subtitleY, 10_200_000, 1_000_000], undefined, [line(slide.subtitle, t.secondary, ['body', 24])]),
      ];
    }
    case 'closing': return [
      box([760_000, 1_920_000, 9_500_000, 220_000], t.accent),
      box([820_000, 2_650_000, 10_000_000, 1_500_000], undefined, [line(title, t.foreground, ['heading', 49, true])]),
      box([840_000, 4_480_000, 10_000_000, 650_000], undefined, [line(slide.subtitle, t.secondary, ['body', 23])]),
    ];
    default: return [
      box([680_000, 520_000, 150_000, 820_000], t.accent),
      box([960_000, 560_000, 10_500_000, 900_000], undefined, [line(title, t.foreground, ['heading', 36, true])]),
      ...(slide.subtitle ? [box([960_000, 1_530_000, 9_800_000, 500_000], undefined, [line(slide.subtitle, t.secondary, ['body', 19])])] : []),
      box([750_000, 2_220_000, 10_600_000, 3_980_000], t.panel),
      box([1_050_000, 2_560_000, 9_800_000, 3_450_000], undefined, (slide.bullets.length ? slide.bullets : ['Add your main points']).slice(0, 9).map((b) => line(`•  ${b}`, t.foreground, ['body', 22]))),
    ];
  }
}

export interface PreviewFont { fontFamily: string; fontWeight?: 'normal' | 'bold' | '300' | '500' | '900'; fontStyle?: 'italic'; letterSpacing?: number }
/**
 * PowerPoint fonts, shown with the closest family this phone has (Calibri and Georgia are not installed on a phone). The mapping spreads the
 * twelve templates across the families a phone does have (plain, light, medium, condensed, serif, casual, monospace), so each style looks
 * different here as well as in the file. The file itself names the real font.
 */
const FONT_LOOK: Record<string, PreviewFont> = {
  'Calibri': { fontFamily: 'sans-serif' }, 'Calibri Light': { fontFamily: 'sans-serif-light', fontWeight: '300' },
  'Aptos': { fontFamily: 'sans-serif', letterSpacing: 0.2 }, 'Aptos Display': { fontFamily: 'sans-serif-medium', fontWeight: '500' },
  'Trebuchet MS': { fontFamily: 'casual' },
  'Arial': { fontFamily: 'sans-serif' }, 'Arial Narrow': { fontFamily: 'sans-serif-condensed' },
  'Georgia': { fontFamily: 'serif' },
  'Segoe UI': { fontFamily: 'sans-serif', letterSpacing: 0.4 }, 'Segoe UI Light': { fontFamily: 'sans-serif-light', fontWeight: '300', letterSpacing: 0.4 },
  'Palatino Linotype': { fontFamily: 'serif', letterSpacing: 0.3 }, 'Book Antiqua': { fontFamily: 'serif', fontStyle: 'italic' },
  'Franklin Gothic Medium': { fontFamily: 'sans-serif-medium', fontWeight: '500' }, 'Franklin Gothic Demi': { fontFamily: 'sans-serif-condensed', fontWeight: 'bold' },
  'Verdana': { fontFamily: 'sans-serif', letterSpacing: 0.9 }, 'Tahoma': { fontFamily: 'sans-serif-medium', fontWeight: '500', letterSpacing: 0.1 },
  'Garamond': { fontFamily: 'serif', fontStyle: 'italic', letterSpacing: -0.2 },
  'Courier New': { fontFamily: 'monospace' },
};
export const previewFont = (name: string | undefined): PreviewFont => FONT_LOOK[name ?? ''] ?? { fontFamily: 'sans-serif' };
/** The font of the template's headings (its `headingFont`, else its font) and of its body text. */
export const templateFonts = (t: PresentationTemplate): { heading: PreviewFont; body: PreviewFont } => ({ heading: previewFont(t.headingFont ?? t.font), body: previewFont(t.font) });
