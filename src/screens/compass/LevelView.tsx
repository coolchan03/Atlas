import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { levelPose, type LevelPose } from '../../atlasTools/levelMath';

// The level is a fixed black screen with white ink, like the old iOS level: it stays readable in any theme or night mode.
const INK = '#FFFFFF';
const INK_DIM = '#CCCCCC';
const RING = '#888888';
const BACKDROP = '#000000';
const LEVEL_BACKDROP = '#15803D';

type Accel = { x: number; y: number; z: number } | null;

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

/** The two circles. Lying flat they overlap exactly when level; upright they line up top and bottom at 0, 90, 180 and 270. */
const Circles: React.FC<{ pose: LevelPose | null; width: number }> = ({ pose, width }) => {
  const disc = width * 0.5;
  if (!pose) return null;
  if (pose.mode === 'flat') {
    const slide = (v: number) => clamp(v * 6, width * 0.3);
    return (
      <>
        <View style={[styles.disc, styles.middle, { width: disc, height: disc, borderRadius: disc / 2, left: width / 2 - disc / 2, marginTop: -disc / 2 }]} testID="level-fixed-circle" />
        <View style={[styles.ring, styles.middle, { width: disc, height: disc, borderRadius: disc / 2, left: width / 2 - disc / 2 + slide(pose.x), marginTop: -disc / 2 + slide(-pose.y) }]} testID="level-moving-circle" />
      </>
    );
  }
  const shift = clamp(pose.x * 5, width * 0.35);
  const edge = (side: 'top' | 'bottom', dx: number) => ({ width: disc, height: disc, borderRadius: disc / 2, left: width / 2 - disc / 2 + dx, [side]: -disc * 0.45 });
  return (
    <>
      <View style={[styles.disc, edge('top', shift)]} testID="level-fixed-circle" />
      <View style={[styles.disc, edge('bottom', -shift)]} testID="level-moving-circle" />
    </>
  );
};

/** Level driven by the phone's gravity sensors: a big angle and two circles that come together at level. */
export const LevelView: React.FC<{ orientation: { pitch: number; roll: number } | null; accel?: Accel }> = ({ orientation, accel = null }) => {
  const { width } = useWindowDimensions();
  const pose = levelPose(accel, orientation);
  let caption = 'Orientation sensor unavailable';
  if (pose) caption = pose.isLevel ? 'Level' : pose.mode === 'flat' ? 'Lying flat: bring the circles together' : 'Upright: square at 0, 90, 180 and 270';
  return (
    <View style={[styles.screen, pose?.isLevel && styles.levelScreen]} testID="compass-level-view">
      <Circles pose={pose} width={width} />
      <Text style={styles.tilt}>{pose ? `${Math.round(pose.degrees)}°` : '--'}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP, alignItems: 'center', justifyContent: 'center', padding: 22, overflow: 'hidden' },
  levelScreen: { backgroundColor: LEVEL_BACKDROP },
  disc: { position: 'absolute', backgroundColor: INK },
  middle: { top: '50%' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: RING },
  tilt: { color: INK, fontSize: 96, fontWeight: '200' },
  caption: { color: INK_DIM, fontSize: 14, marginTop: 8 },
});
