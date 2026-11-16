import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuickHomeScreen } from '../../../src/screens/HomeScreen/QuickHome';

it('the Simple, Compact and Colorful home offers the daily briefing, and no Presentations', () => {
  const parentNavigate = jest.fn();
  const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: parentNavigate }) };
  const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
  expect(view.queryByTestId('quick-home-presentations')).toBeNull();
  fireEvent.press(view.getByTestId('quick-home-brief'));
  expect(parentNavigate).toHaveBeenCalledWith('DailyBrief');
});

it('Focus shows only chat, learn and the briefing; Grid shows every tile', () => {
  const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) };
  const focus = render(<QuickHomeScreen navigation={navigation} mode="focus" />);
  expect(focus.getByTestId('quick-home-chat')).toBeTruthy();
  expect(focus.getByTestId('quick-home-language')).toBeTruthy();
  expect(focus.queryByTestId('quick-home-models')).toBeNull();
  const grid = render(<QuickHomeScreen navigation={navigation} mode="grid" />);
  expect(grid.getByTestId('quick-home-models')).toBeTruthy();
});

it('names the tiles clearly: models to get, a model to load, a language or a topic to learn', () => {
  const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) };
  const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
  expect(view.getByText('Get models')).toBeTruthy();
  expect(view.getByText('Load a model')).toBeTruthy();
  expect(view.getByText('Learn a language')).toBeTruthy();
  expect(view.getByText('Learn a topic')).toBeTruthy();
});

it('offers the Atlas emergency tools as tiles that are off until turned on under Customize', () => {
  const { useAppStore } = require('../../../src/stores/appStore');
  useAppStore.getState().updateSettings({ homeTiles: undefined });
  const parentNavigate = jest.fn();
  const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: parentNavigate }) };
  const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
  expect(view.queryByTestId('quick-home-emergency')).toBeNull();
  expect(view.getByTestId('quick-home-teach')).toBeTruthy();
  fireEvent.press(view.getByTestId('home-customize'));
  fireEvent.press(view.getByTestId('tile-toggle-emergency'));
  fireEvent.press(view.getByTestId('home-customize')); // Done
  fireEvent.press(view.getByTestId('quick-home-emergency'));
  expect(parentNavigate).toHaveBeenCalledWith('Emergency');
});

it('a widget the person makes is a tile in the list like Music Studio, with the icon they chose, and opens what it points to', () => {
  const { useHomeShortcuts } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  useHomeShortcuts.setState({ shortcuts: [
    { id: 'w1', title: 'Morning news', action: 'daily-brief', icon: 'coffee' },
    { id: 'w2', title: 'Compass', action: 'compass' },
  ] });
  const parentNavigate = jest.fn();
  const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: parentNavigate }) };
  const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
  const tile = view.getByTestId('quick-home-widget-w1');
  expect(view.getAllByText('Morning news').length).toBe(2); // the tile, and its row under "My home widgets" where it is edited or removed
  // The built-in tiles and the widget tiles are in one list; the widgets come after them.
  const all = view.getAllByTestId(/^quick-home-/).map((n: any) => n.props.testID);
  expect(all.indexOf('quick-home-widget-w1')).toBeGreaterThan(all.indexOf('quick-home-settings'));
  expect(tile.findAll((n: any) => n.props?.name === 'coffee').length).toBeGreaterThan(0);
  // With no icon chosen, the one that suits what it does is used.
  expect(view.getByTestId('quick-home-widget-w2').findAll((n: any) => n.props?.name === 'compass').length).toBeGreaterThan(0);
  fireEvent.press(tile);
  expect(parentNavigate).toHaveBeenCalledWith('DailyBrief', undefined);
  useHomeShortcuts.setState({ shortcuts: [] });
});
