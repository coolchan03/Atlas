import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { NavBarSettings } from '../../../src/components/NavBarSettings';
import { useAppStore } from '../../../src/stores/appStore';
import { resolveNavBar } from '../../../src/navigation/navBar';

describe('bottom bar settings', () => {
  beforeEach(() => useAppStore.setState({ settings: { ...useAppStore.getState().settings, navBar: undefined } }));

  it('turns Models on, moves it up and saves the choice', () => {
    const { getByTestId, getByLabelText } = render(<NavBarSettings />);
    fireEvent(getByTestId('navbar-switch-models'), 'valueChange', true);
    expect(resolveNavBar(useAppStore.getState().settings.navBar).visible).toContain('models');
    fireEvent.press(getByLabelText('Move Models earlier'));
    expect(resolveNavBar(useAppStore.getState().settings.navBar).order.indexOf('models')).toBe(2);
  });

  it('cannot turn Settings off and stops at five', () => {
    const { getByTestId } = render(<NavBarSettings />);
    expect(getByTestId('navbar-switch-settings').props.disabled).toBe(true);
    fireEvent(getByTestId('navbar-switch-models'), 'valueChange', true); // five now
    expect(getByTestId('navbar-switch-compass').props.disabled).toBe(true);
  });

  it('hides labels and resets to the default bar', () => {
    const { getByTestId } = render(<NavBarSettings />);
    fireEvent(getByTestId('navbar-labels'), 'valueChange', false);
    expect(useAppStore.getState().settings.navBar?.labels).toBe(false);
    fireEvent.press(getByTestId('navbar-reset'));
    expect(useAppStore.getState().settings.navBar).toBeUndefined();
  });
});
