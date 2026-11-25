import * as React from 'react';
import { View, type ViewStyle } from 'react-native-web';

interface Props {
  value?: number; minimumValue?: number; maximumValue?: number; step?: number; disabled?: boolean;
  minimumTrackTintColor?: string; maximumTrackTintColor?: string; thumbTintColor?: string;
  onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void; style?: ViewStyle; testID?: string;
}
// A native <input type="range"> keeps keyboard + touch behavior and accessibility for free.
export default function Slider({ value = 0, minimumValue = 0, maximumValue = 1, step = 0, disabled, minimumTrackTintColor, onValueChange, onSlidingComplete, style, testID, thumbTintColor }: Props) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <View style={[{ height: 40, justifyContent: 'center' }, style]} testID={testID}>
      <input
        type="range"
        min={minimumValue}
        max={maximumValue}
        step={step || (maximumValue - minimumValue) / 1000}
        value={v}
        disabled={disabled}
        style={{ width: '100%', accentColor: minimumTrackTintColor ?? thumbTintColor ?? '#34d399' }}
        onChange={(e) => { const n = Number(e.target.value); setV(n); onValueChange?.(n); }}
        onPointerUp={() => onSlidingComplete?.(v)}
        onKeyUp={() => onSlidingComplete?.(v)}
      />
    </View>
  );
}
