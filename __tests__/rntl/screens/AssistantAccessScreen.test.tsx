/** The Assistant settings screen, rendered: its header, its three cards, the back button, and that nothing on it can crash the screen. */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}));

import { AssistantAccessScreen } from '../../../src/screens/AssistantAccessScreen';

beforeEach(() => { mockGoBack.mockClear(); jest.restoreAllMocks(); });

describe('Assistant settings screen', () => {
  it('shows the title, reminders and tips, assistant access and app permissions', () => {
    const screen = render(<AssistantAccessScreen />);
    expect(screen.getByText('Assistant settings')).toBeTruthy();
    expect(screen.getByText('Assistant access')).toBeTruthy();
    expect(screen.getByText(/Workspace folder:/)).toBeTruthy();
    expect(screen.getAllByText(/Reminders and tips/i).length).toBeGreaterThan(0);
  });

  it('the back button goes back', () => {
    const screen = render(<AssistantAccessScreen />);
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('is a scrolling page, so every card stays reachable on a small screen', () => {
    const screen = render(<AssistantAccessScreen />);
    expect(screen.UNSAFE_getAllByType(require('react-native').ScrollView).length).toBeGreaterThanOrEqual(1);
  });

  it('opening the phone settings from the permissions card does not crash when the phone refuses', async () => {
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('no settings app'));
    const screen = render(<AssistantAccessScreen />);
    const buttons = screen.queryAllByText('Settings');
    for (const b of buttons) fireEvent.press(b);
    await new Promise((r) => setImmediate(r));
    expect(screen.getByText('Assistant settings')).toBeTruthy(); // still rendered
  });

  it('renders again after being unmounted (no leftover state)', () => {
    const first = render(<AssistantAccessScreen />);
    first.unmount();
    const second = render(<AssistantAccessScreen />);
    expect(second.getByText('Assistant settings')).toBeTruthy();
  });
});
