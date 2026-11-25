import * as React from 'react';
import { KeyboardAvoidingView as RNKAV, View } from 'react-native-web';
export const KeyboardProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
// Browsers resize the layout viewport themselves when the on-screen keyboard opens (interactive-widget).
export const KeyboardAvoidingView = React.forwardRef<any, any>(({ behavior: _b, keyboardVerticalOffset: _o, children, ...rest }, ref) => (
  <View ref={ref} {...rest}>{children}</View>
));
export const KeyboardStickyView = KeyboardAvoidingView;
export const KeyboardController = { setInputMode: () => undefined, setDefaultMode: () => undefined, dismiss: async () => (document.activeElement as HTMLElement | null)?.blur?.() };
export const useKeyboardHandler = () => undefined;
export const useReanimatedKeyboardAnimation = () => ({ height: { value: 0 }, progress: { value: 0 } });
export const KeyboardEvents = { addListener: () => ({ remove: () => undefined }) };
void RNKAV;
