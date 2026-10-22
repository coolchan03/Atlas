jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {} }));
jest.mock('react-native-fs', () => ({}));
jest.mock('react-native-zip-archive', () => ({ zip: jest.fn() }));

import { pptxParts } from '../../../src/services/presentationExport';
import { PRESENTATION_TEMPLATES, type SlideLayout } from '../../../src/services/presentationTemplates';

describe('Atlas editable presentation layouts', () => {
  const layouts: SlideLayout[] = ['title', 'bullets', 'section', 'quote', 'two_column', 'timeline', 'infographic', 'emoji', 'closing'];
  const slides = layouts.map(layout => ({
    layout, title: layout + ' title', subtitle: 'Subtitle',
    bullets: ['A | Alpha', 'B | Beta', 'C | Gamma', 'D | Delta'],
  }));
  it('offers eight distinct editable presentation themes', () => {
    expect(PRESENTATION_TEMPLATES.map(t => t.id)).toEqual([
      'minimal', 'modern', 'colorful', 'dark', 'academic', 'editorial', 'pastel', 'ocean']);
  });
  it('exports every layout as editable Open XML PowerPoint text and shape elements', () => {
    const parts = pptxParts(slides, PRESENTATION_TEMPLATES[0]);
    layouts.forEach((layout, i) => {
      const xml = parts[`ppt/slides/slide${i + 1}.xml`];
      expect(xml).toContain(layout + ' title');
      expect(xml).toContain('<p:sp>');
      expect(xml).toContain('<a:t>');
    });
    expect(parts['ppt/slides/slide4.xml']).toContain('Quotation panel');
    expect(parts['ppt/slides/slide5.xml']).toContain('Left column panel');
    expect(parts['ppt/slides/slide6.xml']).toContain('Milestone 1');
    expect(parts['ppt/slides/slide7.xml']).toContain('Card 1 panel');
  });
});
