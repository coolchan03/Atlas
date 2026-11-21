import { titleGeometry } from '../../../src/services/presentationLayout';
import { PRESENTATION_TEMPLATES } from '../../../src/services/presentationTemplates';

describe('presentation theme signatures', () => {
  it('each theme has a different pair of fonts/layout geometry', () => {
    const identities = PRESENTATION_TEMPLATES.map((t) => `${t.font}|${t.headingFont || t.font}|${JSON.stringify(titleGeometry(t.id))}`);
    expect(new Set(identities).size).toBe(PRESENTATION_TEMPLATES.length);
  });
  it('keeps title shapes within 16:9 slide bounds', () => {
    for (const theme of PRESENTATION_TEMPLATES) {
      const p = titleGeometry(theme.id);
      expect(p.accentX + p.accentW).toBeLessThan(12_192_000);
      expect(p.titleY).toBeLessThan(3_100_000);
    }
  });
});
