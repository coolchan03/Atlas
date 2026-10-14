import { defaultPresentationSlides, cleanPresentationSlides, PRESENTATION_TEMPLATES } from '../../../src/services/presentationTemplates';

jest.mock('react-native-fs', () => ({ __esModule: true, default: { CachesDirectoryPath: '/cache' } }));
jest.mock('react-native-zip-archive', () => ({ zip: jest.fn() }));

import { pptxParts } from '../../../src/services/presentationExport';

describe('Atlas Presentation Studio', () => {
  test('includes at least five distinct visual templates and three editable starter slides', () => {
    expect(new Set(PRESENTATION_TEMPLATES.map(s => s.id)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(PRESENTATION_TEMPLATES.map(s => s.background)).size).toBeGreaterThanOrEqual(5);
    expect(defaultPresentationSlides().map(s => s.layout)).toEqual(['title', 'bullets', 'closing']);
  });
  test('clamps user-entered content before export', () => {
    const slides = cleanPresentationSlides([{
      layout: 'bullets', title: 'x'.repeat(250), subtitle: 'y'.repeat(400),
      bullets: Array(12).fill('z'.repeat(350)),
    }]);
    expect(slides[0].title).toHaveLength(140);
    expect(slides[0].subtitle).toHaveLength(260);
    expect(slides[0].bullets).toHaveLength(10);
    expect(slides[0].bullets[0]).toHaveLength(260);
  });
  test.each(PRESENTATION_TEMPLATES)('builds a complete editable PPTX package: $id', template => {
    const slides = defaultPresentationSlides();
    slides[0].title = '<Hello & World>';
    const parts = pptxParts(slides, template);
    expect(parts['[Content_Types].xml']).toContain('presentationml.presentation.main+xml');
    expect(parts['ppt/presentation.xml']).toContain('screen16x9');
    expect(parts['ppt/theme/theme1.xml']).toContain(template.accent);
    expect(parts['ppt/slides/slide1.xml']).toContain('&lt;Hello &amp; World&gt;');
    expect(parts['ppt/slides/slide2.xml']).toContain('First key point');
    expect(parts['ppt/slideMasters/slideMaster1.xml']).toContain('sldLayoutId');
    expect(parts['ppt/slides/_rels/slide3.xml.rels']).toContain('slideLayout1.xml');
    expect(Object.keys(parts).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toHaveLength(3);
  });
  test('rejects a blank presentation instead of saving a broken archive', () => {
    expect(() => pptxParts([], PRESENTATION_TEMPLATES[0])).toThrow(/at least one slide/);
  });
});
