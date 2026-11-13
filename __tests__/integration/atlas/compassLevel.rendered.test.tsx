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
