import React, { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useEmergencyColors, useOffGrid } from '../atlasTools/offGrid';
import { useMaps, bearingDeg, distanceM, fmtDistance } from '../atlasMaps/maps';
import { trueHeading } from '../atlasTools/compassMath';

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
  const navigation = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const night = useOffGrid((s) => s.nightRed);
  const { width, height } = useWindowDimensions();
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const size = Math.max(160, Math.min(width * 0.82, height - 440, 520));
  const fix = useMaps((s) => s.lastFix);
  const waypoints = useMaps((s) => s.waypoints);
  const imperial = useMaps((s) => s.imperial);
  const [declination, setDeclination] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  useEffect(() => {
    if (!fix || !Native?.magneticDeclination) { setDeclination(null); return; }
    Native.magneticDeclination(fix.lat, fix.lon, Number.isFinite(fix.altitude) && fix.altitude > -1000 ? fix.altitude : 0)
      .then((d: number) => setDeclination(Number.isFinite(d) ? d : null))
      .catch(() => setDeclination(null));
  }, [fix?.lat, fix?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = waypoints.find((w) => w.id === targetId) ?? null;

  useEffect(() => {
    if (!Native) return;
    const em = new NativeEventEmitter(Native);
    const a = em.addListener('AtlasCompass', (e: { heading: number }) => {
      if (Number.isFinite(e.heading)) setHeading(((e.heading % 360) + 360) % 360);
    });
    const b = em.addListener('AtlasCompassAccuracy', (e: { accuracy: number }) => {
      if (Number.isFinite(e.accuracy)) setAccuracy(e.accuracy);
    });
    Native.startCompass().catch(() => undefined);
    return () => { a.remove(); b.remove(); Native.stopCompass().catch(() => undefined); };
  }, []);

  // Rotate to TRUE north when the declination is known; otherwise stay magnetic and say so.
  const h = heading === null ? 0 : trueHeading(heading, declination);
  const targetBearing = target && fix ? bearingDeg(fix, target) : null;
  const name = NAMES[Math.round(h / 45) % 8];
  const accent = night ? '#FF3B3B' : '#DC2626';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}><Icon name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Compass</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 56, fontWeight: '800' }}>{heading === null ? '--' : `${Math.round(h)}°`}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 24, marginBottom: 16 }}>{heading === null ? 'Starting...' : name}</Text>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* fixed pointer: the direction the top of the phone faces */}
          <View style={{ position: 'absolute', top: -14, zIndex: 2, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 20, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: accent }} />
          {targetBearing !== null && (
            <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, alignItems: 'center', zIndex: 3, transform: [{ rotate: `${targetBearing - h}deg` }] }}>
              <View style={{ marginTop: size * 0.12, width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderBottomWidth: 34, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#16A34A' }} />
            </View>
          )}
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.surface, transform: [{ rotate: `${-h}deg` }] }}>
            {Array.from({ length: 36 }).map((_, i) => (
              <View key={i} style={{ position: 'absolute', left: size / 2 - 1, top: 0, width: 2, height: size / 2, transform: [{ rotate: `${i * 10}deg` }], alignItems: 'center' }}>
                <View style={{ width: i % 9 === 0 ? 3 : 1.5, height: i % 9 === 0 ? 18 : 10, backgroundColor: i === 0 ? accent : colors.textMuted, marginTop: 2 }} />
              </View>
            ))}
            {['N', 'E', 'S', 'W'].map((L, i) => (
              <View key={L} style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, alignItems: 'center', transform: [{ rotate: `${i * 90}deg` }] }}>
                <Text style={{ marginTop: 26, fontSize: 26, fontWeight: '800', color: L === 'N' ? accent : colors.text, transform: [{ rotate: `${h - i * 90}deg` }] }}>{L}</Text>
              </View>
            ))}
          </View>
        </View>
        {accuracy !== null && accuracy < 2 && (
          <Text style={{ color: colors.textSecondary, marginTop: 18, textAlign: 'center', paddingHorizontal: 24 }}>
            Low accuracy: move the phone in a figure-8 a few times, away from metal and magnets.
          </Text>
        )}
        {targetBearing !== null && target && fix && (
          <Text style={{ color: colors.text, marginTop: 14, fontSize: 18, textAlign: 'center' }}>
            {target.name}: {fmtDistance(distanceM(fix, target), imperial)}, turn {Math.round(((targetBearing - h + 540) % 360) - 180)}°
          </Text>
        )}
        <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>
          {declination !== null
            ? `True north (corrected by ${Math.abs(declination).toFixed(1)}° ${declination >= 0 ? 'east' : 'west'} for where you are). Matches the map and saved-place directions.`
            : 'Magnetic north: open Maps once to get a GPS fix and the compass switches to true north.'} Hold the phone flat, away from magnets.
        </Text>
        {waypoints.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8, paddingHorizontal: 12 }}>
            {waypoints.slice(0, 6).map((w) => (
              <TouchableOpacity key={w.id} onPress={() => setTargetId(w.id === targetId ? null : w.id)} accessibilityLabel={`Point to ${w.name}`}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, margin: 3, backgroundColor: w.id === targetId ? accent : colors.surface }}>
                <Text style={{ color: w.id === targetId ? '#fff' : colors.text }}>{w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity onPress={() => navigation.navigate('SurvivalManual', { chapterId: 'DirectionFinding' })} style={{ marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text }}>Find direction without a compass (sun, stars, shadows)</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
