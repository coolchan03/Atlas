import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  NativeEventEmitter,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useEmergencyColors, useOffGrid } from '../atlasTools/offGrid';
import { ScreenBackground } from '../components/ScreenBackground';
import { TYPOGRAPHY, SPACING } from '../constants';

const Native: any = NativeModules.AtlasSensor;

function alertLabel(mag: number, baseline: number | null): { text: string; color: string } {
  const delta = baseline !== null ? mag - baseline : mag;
  const val = baseline !== null ? Math.abs(delta) : mag;
  if (val > 100) return { text: 'Metal detected', color: '#DC2626' };
  if (val > 70) return { text: 'Elevated', color: '#D97706' };
  return { text: 'Normal', color: '#16A34A' };
}

const literalStyles = StyleSheet.create({
  s1: { flex: 1 },
  s2: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  s3: { marginRight: 12 },
  s4: { fontSize: 20 },
  s5: { flex: 1, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  s6: { width: '80%', height: 20, borderRadius: 10, overflow: 'hidden', marginBottom: 24 },
  s7: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  s8: { fontSize: 56 },
  s9: { marginTop: 4 },
  s10: { marginTop: 8, fontSize: 20 },
  s11: { marginTop: 20, flexDirection: 'row', gap: 12 },
  s12: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  s13: { fontSize: 14 },
  s14: { marginTop: 24, padding: 16, borderRadius: 10, borderWidth: 1, width: '100%' },
  s15: { fontSize: 11, marginBottom: 6 },
  s16: { flexDirection: 'row', justifyContent: 'space-between' },
  s17: { fontSize: 12 },
  s18: { marginTop: 8, fontSize: 12, textAlign: 'center' },
});

export const MetalDetectorScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const night = useOffGrid((s) => s.nightRed);
  const [mag, setMag] = useState<{ x: number; y: number; z: number; magnitude: number } | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  const barAnim = useRef(new Animated.Value(0)).current;
  const accent = night ? '#FF3B3B' : '#16A34A';

  useEffect(() => {
    if (!Native) return;
    const em = new NativeEventEmitter(Native);
    const sub = em.addListener('AtlasMagnetometer', (e: { x: number; y: number; z: number; magnitude: number }) => {
      setMag(e);
      const fraction = Math.min(1, e.magnitude / 150);
      Animated.timing(barAnim, { toValue: fraction, duration: 100, useNativeDriver: false }).start();
    });
    Native.startMagnetometer().catch(() => {});
    return () => { sub.remove(); Native.stopMagnetometer().catch(() => {}); };
  }, [barAnim]);

  if (!Native) {
    return (
      <SafeAreaView style={[literalStyles.s1, { backgroundColor: colors.background }]}>
        <View style={literalStyles.s2}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={literalStyles.s3}>
            <Icon name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[{ color: colors.text }, literalStyles.s4]}>Metal Detector</Text>
        </View>
        <View style={[literalStyles.s5, { justifyContent: 'center' }]}>
          <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.body, textAlign: 'center' }}>
            Magnetometer not available on this device.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const magnitude = mag?.magnitude ?? 0;
  const delta = baseline !== null ? magnitude - baseline : null;
  const alert = alertLabel(magnitude, baseline);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const barColor = alert.color;

  return (
    <SafeAreaView style={[literalStyles.s1, { backgroundColor: colors.background }]}>
      <ScreenBackground screenKey="MetalDetector" />
      <View style={literalStyles.s2}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={literalStyles.s3}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[{ color: colors.text }, literalStyles.s4]}>Metal Detector</Text>
      </View>
      <ScrollView contentContainerStyle={literalStyles.s5}>
        <View style={[literalStyles.s6, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
          <Animated.View style={[literalStyles.s7, { width: barWidth, backgroundColor: barColor }]} />
        </View>
        <Text style={[{ color: colors.text, ...TYPOGRAPHY.body }, literalStyles.s8]}>
          {mag ? `${magnitude.toFixed(1)}` : '--'}
        </Text>
        <Text style={[{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }, literalStyles.s9]}>
          {mag ? 'µT total field' : 'Starting...'}
        </Text>
        {delta !== null && (
          <Text style={[{ color: colors.text, ...TYPOGRAPHY.body }, literalStyles.s10]}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)} µT from baseline
          </Text>
        )}
        <Text style={[{ color: alert.color, ...TYPOGRAPHY.body }, { marginTop: SPACING.md, fontSize: 18 }]}>
          {alert.text}
        </Text>
        <View style={literalStyles.s11}>
          <TouchableOpacity
            onPress={() => setBaseline(magnitude)}
            style={[literalStyles.s12, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="target" size={16} color={accent} />
            <Text style={[{ color: colors.text, marginTop: SPACING.xs }, literalStyles.s13]}>Set baseline</Text>
          </TouchableOpacity>
          {baseline !== null && (
            <TouchableOpacity
              onPress={() => setBaseline(null)}
              style={[literalStyles.s12, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="x" size={16} color={colors.textMuted} />
              <Text style={[{ color: colors.textMuted, marginTop: SPACING.xs }, literalStyles.s13]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {mag && (
          <View style={[literalStyles.s14, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[{ color: colors.textSecondary }, literalStyles.s15]}>RAW FIELD (µT)</Text>
            <View style={literalStyles.s16}>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <View key={axis} style={{ alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.label }}>{axis.toUpperCase()}</Text>
                  <Text style={[{ color: colors.text }, literalStyles.s17]}>{mag[axis].toFixed(1)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <Text style={[{ color: colors.textMuted }, literalStyles.s18]}>
          Earth's field is 25-65 µT. Metal objects disturb the local field above that range.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
