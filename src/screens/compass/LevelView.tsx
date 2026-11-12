import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { levelReading } from '../../atlasTools/levelMath';

// The level is a fixed black screen with white ink, like the old iOS level: it stays readable in any theme or night mode.
const INK = '#FFFFFF';
const INK_DIM = '#CCCCCC';
const BACKDROP = '#000000';
const LEVEL_BACKDROP = '#15803D';

/** The signed angle along the way the phone leans most, so "-36°" means 36 degrees one way. */
export function signedTilt(level: { pitch: number; roll: number; tilt: number }): number {
  const lean = Math.abs(level.roll) >= Math.abs(level.pitch) ? level.roll : level.pitch;
  return lean < 0 ? -level.tilt : level.tilt;
}

/** Level driven by the phone's pitch and roll: a large angle, and two discs that slide apart as it tilts. */
export const LevelView: React.FC<{ orientation: { pitch: number; roll: number } | null }> = ({ orientation }) => {
  const { width } = useWindowDimensions();
  const level = levelReading(orientation);
  const disc = width * 0.62;
  const slide = level ? Math.max(-width * 0.3, Math.min(width * 0.3, level.roll * 6)) : 0;
  const rise = level ? Math.max(-width * 0.1, Math.min(width * 0.1, level.pitch * 3)) : 0;
  let caption = 'Orientation sensor unavailable';
  if (level) caption = level.isLevel ? 'Level' : `Pitch ${level.pitch.toFixed(1)}°  ·  Roll ${level.roll.toFixed(1)}°`;
  return (
    <View style={[styles.screen, level?.isLevel && styles.levelScreen]} testID="compass-level-view">
      <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2, top: -disc * 0.45, left: width / 2 - disc / 2 + slide, transform: [{ translateY: rise }] }]} />
      <Text style={styles.tilt}>{level ? `${signedTilt(level).toFixed(0)}°` : '--'}</Text>
      <Text style={styles.caption}>{caption}</Text>
      <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2, bottom: -disc * 0.45, left: width / 2 - disc / 2 - slide, transform: [{ translateY: -rise }] }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP, alignItems: 'center', justifyContent: 'center', padding: 22, overflow: 'hidden' },
  levelScreen: { backgroundColor: LEVEL_BACKDROP },
  disc: { position: 'absolute', backgroundColor: INK },
  tilt: { color: INK, fontSize: 96, fontWeight: '200' },
  caption: { color: INK_DIM, fontSize: 14, marginTop: 8 },
});
