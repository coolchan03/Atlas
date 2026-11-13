import React, { useEffect, useState } from 'react';
import { NativeModules, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Card } from '../components';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { useMaps, watchPosition, fmtCoord, fmtDistance } from '../atlasMaps/maps';
import { fmtTemp, fmtWind, useUnits } from '../atlasTools/units';
import { PressureCard } from '../screens/compass/PressureCard';
import { SENSOR_INFO, NEEDS_PERMISSION, labelOf } from './sensorCatalog';
import { useSensors } from './useSensors';

/** The sensors a phone usually has. When one is missing the screen says so instead of leaving a gap. */
const EXPECTED = [5, 4, 6, 8, 12, 13];
const TOOLS: Array<{ label: string; icon: string; to: string }> = [
  { label: 'Compass and level', icon: 'compass', to: 'Compass' },
  { label: 'Noise meter', icon: 'volume-2', to: 'NoiseMeter' },
  { label: 'Metal detector', icon: 'radio', to: 'MetalDetector' },
  { label: 'Step counter', icon: 'activity', to: 'Pedometer' },
];

const Device: any = NativeModules.AtlasDevice;

/** Every sensor in one place: the phone's own sensors with live readings, GPS, battery temperature, and the tools built on them. */
export const SensorsScreen: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const units = useUnits();
  const { available, sensors, values, silent } = useSensors();
  const fix = useMaps((s) => s.lastFix);
  const [batteryTemp, setBatteryTemp] = useState<number | null>(null);
  const [gpsMessage, setGpsMessage] = useState('');

  useEffect(() => {
    let stop = () => undefined as void;
    let alive = true;
    watchPosition(() => undefined, (m) => { if (alive) setGpsMessage(m); }).then((s) => { if (alive) stop = s; else s(); }).catch(() => undefined);
    return () => { alive = false; stop(); };
  }, []);
  useEffect(() => {
    if (!Device?.getBatteryTemperature) return;
    const read = () => Device.getBatteryTemperature().then(setBatteryTemp).catch(() => undefined);
    read();
    const timer = setInterval(read, 30000);
    return () => clearInterval(timer);
  }, []);

  const pressure = values[6]?.[0];
  const missing = EXPECTED.filter((t) => sensors.length > 0 && !sensors.some((s) => s.type === t));
  const gpsAltitude = fix && fix.altitude > -99999 ? fix.altitude : null;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenBackground screenKey="Sensors" />
      <ScreenHeader title="Sensors" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.note, { color: colors.textSecondary }]}>Every sensor this phone has, reading live while this screen is open. Nothing is recorded or sent anywhere, except the air pressure history kept on this phone for the weather trend.</Text>

        <Card style={styles.card} testID="sensor-gps">
          <Text style={[styles.title, { color: colors.text }]}>GPS</Text>
          {fix ? (
            <>
              <Text style={{ color: colors.text }}>{fmtCoord(fix.lat, fix.lon)}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                Accuracy {fmtDistance(fix.accuracy, units.imperial)}{gpsAltitude !== null ? ` · Height ${fmtDistance(gpsAltitude, units.imperial)}` : ''}{fix.speed > 0.5 ? ` · Speed ${fmtWind(fix.speed * 3.6, units.imperial)}` : ''}
              </Text>
            </>
          ) : <Text style={[styles.meta, { color: colors.textSecondary }]}>{gpsMessage || 'Waiting for a position. It works outdoors with no signal or internet.'}</Text>}
        </Card>

        {pressure !== undefined && (
          <PressureCard pressure={{ hpa: pressure, altM: 44330 * (1 - (pressure / 1013.25) ** (1 / 5.255)) }} gps={fix ? { altitude: fix.altitude, accuracy: fix.accuracy } : null} units={units} ink={colors.text} />
        )}

        {batteryTemp !== null && (
          <Card style={styles.card}>
            <Text style={[styles.title, { color: colors.text }]}>Battery temperature</Text>
            <Text style={{ color: colors.text }}>{fmtTemp(batteryTemp, units.temp)}</Text>
          </Card>
        )}

        {!available && <Text style={[styles.note, { color: colors.textSecondary }]} testID="sensors-unavailable">This build cannot list the phone's sensors. Update Atlas to see them.</Text>}
        {sensors.map((s) => {
          const info = SENSOR_INFO[s.type];
          const value = values[s.type];
          const waiting = silent.includes(s.type) ? (NEEDS_PERMISSION.has(s.type) ? 'Needs a permission Atlas does not ask for here' : 'No reading (permission needed or the phone does not report it)') : 'Waiting for a reading...';
          return (
            <Card key={s.type} style={styles.card} testID={`sensor-${s.type}`}>
              <Text style={[styles.title, { color: colors.text }]}>{labelOf(s)}</Text>
              <Text style={{ color: colors.text }} testID={`sensor-value-${s.type}`}>{value && info ? info.show(value, units) : value ? value.map((n) => n.toFixed(2)).join('  ') : waiting}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{info?.hint ? `${info.hint}. ` : ''}{s.name}{s.vendor ? `, ${s.vendor}` : ''}</Text>
            </Card>
          );
        })}
        {missing.length > 0 && (
          <Text style={[styles.note, { color: colors.textSecondary }]} testID="sensors-missing">Not found on this phone: {missing.map((t) => SENSOR_INFO[t].label).join(', ')}.</Text>
        )}

        <Text style={[styles.title, { color: colors.text }]}>Tools built on the sensors</Text>
        {TOOLS.map((t) => (
          <TouchableOpacity key={t.to} onPress={() => navigation.navigate(t.to)} style={styles.tool} accessibilityRole="button" testID={`sensor-tool-${t.to}`}>
            <Icon name={t.icon} size={18} color={colors.primary} />
            <Text style={{ color: colors.text }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: 80, gap: SPACING.sm },
  note: { ...TYPOGRAPHY.bodySmall },
  card: { marginBottom: SPACING.xs },
  title: { ...TYPOGRAPHY.h3, marginBottom: 2 },
  meta: { ...TYPOGRAPHY.bodySmall, marginTop: 2 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
});
