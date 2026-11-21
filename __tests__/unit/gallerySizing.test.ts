import { galleryCell, galleryColumns } from '../../src/screens/GalleryScreen/styles';

describe('gallery grid follows the window', () => {
  it('keeps 3 columns on a phone and adds columns on wide windows, with cells that fill the row', () => {
    expect(galleryColumns(360)).toBe(3);
    expect(galleryColumns(412)).toBe(3);
    expect(galleryColumns(1280)).toBe(10);
    expect(galleryColumns(900)).toBe(7);
    for (const w of [360, 900, 1280]) {
      const c = galleryColumns(w);
      expect(galleryCell(w, c) * c + 4 * (c + 1)).toBeLessThanOrEqual(w);
      expect(galleryCell(w, c)).toBeGreaterThan(100);
    }
  });
});
