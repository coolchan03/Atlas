import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { levelReading, clampLevelMarker } from '../../atlasTools/levelMath';

// The level is a fixed high-contrast black screen so it stays readable in any theme or night mode.
const INK = '#FFFFFF';
const INK_DIM = '#CCCCCC';
const RING = '#888888';
const CROSSHAIR = '#777777';
const BACKDROP = '#000000';

/** Bubble level driven by the phone's pitch and roll. */
export const LevelView: React.FC<{ orientation: { pitch: number; roll: number } | null }> = ({ orientation }) => {
  const { width } = useWindowDimensions();
  const level = levelReading(orientation);
  const dial = Math.min(width - 70, 310);
  let caption = 'Orientation sensor unavailable';
  if (level) caption = level.isLevel ? 'Level' : `Pitch ${level.pitch.toFixed(1)}°  ·  Roll ${level.roll.toFixed(1)}°`;
  return (
    <View style={styles.screen} testID="compass-level-view">
      <Text style={styles.title}>LEVEL</Text>
      <View style={[styles.dial, { width: dial, height: dial, borderRadius: dial / 2, borderColor: level?.isLevel ? INK : RING }]}>
        <View style={[styles.horizontal, { width: dial }]} />
        <View style={[styles.vertical, { height: dial }]} />
        {level && (
          <View style={[styles.bubble, { backgroundColor: level.isLevel ? INK : BACKDROP, transform: [{ translateX: clampLevelMarker(level.roll) }, { translateY: clampLevelMarker(level.pitch) }] }]} />
        )}
      </View>
      <Text style={styles.tilt}>{level ? `${level.tilt.toFixed(1)}°` : '--'}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP, alignItems: 'center', justifyContent: 'center', padding: 22 },
  title: { color: INK, fontSize: 16, marginBottom: 18 },
  dial: { borderWidth: 2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  horizontal: { height: 1, backgroundColor: CROSSHAIR, position: 'absolute' },
  vertical: { width: 1, backgroundColor: CROSSHAIR, position: 'absolute' },
  bubble: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: INK },
  tilt: { color: INK, fontSize: 52, fontWeight: '300', marginTop: 24 },
  caption: { color: INK_DIM, fontSize: 14, marginTop: 8 },
});
