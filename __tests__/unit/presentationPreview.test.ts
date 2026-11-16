import { previewFont, previewShapes, templateFonts } from '../../src/services/presentationPreview';
import { PRESENTATION_TEMPLATES, SLIDE_LAYOUTS, type PresentationSlide } from '../../src/services/presentationTemplates';

const t = PRESENTATION_TEMPLATES[0];
const slide = (layout: PresentationSlide['layout'], over: Partial<PresentationSlide> = {}): PresentationSlide => ({ layout, title: 'The title', subtitle: 'The subtitle', bullets: ['One', 'Two', 'Three', 'Four', 'Five'], ...over });
const texts = (s: PresentationSlide) => previewShapes(s, t).flatMap((x) => x.lines ?? []).map((l) => l.text);

describe('every slide layout previews as itself', () => {
  it.each(SLIDE_LAYOUTS.map((l) => l.id))('%s shows its own text', (layout) => {
    const shown = texts(slide(layout));
    expect(shown.some((x) => x.includes('The title'))).toBe(true);
    if (layout !== 'bullets' && layout !== 'title' && layout !== 'closing') expect(previewShapes(slide(layout), t).length).toBeGreaterThan(2);
  });

  it('the layouts that did not preview before each draw their own parts', () => {
    // Two columns: the points are split between two panels.
    const two = previewShapes(slide('twoColumn'), t).filter((s) => s.fill === t.panel);
    expect(two).toHaveLength(2);
    const cols = previewShapes(slide('twoColumn'), t).filter((s) => (s.lines?.[0]?.text ?? '').startsWith('•'));
    expect(cols.map((c) => c.lines!.length)).toEqual([3, 2]);
    // Agenda: numbered 01, 02, ...
    expect(texts(slide('agenda'))).toEqual(expect.arrayContaining(['01', '02', '03', 'One', 'Two']));
    // Section: a coloured block on the left and a big title.
    expect(previewShapes(slide('section'), t)[0]).toMatchObject({ x: 0, fill: t.accent });
    // Quote: a large quotation mark, the quote and who said it.
    expect(texts(slide('quote'))).toEqual(expect.arrayContaining(['“', 'The title', 'The subtitle']));
    // Big number: the number in the accent colour and its notes.
    const stat = previewShapes(slide('stat', { title: '85%' }), t);
    expect(stat.flatMap((s) => s.lines ?? []).find((l) => l.text === '85%')).toMatchObject({ color: t.accent, size: 110 });
    expect(texts(slide('stat'))).toEqual(expect.arrayContaining(['One', 'Four']));
    expect(texts(slide('stat'))).not.toContain('Five');
    // Closing: its message and the follow-up line.
    expect(texts(slide('closing', { title: 'Thank you', subtitle: 'Questions?' }))).toEqual(['Thank you', 'Questions?']);
  });

  it('a slide with no points or title still shows a prompt to fill in', () => {
    expect(texts(slide('bullets', { title: '', bullets: [] }))).toEqual(expect.arrayContaining(['Your title', '•  Add your main points']));
  });
});

describe('each style has its own look in the preview', () => {
  it('maps every template font to a family a phone has, and the twelve styles are not all alike', () => {
    for (const tpl of PRESENTATION_TEMPLATES) {
      expect(previewFont(tpl.font).fontFamily).toBeTruthy();
      expect(previewFont(tpl.headingFont ?? tpl.font).fontFamily).toBeTruthy();
    }
    const looks = new Set(PRESENTATION_TEMPLATES.map((tpl) => JSON.stringify(templateFonts(tpl))));
    expect(looks.size).toBeGreaterThanOrEqual(9);
    expect(templateFonts(PRESENTATION_TEMPLATES.find((x) => x.id === 'mono')!).body.fontFamily).toBe('monospace');
    expect(templateFonts(PRESENTATION_TEMPLATES.find((x) => x.id === 'academic')!).body.fontFamily).toBe('serif');
    expect(templateFonts(PRESENTATION_TEMPLATES.find((x) => x.id === 'minimal')!).heading.fontFamily).toBe('sans-serif-light');
  });

  it('an unknown font falls back to plain text', () => {
    expect(previewFont('Comic Papyrus')).toEqual({ fontFamily: 'sans-serif' });
  });
});
