import * as React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native-web';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
  [k: string]: unknown;
}

const injected = new Set<string>();
function injectFont(family: string, url: string) {
  if (injected.has(family) || typeof document === 'undefined') return;
  injected.add(family);
  const style = document.createElement('style');
  style.textContent = `@font-face{font-family:'${family}';src:url('${url}') format('truetype');font-display:block;}`;
  document.head.appendChild(style);
}

export function createIcon(family: string, fontUrl: string, glyphs: Record<string, number>) {
  injectFont(family, fontUrl);
  const Icon = ({ name, size = 12, color, style, ...rest }: IconProps) => {
    const code = glyphs[name];
    const ch = code ? String.fromCodePoint(code) : '?';
    return (
      <Text
        {...(rest as object)}
        selectable={false}
        accessibilityRole="image"
        style={[{ fontFamily: family, fontSize: size, color, fontWeight: 'normal', fontStyle: 'normal', lineHeight: size, userSelect: 'none' } as TextStyle, style]}
      >
        {ch}
      </Text>
    );
  };
  Icon.glyphMap = glyphs;
  Icon.loadFont = async () => undefined;
  Icon.getImageSource = async () => ({ uri: '' });
  return Icon;
}
