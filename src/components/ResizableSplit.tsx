import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme';
import { useLayoutClass } from '../hooks/useLayoutClass';
import { dragRatio, DEFAULT_RATIO, paneDirection, ratioKey, usePaneRatios } from '../hooks/paneRatio';

/**
 * Two panes with a draggable divider. Side by side in a wide window, stacked in a tall one, with the person's ratio remembered per
 * window shape. The divider is a 44 dp touch target and can be nudged with the screen reader's adjust gestures.
 */
export const ResizableSplit: React.FC<{ first: React.ReactNode; second: React.ReactNode; testID?: string }> = ({ first, second, testID }) => {
  const { colors } = useTheme();
  const { layoutClass, width, height } = useLayoutClass();
  const direction = paneDirection(width, height);
  const key = ratioKey(layoutClass, direction);
  const stored = usePaneRatios((s) => s.ratios[key]) ?? DEFAULT_RATIO;
  const [size, setSize] = useState(0);
  const start = useRef(stored);
  const live = useRef({ stored, size, key, direction });
  live.current = { stored, size, key, direction };
  const [dragging, setDragging] = useState<number | null>(null);
  const ratio = dragging ?? stored;
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = live.current.stored; },
    onPanResponderMove: (_e, g) => setDragging(dragRatio(start.current, live.current.direction === 'row' ? g.dx : g.dy, live.current.size)),
    onPanResponderRelease: (_e, g) => { usePaneRatios.getState().setRatio(live.current.key, dragRatio(start.current, live.current.direction === 'row' ? g.dx : g.dy, live.current.size)); setDragging(null); },
    onPanResponderTerminate: () => setDragging(null),
  })).current;
  const onLayout = (e: LayoutChangeEvent) => setSize(direction === 'row' ? e.nativeEvent.layout.width : e.nativeEvent.layout.height);
  const nudge = (by: number) => usePaneRatios.getState().setRatio(key, stored + by);
  return (
    <View style={[styles.fill, direction === 'row' ? styles.row : styles.column]} onLayout={onLayout} testID={testID}>
      <View style={{ flex: ratio }}>{first}</View>
      <View {...responder.panHandlers} style={[direction === 'row' ? styles.dividerRow : styles.dividerColumn, { backgroundColor: colors.border }]}
        accessibilityRole="adjustable" accessibilityLabel="Resize panes" accessibilityValue={{ text: `${Math.round(ratio * 100)} percent for the first pane` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)} testID="pane-divider" />
      <View style={{ flex: 1 - ratio }}>{second}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  dividerRow: { width: 12, marginHorizontal: -4, alignSelf: 'stretch' },
  dividerColumn: { height: 12, marginVertical: -4, alignSelf: 'stretch' },
});
