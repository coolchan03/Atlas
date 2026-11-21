import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: { createdAt: (global as any).__briefingAt } }),
}));

type Opts = { weather?: boolean; rain?: boolean; fix?: boolean; stories?: boolean; noHeadlines?: boolean; weatherFails?: boolean; missing?: boolean; minutes?: number };

async function setup(o: Opts = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  const weather = require('../../../src/atlasTools/weather');
  jest.spyOn(weather, 'fetchWeather').mockImplementation(async () => {
    if (o.weatherFails) throw new Error('offline');
    return o.weather === false ? null : { tempMaxC: 24, tempMinC: 12, uvMax: 8, precipProbPct: o.rain ? 60 : 5, windKph: 10, code: 2, description: 'partly cloudy', uvWarning: '' };
  });
  const maps = require('../../../src/atlasMaps/maps');
  maps.useMaps.setState({ lastFix: o.fix === false ? null : { lat: 40.7, lon: -74, accuracy: 10, altitude: 1, speed: 0, time: 1 } });
  const { BRIEF_PROJECT } = require('../../../src/atlasTools/dailyBrief');
  const { useStudyStore } = require('../../../src/study/engine');
  const createdAt = 1_700_000_000_000;
  const podcast = [{ host: 'A', text: 'Good morning, here is your briefing.' }, { host: 'B', text: 'First story text.' }, { host: 'A', text: 'More on the first story.' }, { host: 'B', text: 'Second story text.' }];
  useStudyStore.getState().add(BRIEF_PROJECT, {
    kind: 'podcast', createdAt, topic: 'News', title: 'Briefing', sources: [], hosts: 2, minutes: o.minutes ?? 4, podcast,
    storyStarts: o.stories === false ? [] : [1, 3],
    headlines: o.noHeadlines ? [] : [{ title: 'Senate passes bill', source: 'Reuters', interest: 'politics', date: createdAt, url: 'https://example.com/a' }, { title: 'Local news', source: '', interest: 'local' }],
  });
  (global as any).__briefingAt = o.missing ? 5 : createdAt;
  const { BriefingPaperScreen } = require('../../../src/screens/BriefingPaperScreen');
  const view = rtl.render(React.createElement(BriefingPaperScreen));
  await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
  return { view, rtl };
}

describe('the briefing paper', () => {
  it.each([
    ['with weather and rain', { rain: true }],
    ['with weather and no rain', {}],
    ['without a GPS position', { fix: false }],
    ['when the weather cannot be fetched', { weatherFails: true }],
    ['when there is no weather', { weather: false }],
    ['with no story markers', { stories: false }],
    ['with no headlines and no length', { noHeadlines: true, minutes: 0 }],
  ] as Array<[string, Opts]>)('reads %s', async (_name, opts) => {
    const { view, rtl } = await setup(opts);
    expect(view.getByText('ATLAS BRIEFING')).toBeTruthy();
    for (const seed of [2, 11]) await explore(view as never, { seed, presses: 25 });
    view.unmount();
    expect(rtl).toBeDefined();
  }, 60000);

  it('says so when the briefing is not there', async () => {
    const { view } = await setup({ missing: true });
    expect(view.getByText('Briefing not found.')).toBeTruthy();
  });
});
