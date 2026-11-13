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

/** Both circles move: each slides half the tilt in opposite directions, so lying flat they meet exactly at 0 degrees. */
export function flatOffsets(x: number, y: number, reach: number): { a: { dx: number; dy: number }; b: { dx: number; dy: number } } {
  const half = (v: number) => clamp((v * 6) / 2, reach / 2);
  const bx = half(x) || 0; const by = half(-y) || 0; // `|| 0` avoids a negative zero
  return { a: { dx: -bx || 0, dy: -by || 0 }, b: { dx: bx, dy: by } };
}

/** The two circles. Lying flat they overlap exactly when level; upright they line up top and bottom at 0, 90, 180 and 270. */
const Circles: React.FC<{ pose: LevelPose | null; width: number; height: number; level: boolean }> = ({ pose, width, height, level }) => {
  // Sized from the room actually available (the smaller of width and height), so low landscape windows do not clip it.
  const size = Math.min(width, height);
  const disc = size * 0.5;
  if (!pose) return null;
  if (pose.mode === 'flat') {
    const o = level ? { a: { dx: 0, dy: 0 }, b: { dx: 0, dy: 0 } } : flatOffsets(pose.x, pose.y, size * 0.6);
    const place = (d: { dx: number; dy: number }) => ({ width: disc, height: disc, borderRadius: disc / 2, left: width / 2 - disc / 2 + d.dx, marginTop: -disc / 2 + d.dy });
    return (
      <>
        <View style={[styles.disc, styles.middle, place(o.a)]} testID="level-fixed-circle" />
        <View style={[styles.ring, styles.middle, place(o.b)]} testID="level-moving-circle" />
      </>
    );
  }
  const shift = clamp(pose.x * 5, size * 0.35);
  const edge = (side: 'top' | 'bottom', dx: number) => ({ width: disc, height: disc, borderRadius: disc / 2, left: width / 2 - disc / 2 + dx, [side]: -disc * 0.45 });
  return (
    <>
      <View style={[styles.disc, edge('top', level ? 0 : shift)]} testID="level-fixed-circle" />
      <View style={[styles.disc, edge('bottom', level ? 0 : -shift)]} testID="level-moving-circle" />
    </>
  );
};

/** Level driven by the phone's gravity sensors: a big angle and two circles that come together at level. */
export const LevelView: React.FC<{ orientation: { pitch: number; roll: number } | null; accel?: Accel }> = ({ orientation, accel = null }) => {
  const { width, height } = useWindowDimensions();
  const pose = levelPose(accel, orientation);
  // A little hysteresis: level is declared within 1 degree but only dropped past 1.6, so the green does not flicker around 0.
  const wasLevel = React.useRef(false);
  const level = !!pose && (pose.isLevel || (wasLevel.current && Math.abs(pose.degrees) <= 1.6));
  wasLevel.current = level;
  let caption = 'Orientation sensor unavailable';
  if (pose) caption = level ? 'Level' : pose.mode === 'flat' ? 'Lying flat: bring the circles together' : 'Upright: square at 0, 90, 180 and 270';
  return (
    <View style={[styles.screen, level && styles.levelScreen]} testID="compass-level-view">
      <Circles pose={pose} width={width} height={height} level={level} />
      {/* The angle sits last (on top of both circles) on its own dark backing, so it stays readable over white, black and green. */}
      <View style={styles.tiltBack} pointerEvents="none"><Text style={styles.tilt} testID="level-degrees">{pose ? `${Math.round(Math.abs(pose.degrees))}°` : '--'}</Text></View>
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
  tiltBack: { backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 2 },
  tilt: { color: INK, fontSize: 72, fontWeight: '300' },
  caption: { color: INK_DIM, fontSize: 14, marginTop: 8 },
});
