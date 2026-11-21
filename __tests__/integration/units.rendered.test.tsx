/** Appearance, Units: miles/kilometers and Fahrenheit/Celsius are chosen in one place, and the briefing weather follows them. */
import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

it('switches distance and temperature units, and weather text follows them', () => {
  const rtl = requireRTL();
  const React = require('react');
  const { AppearanceScreen } = require('../../src/screens/AppearanceScreen');
  const { useAppStore } = require('../../src/stores');
  const { useMaps } = require('../../src/atlasMaps/maps');
  const { weatherSummary } = require('../../src/atlasTools/weather');
  const { currentUnits } = require('../../src/atlasTools/units');
  const weather = { tempMaxC: 20, tempMinC: 10, uvMax: 5, precipProbPct: 0, windKph: 40, code: 0, description: 'clear sky', uvWarning: 'Moderate UV' };

  useMaps.setState({ imperial: false });
  expect(weatherSummary(weather, undefined, currentUnits())).toContain('high 20°C / low 10°C');
  expect(weatherSummary(weather, undefined, currentUnits())).toContain('wind up to 40 km/h');

  const r = rtl.render(React.createElement(AppearanceScreen));
  rtl.fireEvent.press(r.getByTestId('fold-units'));
  rtl.fireEvent.press(r.getByText('Fahrenheit'));
  rtl.fireEvent.press(r.getByText('Miles, feet'));
  expect(useAppStore.getState().settings.temperatureUnit).toBe('f');
  expect(useMaps.getState().imperial).toBe(true);
  expect(weatherSummary(weather, undefined, currentUnits())).toContain('high 68°F / low 50°F');
  expect(weatherSummary(weather, undefined, currentUnits())).toContain('wind up to 25 mph');
});
