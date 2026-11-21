import React from 'react';
import { Keyboard, Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { KeyboardSafeView } from '../../src/components/KeyboardSafeView';

it('lifts its content by the keyboard height and drops it again when the keyboard hides', () => {
  const handlers: Record<string, (e?: any) => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: any) => { handlers[name] = fn; return { remove: jest.fn() }; }) as any);
  const { getByTestId } = render(<KeyboardSafeView testID="k" style={{ flex: 1 }}><Text>PIN</Text></KeyboardSafeView>);
  const pad = () => [getByTestId('k').props.style].flat(5).reduce((a: any, s: any) => ({ ...a, ...(s || {}) }), {}).paddingBottom;
  expect(pad()).toBe(0);
  act(() => { (handlers.keyboardDidShow ?? handlers.keyboardWillShow)({ endCoordinates: { height: 300 } }); });
  expect(pad()).toBe(300);
  act(() => { (handlers.keyboardDidHide ?? handlers.keyboardWillHide)(); });
  expect(pad()).toBe(0);
});
