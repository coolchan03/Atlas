import type { PresentationStyleId } from './presentationTemplates';
/** The title-slide geometry in EMU. Each presentation theme has a distinct composition. */
const ORDER: PresentationStyleId[] = [
  'minimal', 'modern', 'colorful', 'dark', 'academic', 'minimal-green',
  'sage', 'forest', 'sunrise', 'ocean', 'berry', 'mono',
];
export interface TitleGeometry { accentX: number; accentY: number; accentW: number; accentH: number; titleX: number; titleY: number; subtitleY: number }
export function titleGeometry(theme: PresentationStyleId): TitleGeometry {
  const i = Math.max(0, ORDER.indexOf(theme));
  return {
    accentX: 640_000 + i * 115_000,
    accentY: 1_010_000 + (i % 4) * 145_000,
    accentW: 10_350_000 - i * 272_000,
    accentH: i % 3 === 0 ? 130_000 : (i % 3 === 1 ? 65_000 : 240_000),
    titleX: 760_000 + (i % 4) * 190_000,
    titleY: 1_760_000 + Math.floor(i / 3) * 155_000,
    subtitleY: 3_800_000 + (i % 5) * 125_000,
  };
}
