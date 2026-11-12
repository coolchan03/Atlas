import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, NativeModules, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useEmergencyColors, useOffGrid } from '../atlasTools/offGrid';
import { useMaps, bearingDeg, distanceM, fmtDistance } from '../atlasMaps/maps';
import { trueHeading } from '../atlasTools/compassMath';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { LevelView } from './compass/LevelView';
import { SensorCards } from './compass/SensorCards';
import { useCompassSensors } from './compass/useCompassSensors';
const BORDERLEFTCOLOR_TRANSPARENT = 'transparent';
const BORDERRIGHTCOLOR_TRANSPARENT = 'transparent';
const BORDERBOTTOMCOLOR_16A34A = '#16A34A';
const WIDTH_3 = 3;
const WIDTH_1_5 = 1.5;
const HEIGHT_18 = 18;
const HEIGHT_10 = 10;
const COLOR_FFF = '#fff';
const literalStyles = StyleSheet.create({
  modeButton: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  scrollContent: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8 },
  s1: { flex: 1 },
  s6: { fontSize: 56, fontWeight: '800' },
  s7: { fontSize: 24, marginBottom: 16 },
  s8: { alignItems: 'center', justifyContent: 'center' },
  s9: { position: 'absolute', top: -14, zIndex: 2, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 20, borderLeftColor: BORDERLEFTCOLOR_TRANSPARENT, borderRightColor: BORDERRIGHTCOLOR_TRANSPARENT },
  s10: { position: 'absolute' },
  s11: { alignItems: 'center', zIndex: 3 },
  s12: { width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderBottomWidth: 34, borderLeftColor: BORDERLEFTCOLOR_TRANSPARENT, borderRightColor: BORDERRIGHTCOLOR_TRANSPARENT, borderBottomColor: BORDERBOTTOMCOLOR_16A34A },
  s13: { borderWidth: 3 },
  s14: { top: 0, width: 2 },
  s15: { alignItems: 'center' },
  s16: { marginTop: 2 },
  s17: { position: 'absolute', left: 0, top: 0 },
  s18: { marginTop: 26, fontSize: 26, fontWeight: '800' },
  s19: { marginTop: 18, textAlign: 'center', paddingHorizontal: 24 },
  s20: { marginTop: 14, fontSize: 18, textAlign: 'center' },
  s21: { marginTop: 12, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  s22: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8, paddingHorizontal: 12 },
  s23: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, margin: 3 },
});


const Native: any = NativeModules.AtlasDevice;
const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Returns true only when the phone has a magnetometer. */
export async function deviceHasCompass(): Promise<boolean> {
  try { return !!(await Native?.hasCompass()); } catch { return false; }
}

/**
 * Offline compass. Shows TRUE north (corrected with the magnetic declination at the
 * last GPS fix) so it agrees with the map and with directions to saved places.
 */
