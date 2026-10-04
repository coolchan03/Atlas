import React, { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useEmergencyColors, useOffGrid } from '../atlasTools/offGrid';

const Native: any = NativeModules.AtlasDevice;
const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Returns true only when the phone has a magnetometer. */
export async function deviceHasCompass(): Promise<boolean> {
  try { return !!(await Native?.hasCompass()); } catch { return false; }
}

/** Offline compass (magnetic north). Shown only on devices with a compass sensor. */
export const CompassScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const night = useOffGrid((s) => s.nightRed);
  const { width, height } = useWindowDimensions();
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number>(3);
  const size = Math.max(160, Math.min(width * 0.82, height - 400, 520));

  useEffect(() => {
    if (!Native) return;
    const em = new NativeEventEmitter(Native);
    const a = em.addListener('AtlasCompass', (e: { heading: number }) => setHeading(e.heading));
    const b = em.addListener('AtlasCompassAccuracy', (e: { accuracy: number }) => setAccuracy(e.accuracy));
    Native.startCompass().catch(() => undefined);
    return () => { a.remove(); b.remove(); Native.stopCompass().catch(() => undefined); };
  }, []);

  const h = heading ?? 0;
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
        {accuracy < 2 && (
          <Text style={{ color: colors.textSecondary, marginTop: 18, textAlign: 'center', paddingHorizontal: 24 }}>
            Low accuracy: move the phone in a figure-8 a few times, away from metal and magnets.
          </Text>
        )}
        <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>
          Points to magnetic north. Hold the phone flat. Phone cases with magnets can throw it off.
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('SurvivalManual', { chapterId: 'DirectionFinding' })} style={{ marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text }}>Find direction without a compass (sun, stars, shadows)</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
