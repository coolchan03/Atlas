import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuickHomeScreen } from '../../../src/screens/HomeScreen/QuickHome';
import { useNudges } from '../../../src/atlasTools/nudges';
import { useHomeShortcuts } from '../../../src/screens/HomeScreen/homeShortcutStore';
import { useCallLaunch } from '../../../src/screens/HomeScreen/callLaunch';

const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) };

describe('Home: the widget editor and the study card belong to Customize', () => {
  beforeEach(() => { useNudges.setState({ homeStudy: true }); });

  it('shows no "add widget" box until Customize is pressed, and takes it away again on Done', () => {
    const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
    expect(view.queryByTestId('home-custom-shortcuts')).toBeNull();
    expect(view.queryByTestId('home-add-shortcut')).toBeNull();
    fireEvent.press(view.getByTestId('home-customize'));
    expect(view.getByTestId('home-custom-shortcuts')).toBeTruthy();
    expect(view.getByTestId('home-add-shortcut')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-customize'));
    expect(view.queryByTestId('home-custom-shortcuts')).toBeNull();
  });

  it('lets the study and reminders card be hidden for good, and brought back from Customize', () => {
    const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
    expect(view.queryByTestId('home-study-toggle')).toBeNull();
    fireEvent.press(view.getByTestId('home-customize'));
    fireEvent.press(view.getByTestId('home-study-toggle'));
    expect(useNudges.getState().homeStudy).toBe(false);
    expect(view.getByLabelText('Show the study and reminders card')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-customize')); // Done
    expect(view.queryByTestId('home-study')).toBeNull();
    expect(view.queryByTestId('home-study-toggle')).toBeNull();
  });

  it('says on a call widget what it is doing while it starts the call', () => {
    useHomeShortcuts.setState({ shortcuts: [{ id: 'w1', title: 'Call my coach', action: 'call' }] });
    useCallLaunch.setState({ status: 'Loading Qwen... (this can take up to a minute)', widgetId: 'w1' });
    const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
    expect(view.getByText('Call my coach')).toBeTruthy();
    // nothing is launching yet, so the tile shows its own hint, not a status
    expect(view.queryByTestId('widget-launch-status')).toBeNull();
  });
});

describe('Home: hold a tile and slide it over another to move it', () => {
  const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height: 80 } } });
  const labelsInOrder = (view: ReturnType<typeof render>) => view.getAllByTestId(/^quick-home-/).map((t) => t.props.testID.replace('quick-home-', ''));

  it('moves a tile, a widget you made among them, and keeps the order', () => {
    useHomeShortcuts.setState({ shortcuts: [{ id: 'w1', title: 'Call my coach', action: 'call' }] });
    useNudges.setState({ homeStudy: false });
    const view = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
    const before = labelsInOrder(view);
    expect(before[before.length - 1]).toBe('widget-w1'); // new widgets start last
    // The phone reports where each tile is; here they are stacked 80 apart.
    before.forEach((key, i) => fireEvent(view.getByTestId(`quick-home-${key}`), 'layout', layout(i * 80)));
    // Hold the widget, then slide a finger up over the second tile.
    fireEvent(view.getByTestId('quick-home-widget-w1'), 'longPress');
    fireEvent(view.getByTestId('home-tile-list'), 'responderGrant');
    fireEvent(view.getByTestId('home-tile-list'), 'responderMove', { nativeEvent: { pageX: 40, pageY: 80 + 40 } });
    fireEvent(view.getByTestId('home-tile-list'), 'responderRelease');
    const after = labelsInOrder(view);
    expect(after[1]).toBe('widget-w1');
    expect(after.filter((k) => k !== 'widget-w1')).toEqual(before.filter((k) => k !== 'widget-w1'));
    // It stays that way when the screen is opened again.
    view.unmount();
    const again = render(<QuickHomeScreen navigation={navigation} mode="simple" />);
    expect(labelsInOrder(again)[1]).toBe('widget-w1');
  });
});
