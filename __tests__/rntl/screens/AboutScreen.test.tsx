/**
 * Atlas About screen keeps project identity + a single source-code link.
 */
import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));
jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity style={style} onPress={onPress} testID={testID}>{children}</TouchableOpacity>;
  },
}));
jest.mock('../../../package.json', () => ({ version: '1.0.0' }), { virtual: true });

import { AboutScreen } from '../../../src/screens/AboutScreen';

describe('AboutScreen — Atlas identity', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders Atlas identity and the open-source row', () => {
    const { getByText } = render(<AboutScreen />);
    expect(getByText('Atlas')).toBeTruthy();
    expect(getByText('Open Source')).toBeTruthy();
    expect(getByText('View the source on GitHub')).toBeTruthy();
  });

  it('opens the Atlas fork source when Open Source is tapped', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    const { getByText } = render(<AboutScreen />);
    fireEvent.press(getByText('Open Source'));
    expect(openURL).toHaveBeenCalledWith('https://github.com/coolchan03/Off-Grid');
  });
});