export const CompassScreen: React.FC = () => {
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const night = useOffGrid((s) => s.nightRed);
  const { width, height } = useWindowDimensions();
  const sensors = useCompassSensors();
  const { heading, accuracy, orientation } = sensors;
  const size = Math.max(160, Math.min(width * 0.82, height - 440, 520));
  const fix = useMaps((s) => s.lastFix);
  const waypoints = useMaps((s) => s.waypoints);
  const imperial = useMaps((s) => s.imperial);
  const [declination, setDeclination] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [levelMode, setLevelMode] = useState(false);
  useEffect(() => {
    if (!fix || !Native?.magneticDeclination) { setDeclination(null); return; }
    Native.magneticDeclination(fix.lat, fix.lon, Number.isFinite(fix.altitude) && fix.altitude > -1000 ? fix.altitude : 0)
      .then((d: number) => setDeclination(Number.isFinite(d) ? d : null))
      .catch(() => setDeclination(null));
  }, [fix?.lat, fix?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = waypoints.find((w) => w.id === targetId) ?? null;

  // Rotate to TRUE north when the declination is known; otherwise stay magnetic and say so.
  const h = heading === null ? 0 : trueHeading(heading, declination);
  const targetBearing = target && fix ? bearingDeg(fix, target) : null;
  const name = NAMES[Math.round(h / 45) % 8];
  const accent = night ? '#FF3B3B' : '#DC2626';

  return (
    <SafeAreaView style={[literalStyles.s1, { backgroundColor: colors.background }]}>
      <ScreenBackground screenKey="Compass" />
      <ScreenHeader title="Compass" colors={colors} right={
        <TouchableOpacity accessibilityRole="button" onPress={() => setLevelMode((v) => !v)} testID="compass-level-toggle" style={[literalStyles.modeButton, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text }}>{levelMode ? 'Compass' : 'Level'}</Text>
        </TouchableOpacity>
      } />
      {levelMode ? (
        <LevelView orientation={orientation} />
      ) : (
      <ScrollView style={literalStyles.s1} contentContainerStyle={literalStyles.scrollContent}>
        <Text style={[{ color: colors.text }, literalStyles.s6]}>{heading === null ? '--' : `${Math.round(h)}°`}</Text>
        <Text style={[{ color: colors.textSecondary }, literalStyles.s7]}>{heading === null ? 'Starting...' : name}</Text>
        <View style={[{ width: size, height: size }, literalStyles.s8]}>
          {/* fixed pointer: the direction the top of the phone faces */}
          <View style={[literalStyles.s9, { borderBottomColor: accent }]} />
          {targetBearing !== null && (
            <View pointerEvents="none" style={[literalStyles.s10, { width: size, height: size }, literalStyles.s11, { transform: [{ rotate: `${targetBearing - h}deg` }] }]}>
              <View style={[{ marginTop: size * 0.12 }, literalStyles.s12]} />
            </View>
          )}
          <View style={[{ width: size, height: size, borderRadius: size / 2 }, literalStyles.s13, { borderColor: colors.border, backgroundColor: colors.surface, transform: [{ rotate: `${-h}deg` }] }]}>
            {Array.from({ length: 36 }).map((_, i) => (
              <View key={i} style={[literalStyles.s10, { left: size / 2 - 1 }, literalStyles.s14, { height: size / 2, transform: [{ rotate: `${i * 10}deg` }] }, literalStyles.s15]}>
                <View style={[{ width: i % 9 === 0 ? WIDTH_3 : WIDTH_1_5, height: i % 9 === 0 ? HEIGHT_18 : HEIGHT_10, backgroundColor: i === 0 ? accent : colors.textMuted }, literalStyles.s16]} />
              </View>
            ))}
            {['N', 'E', 'S', 'W'].map((L, i) => (
              <View key={L} style={[literalStyles.s17, { width: size, height: size }, literalStyles.s15, { transform: [{ rotate: `${i * 90}deg` }] }]}>
                <Text style={[literalStyles.s18, { color: L === 'N' ? accent : colors.text, transform: [{ rotate: `${h - i * 90}deg` }] }]}>{L}</Text>
              </View>
            ))}
          </View>
        </View>
        {accuracy !== null && accuracy < 2 && (
          <Text style={[{ color: colors.textSecondary }, literalStyles.s19]}>
            Low accuracy: move the phone in a figure-8 a few times, away from metal and magnets.
          </Text>
        )}
        {targetBearing !== null && target && fix && (
          <Text style={[{ color: colors.text }, literalStyles.s20]}>
            {target.name}: {fmtDistance(distanceM(fix, target), imperial)}, turn {Math.round(((targetBearing - h + 540) % 360) - 180)}°
          </Text>
        )}
        <Text style={[{ color: colors.textMuted }, literalStyles.s21]}>
          {declination !== null
            ? `True north (corrected by ${Math.abs(declination).toFixed(1)}° ${declination >= 0 ? 'east' : 'west'} for where you are). Matches the map and saved-place directions.`
            : 'Magnetic north: open Maps once to get a GPS fix and the compass switches to true north.'} Hold the phone flat, away from magnets.
        </Text>
        {waypoints.length > 0 && (
          <View style={literalStyles.s22}>
            {waypoints.slice(0, 6).map((w) => (
              <TouchableOpacity key={w.id} onPress={() => setTargetId(w.id === targetId ? null : w.id)} accessibilityLabel={`Point to ${w.name}`}
                style={[literalStyles.s23, { backgroundColor: w.id === targetId ? accent : colors.surface }]}>
                <Text style={{ color: w.id === targetId ? COLOR_FFF : colors.text }}>{w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <SensorCards colors={colors} sensors={sensors} />
      </ScrollView>
      )}
    </SafeAreaView>
  );
};
