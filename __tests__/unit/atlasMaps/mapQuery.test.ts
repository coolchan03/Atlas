/** What the AI can read from offline map files: which maps there are, where each covers, and the named places near a point. */
import { installNativeBoundary } from '../../harness/nativeBoundary';

const US = { minLat: 24, minLon: -125, maxLat: 50, maxLon: -66 };
const FR = { minLat: 41, minLon: -5, maxLat: 51, maxLon: 10 };

function load(o: { native?: boolean; bounds?: Record<string, unknown>; places?: unknown[] | Error; fix?: boolean; external?: boolean; downloaded?: boolean } = {}) {
  jest.resetModules();
  const boundary = installNativeBoundary({ fs: true });
  const rn = require('react-native');
  const mapInfo = jest.fn(async (path: string) => { const b = o.bounds?.[path]; if (!b) throw new Error('unreadable'); return b; });
  const mapPlaces = jest.fn(async () => { if (o.places instanceof Error) throw o.places; return o.places ?? []; });
  rn.NativeModules.AtlasDevice = o.native === false ? undefined : { mapInfo, mapPlaces };
  const maps = require('../../../src/atlasMaps/maps');
  jest.spyOn(maps, 'installedMaps').mockResolvedValue(o.downloaded === false ? [] : [{ path: '/maps/us.map', name: 'us', size: 300e6 }]);
  maps.useMaps.setState({ external: o.external ? [{ uri: 'content://x/fr.map', name: 'france' }] : [], current: '/maps/us.map', imperial: false, lastFix: o.fix === false ? null : { lat: 40.7, lon: -74, accuracy: 5, altitude: 0, speed: 0, time: 1 } });
  void boundary;
  return { q: require('../../../src/atlasMaps/mapQuery'), mapInfo, mapPlaces };
}

describe('maps on the phone', () => {
  it('lists downloaded and picked maps with coverage, and says when the user is inside one', async () => {
    const { q } = load({ external: true, bounds: { '/maps/us.map': US, 'content://x/fr.map': FR } });
    const text = await q.describeMaps();
    expect(text).toContain('us (downloaded, 300 MB, open on the Maps screen)');
    expect(text).toContain('The user is inside this map.');
    expect(text).toContain('france (from your files)');
  });

  it('says when a map cannot be read, and what to do when there are none', async () => {
    expect(await load({ bounds: {} }).q.describeMaps()).toContain('coverage could not be read');
    expect(await load({ downloaded: false }).q.describeMaps()).toContain('Home > Maps > Maps on phone');
  });
});

describe('places near a point', () => {
  const place = { name: 'City Hospital', kind: 'hospital', lat: 40.71, lon: -74.01, distanceM: 1400 };

  it('searches the map that covers the position and words the nearest results', async () => {
    const { q, mapPlaces } = load({ bounds: { '/maps/us.map': US }, places: [place] });
    const text = await q.placesNear({ query: 'hospital', radiusKm: 10, limit: 3 });
    expect(mapPlaces).toHaveBeenCalledWith('/maps/us.map', 40.7, -74, 10000, 'hospital', 3);
    expect(text).toContain('1 result for "hospital" within 10 km, from the map "us"');
    expect(text).toContain('City Hospital (hospital), 1.4 km');
  });

  it('uses a point the AI gives, picks the other map when the first does not cover it, and clamps radius and count', async () => {
    const { q, mapPlaces } = load({ external: true, bounds: { '/maps/us.map': US, 'content://x/fr.map': FR }, places: [place, place] });
    await q.placesNear({ lat: 48.85, lon: 2.35, radiusKm: 500, limit: 99 });
    expect(mapPlaces).toHaveBeenCalledWith('content://x/fr.map', 48.85, 2.35, 30000, '', 25);
    await q.placesNear({ radiusKm: 0, limit: 0 });
    expect(mapPlaces).toHaveBeenLastCalledWith('/maps/us.map', 40.7, -74, 200, '', 1);
  });

  it('says what is wrong instead of guessing', async () => {
    expect(await load({ native: false }).q.placesNear()).toContain('newest Atlas build');
    expect(await load({ fix: false, bounds: { '/maps/us.map': US } }).q.placesNear()).toContain('No position');
    expect(await load({ downloaded: false }).q.placesNear()).toContain('no map files');
    expect(await load({ bounds: { '/maps/us.map': FR } }).q.placesNear()).toContain('covers');
    expect(await load({ bounds: { '/maps/us.map': US }, places: new Error('boom') }).q.placesNear()).toContain('could not be searched: boom');
    const none = await load({ bounds: { '/maps/us.map': US }, places: [] }).q.placesNear({ query: 'cafe' });
    expect(none).toContain('Nothing found');
    expect(none).toContain('not proof');
  });

  it('opens each map file once', async () => {
    const { q, mapInfo } = load({ bounds: { '/maps/us.map': US }, places: [place] });
    await q.placesNear();
    await q.placesNear();
    expect(mapInfo).toHaveBeenCalledTimes(1);
  });
});

export {};
