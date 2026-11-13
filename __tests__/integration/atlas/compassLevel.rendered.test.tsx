/**
 * The Compass screen switches to a bubble level and back. Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

it('shows the level when asked, and the compass again after switching back', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { CompassScreen } = require('../../../src/screens/CompassScreen');

  const view = rtl.render(React.createElement(CompassScreen));
  expect(view.queryByTestId('compass-level-view')).toBeNull();
  expect(view.getByTestId('compass-dial')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('compass-level-toggle'));
  expect(view.getByTestId('compass-level-view')).toBeTruthy();
  expect(view.getByText('Orientation sensor unavailable')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('compass-level-toggle'));
  expect(view.queryByTestId('compass-level-view')).toBeNull();
});

it('the two circles overlap when the phone is flat and level, and line up at each quarter turn when it is upright', () => {
  installNativeBoundary({ fs: true });
  const { levelPose } = require('../../../src/atlasTools/levelMath');
  // Lying flat: gravity is all on z. Level means no offset; tilting moves one circle away.
  expect(levelPose({ x: 0, y: 0, z: 9.81 }, { pitch: 0, roll: 0 })).toMatchObject({ mode: 'flat', isLevel: true, x: 0, y: 0 });
  expect(levelPose({ x: 0, y: 0, z: 9.81 }, { pitch: 0, roll: 12 })).toMatchObject({ mode: 'flat', isLevel: false, x: 12 });
  // Upright: square to the ground at 0, 90, 180 and 270, and the circles line up there.
  expect(levelPose({ x: 0, y: 9.81, z: 0 })).toMatchObject({ mode: 'upright', isLevel: true });
  expect(levelPose({ x: 9.81, y: 0, z: 0 })).toMatchObject({ mode: 'upright', isLevel: true });
  expect(levelPose({ x: 0, y: -9.81, z: 0 })).toMatchObject({ mode: 'upright', isLevel: true });
  expect(levelPose({ x: -9.81, y: 0, z: 0 })).toMatchObject({ mode: 'upright', isLevel: true });
  // Turned 36 degrees from upright: not level, and the angle is the distance from the nearest quarter turn.
  const turned = levelPose({ x: 9.81 * Math.sin(Math.PI * 36 / 180), y: 9.81 * Math.cos(Math.PI * 36 / 180), z: 0 });
  expect(turned.isLevel).toBe(false);
  expect(Math.round(turned.degrees)).toBe(36);
  // 50 degrees is nearer to the next quarter turn, so it reads as -40.
  const nearNext = levelPose({ x: 9.81 * Math.sin(Math.PI * 50 / 180), y: 9.81 * Math.cos(Math.PI * 50 / 180), z: 0 });
  expect(Math.round(nearNext.degrees)).toBe(-40);

  const rtl = requireRTL();
  const React = require('react');
  const { LevelView } = require('../../../src/screens/compass/LevelView');
  const flat = rtl.render(React.createElement(LevelView, { orientation: { pitch: 0, roll: 0 }, accel: { x: 0, y: 0, z: 9.81 } }));
  expect(flat.getByTestId('level-fixed-circle')).toBeTruthy();
  expect(flat.getByTestId('level-moving-circle')).toBeTruthy();
  expect(flat.getByText('Level')).toBeTruthy();
  const upright = rtl.render(React.createElement(LevelView, { orientation: null, accel: { x: 0, y: 9.81, z: 0 } }));
  expect(upright.getAllByText('Level').length).toBeGreaterThan(0);
});

it('the dots switch pages like the old iOS compass', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { CompassScreen } = require('../../../src/screens/CompassScreen');
  const view = rtl.render(React.createElement(CompassScreen));
  rtl.fireEvent.press(view.getByLabelText('Show the level'));
  expect(view.getByTestId('compass-level-view')).toBeTruthy();
  rtl.fireEvent.press(view.getByLabelText('Show the compass'));
  expect(view.getByTestId('compass-dial')).toBeTruthy();
});

it('shows height from GPS and from air pressure side by side, and warns when pressure is falling at a steady GPS height', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { PressureCard } = require('../../../src/screens/compass/PressureCard');
  const { usePressureLog } = require('../../../src/atlasTools/pressureLog');
  const hour = 3_600_000;
  const now = Date.now();
  // Four readings across three hours: down 4 hPa at the same GPS height of 120 m.
  usePressureLog.setState({ samples: [0, 1, 2, 3].map((i) => ({ at: now - (3 - i) * hour, hpa: 1013 - i * 1.33, gpsM: 120 })) });
  const units = { imperial: false, temp: 'c' };
  const view = rtl.render(React.createElement(PressureCard, { pressure: { hpa: 1009, altM: 35 }, gps: { altitude: 120, accuracy: 6 }, units, now }));
  expect(view.getByText(/GPS: 120 m/)).toBeTruthy();
  expect(view.getByText(/Air pressure: 35 m \(1009.0 hPa\)/)).toBeTruthy();
  expect(view.getByTestId('pressure-trend').props.children.join('')).toMatch(/Pressure is falling: -4.0 hPa over 3 hours/);
  expect(view.getByTestId('pressure-hint').props.children).toMatch(/weather may be turning/);
  usePressureLog.setState({ samples: [] });
  const fresh = rtl.render(React.createElement(PressureCard, { pressure: { hpa: 1009, altM: 35 }, gps: null, units, now }));
  expect(fresh.getAllByText(/no fix yet/).length).toBeGreaterThan(0);
  expect(fresh.getAllByTestId('pressure-no-trend').length).toBeGreaterThan(0);
});
