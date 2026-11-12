import { listingBytes, mapState, roomFor } from '../../../src/atlasMaps/mapUpdates';

describe('map downloads: sizes, updates and room', () => {
  it('reads the sizes the map server lists', () => {
    expect(listingBytes('123M')).toBe(123e6);
    expect(listingBytes('1.2G')).toBe(1.2e9);
    expect(listingBytes('45K')).toBe(45e3);
    expect(listingBytes('-')).toBeNull();
  });
  it('tells a new map, an installed one and one with a newer file apart', () => {
    expect(mapState('120M', undefined)).toBe('new');
    expect(mapState('120.1M', 120.05e6)).toBe('installed');
    expect(mapState('150M', 120e6)).toBe('update');
    expect(mapState('?', 120e6)).toBe('installed');
  });
  it('wants a margin of free space beyond the file itself', () => {
    expect(roomFor(100e6, 200e6)).toBe(true);
    expect(roomFor(100e6, 110e6)).toBe(false);
  });
});
