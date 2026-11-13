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
import { CompassDial, DIAL_INK } from './compass/CompassDial';
import { PageDots, Readout } from './compass/Readout';
import { useUnits } from '../atlasTools/units';
import { SensorCards } from './compass/SensorCards';
import { useCompassSensors } from './compass/useCompassSensors';
const BACKDROP = '#000000';
const INK_DIM = '#9A9A9A';
const INK_FAINT = '#6B6B6B';
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP },
  modeButton: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  content: { paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  note: { color: INK_DIM, textAlign: 'center', marginTop: 16, paddingHorizontal: 12 },
  fine: { color: INK_FAINT, fontSize: 12, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 },
  target: { color: DIAL_INK, fontSize: 18, textAlign: 'center', marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, margin: 3 },
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
  const units = useUnits();
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

  const ink = night ? accent : DIAL_INK;
  const headerColors = { ...colors, background: BACKDROP, text: ink, textSecondary: INK_DIM, border: INK_FAINT };
  const dots = <PageDots levelMode={levelMode} ink={ink} onPick={setLevelMode} />;

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenBackground screenKey="Compass" />
      <ScreenHeader title="Compass" colors={headerColors} right={
        <TouchableOpacity accessibilityRole="button" onPress={() => setLevelMode((v) => !v)} testID="compass-level-toggle" style={[styles.modeButton, { borderColor: INK_FAINT }]}>
          <Text style={{ color: ink }}>{levelMode ? 'Compass' : 'Level'}</Text>
        </TouchableOpacity>
      } />
      {levelMode ? (
        <>
          <LevelView orientation={orientation} accel={sensors.accel} />
          <View style={styles.content}>{dots}</View>
        </>
      ) : (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <CompassDial size={size} heading={h} accent={accent} target={targetBearing} tilt={orientation} />
        <Readout heading={heading === null ? null : h} name={name} ink={ink} units={units} fix={fix} />
        {dots}
        {accuracy !== null && accuracy < 2 && (
          <Text style={styles.note}>Low accuracy: move the phone in a figure-8 a few times, away from metal and magnets.</Text>
        )}
        {targetBearing !== null && target && fix && (
          <Text style={[styles.target, { color: ink }]}>
            {target.name}: {fmtDistance(distanceM(fix, target), units.imperial)}, turn {Math.round(((targetBearing - h + 540) % 360) - 180)}°
          </Text>
        )}
        <Text style={styles.fine}>
          {declination !== null
            ? `True north (corrected by ${Math.abs(declination).toFixed(1)}° ${declination >= 0 ? 'east' : 'west'} for where you are). Matches the map and saved-place directions.`
            : 'Magnetic north: open Maps once to get a GPS fix and the compass switches to true north.'} Hold the phone flat, away from magnets.
        </Text>
        {waypoints.length > 0 && (
          <View style={styles.chips}>
            {waypoints.slice(0, 6).map((w) => (
              <TouchableOpacity key={w.id} onPress={() => setTargetId(w.id === targetId ? null : w.id)} accessibilityLabel={`Point to ${w.name}`}
                style={[styles.chip, { backgroundColor: w.id === targetId ? accent : INK_FAINT }]}>
                <Text style={{ color: DIAL_INK }}>{w.name}</Text>
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
