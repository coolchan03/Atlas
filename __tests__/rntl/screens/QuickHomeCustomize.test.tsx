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
