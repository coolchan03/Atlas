import React, { useCallback, useEffect, useState } from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
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
import { useEmergencyColors } from '../atlasTools/offGrid';
import { ScreenBackground } from '../components/ScreenBackground';
import { TYPOGRAPHY, SPACING } from '../constants';

const Native: any = NativeModules.AtlasSensor;

const STRIDE_M = 0.762;
const KCAL_PER_STEP = 0.04;

function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

const literalStyles = StyleSheet.create({
  s1: { flex: 1 },
  s2: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  s3: { marginRight: 12 },
  s4: { fontSize: 20 },
  s5: { flex: 1, alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  s6: { fontSize: 80 },
  s7: { marginTop: 4 },
  s8: { flexDirection: 'row', marginTop: 32, gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
  s9: { alignItems: 'center', padding: 16, borderRadius: 10, borderWidth: 1, minWidth: 120 },
  s10: { fontSize: 24, marginTop: 6 },
  s11: { marginTop: 24, flexDirection: 'row', gap: 12 },
  s12: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', gap: 8, borderWidth: 1 },
  s13: { fontSize: 15 },
});

export const PedometerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const [steps, setSteps] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const emRef = React.useRef<NativeEventEmitter | null>(null);
  const subRef = React.useRef<any>(null);

  const startCounting = useCallback(async () => {
    if (!Native) { setAvailable(false); return; }
    if (Platform.OS === 'android' && Platform.Version >= 29) {
      const granted = await PermissionsAndroid.request(
        'android.permission.ACTIVITY_RECOGNITION' as any,
        { title: 'Activity Recognition', message: 'The step counter needs motion tracking permission.', buttonPositive: 'Allow' },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) { setAvailable(false); return; }
    }
    const ok = await Native.startPedometer().catch(() => false);
    setAvailable(!!ok);
    if (!ok) return;
    const em = new NativeEventEmitter(Native);
    emRef.current = em;
    subRef.current = em.addListener('AtlasPedometer', (e: { steps: number }) => {
      setSteps(e.steps);
    });
  }, []);

  const stopCounting = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    Native?.stopPedometer().catch(() => {});
  }, []);

  useEffect(() => {
    startCounting();
    return () => stopCounting();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(async () => {
    stopCounting();
    setSteps(0);
    await startCounting();
  }, [startCounting, stopCounting]);

  if (available === false) {
    return (
      <SafeAreaView style={[literalStyles.s1, { backgroundColor: colors.background }]}>
        <View style={literalStyles.s2}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={literalStyles.s3}>
            <Icon name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[{ color: colors.text }, literalStyles.s4]}>Step Counter</Text>
        </View>
        <View style={[literalStyles.s5, { justifyContent: 'center' }]}>
          <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.body, textAlign: 'center' }}>
            Step counting is not available on this device.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const distM = steps * STRIDE_M;
  const kcal = steps * KCAL_PER_STEP;

  return (
    <SafeAreaView style={[literalStyles.s1, { backgroundColor: colors.background }]}>
      <ScreenBackground screenKey="Pedometer" />
      <View style={literalStyles.s2}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={literalStyles.s3}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[{ color: colors.text }, literalStyles.s4]}>Step Counter</Text>
      </View>
      <ScrollView contentContainerStyle={literalStyles.s5}>
        <Text style={[{ color: colors.text, ...TYPOGRAPHY.body }, literalStyles.s6]}>
          {steps.toLocaleString()}
        </Text>
        <Text style={[{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }, literalStyles.s7]}>
          steps this session
        </Text>
        <View style={literalStyles.s8}>
          <View style={[literalStyles.s9, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.label }}>DISTANCE</Text>
            <Text style={[{ color: colors.text }, literalStyles.s10]}>{fmtDistance(distM)}</Text>
          </View>
          <View style={[literalStyles.s9, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.label }}>CALORIES</Text>
            <Text style={[{ color: colors.text }, literalStyles.s10]}>{kcal.toFixed(1)} kcal</Text>
          </View>
        </View>
        <View style={[literalStyles.s11, { marginTop: SPACING.xl }]}>
          <TouchableOpacity
            onPress={reset}
            style={[literalStyles.s12, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="refresh-cw" size={16} color={colors.text} />
            <Text style={[{ color: colors.text }, literalStyles.s13]}>Reset</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
