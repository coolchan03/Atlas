import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, View, type ViewProps } from 'react-native';

/** The height of the on-screen keyboard right now (0 when it is hidden). */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

/**
 * A view that keeps its content above the keyboard. Used as the root of a full-screen Modal: a Modal is its own window, so the app's
 * normal "resize for the keyboard" does not reach it and a field near the bottom (a PIN box on a short or tablet window) is covered.
 */
export const KeyboardSafeView: React.FC<ViewProps> = ({ style, children, ...rest }) => {
  const keyboard = useKeyboardHeight();
  return <View {...rest} style={[style, { paddingBottom: keyboard }]}>{children}</View>;
};
