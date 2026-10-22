import React, { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { useEmergencyColors } from '../atlasTools/offGrid';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useWideLayout } from '../hooks/useWideLayout';
import { SensorToolkitSession, type SensorSnapshot, type Vector } from '../services/tools/sensorToolkitSession';
export type { SensorSnapshot } from '../services/tools/sensorToolkitSession';

export function sensorValue(value: number | undefined, unit: string, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : 'No reading';
}
export function sensorVector(v: Vector | undefined, unit: string): string {
  return v && [v.x, v.y, v.z].every(n => Number.isFinite(n))
    ? `${[v.x, v.y, v.z].map(n => n.toFixed(2)).join(' / ')} ${unit}` : 'No reading';
}
export function availability(snapshot: SensorSnapshot, key: string, ...reading: [field: number | undefined, unit: string]): string {
  if (!snapshot.sensors?.[key]) return 'Not installed';
  return sensorValue(...reading);
}
function batteryStatus(battery: SensorSnapshot['battery']): string {
  if (!battery) return 'No reading';
  return battery.charging ? 'Charging' : 'On battery';
}
function wifiStatus(wifi: SensorSnapshot['wifi']): string {
  if (!wifi?.available) return 'Not available';
  if (wifi.connected) return 'Connected';
  return wifi.enabled ? 'On, not connected' : 'Off';
}
function bluetoothStatus(bluetooth: SensorSnapshot['bluetooth']): string {
  if (!bluetooth?.available) return 'Not available';
  if (!bluetooth.permissionGranted) return 'Permission needed';
  return bluetooth.enabled ? 'On' : 'Off';
}

export const SensorToolkitScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const styles = useThemedStyles(createStyles);
  const { isWide, column } = useWideLayout();
  const [session] = useState(() => new SensorToolkitSession());
  const { snapshot, error, loading } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useFocusEffect(session.focus);
  const read = session.refresh;
  const requestBluetooth = session.requestBluetooth;

  const present = (label: string, value: string, ...[detail, icon = 'activity']: [detail?: string, icon?: string]) => (
    <View key={label} accessibilityLabel={`${label}: ${value}`}
      style={[styles.card, isWide && styles.wideCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Icon name={icon} color={colors.primary} size={18} />
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.reading, { color: colors.text }]}>{value}</Text>
      {!!detail && <Text style={[styles.detail, { color: colors.textMuted }]}>{detail}</Text>}
    </View>
  );
  const section = (title: string, items: React.ReactNode[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.grid}>{items}</View>
    </View>
  );
  const s = snapshot;
  const keys = s?.sensors || {};
  const pressure = s ? availability(s, 'pressure', s.pressureHpa, 'hPa') : 'Waiting for sample';
  const temperature = s ? availability(s, 'ambientTemperature', s.ambientTemperatureC, '°C') : 'Waiting for sample';
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => nav.goBack()} style={styles.headerButton}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Sensor toolkit</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh sensor readings"
          onPress={() => { void read(); }} style={styles.headerButton} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.primary} /> : <Icon name="refresh-cw" size={20} color={colors.primary} />}
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.content, column]}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Live on-device readings · refreshes about every 12 seconds while open · works without internet
        </Text>
        {s?.sampledAt ? <Text style={[styles.detail, { color: colors.textMuted }]}>Last sample: {new Date(s.sampledAt).toLocaleTimeString()}</Text> : null}
        {!!error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
        {section('Environment', [
          present('Air pressure', pressure, keys.pressure ? 'Barometer, not a weather forecast' : 'This phone has no barometer', 'cloud'),
          present('Pressure trend', !keys.pressure ? 'Not installed' : sensorValue(s?.pressureChangeHpaPerHour, 'hPa/hour', 2),
            'Needs two samples at least 5 minutes apart', 'trending-up'),
          present('Ambient temperature', temperature,
            keys.ambientTemperature ? 'Device ambient sensor, not an outdoor forecast' : 'Most phones have no ambient thermometer', 'thermometer'),
          present('Temperature trend', !keys.ambientTemperature ? 'Not installed' : sensorValue(s?.temperatureChangeCPerHour, '°C/hour', 2),
            'Needs two samples at least 5 minutes apart', 'trending-up'),
          present('Relative humidity', !keys.humidity ? 'Not installed' : sensorValue(s?.humidityPercent, '%'), 'Measured near the device', 'droplet'),
          present('Light', !keys.light ? 'Not installed' : sensorValue(s?.lightLux, 'lux'), 'Ambient light level', 'sun'),
          present('Proximity', !keys.proximity ? 'Not installed' : sensorValue(s?.proximityCm, 'cm'), 'Near-sensor proximity, not a rangefinder', 'maximize'),
        ])}
        {section('Motion and orientation', [
          present('Acceleration X / Y / Z', !keys.accelerometer ? 'Not installed' : sensorVector(s?.accelerationMs2, 'm/s²'), 'Includes gravity; device axes', 'move'),
          present('Rotation X / Y / Z', !keys.gyroscope ? 'Not installed' : sensorVector(s?.rotationRadPerSec, 'rad/s'), 'Angular velocity; device axes', 'rotate-cw'),
          present('Magnetic field X / Y / Z', !keys.magneticField ? 'Not installed' : sensorVector(s?.magneticMicroT, 'µT'), 'Affected by nearby metal and magnets', 'compass'),
        ])}
        {section('Battery and connectivity', [
          present('Battery', sensorValue(s?.battery?.percent, '%', 0),
            batteryStatus(s?.battery), 'battery'),
          present('Battery temperature', sensorValue(s?.battery?.batteryTemperatureC, '°C'),
            'Battery temperature is NOT ambient air temperature', 'thermometer'),
          present('Wi-Fi', wifiStatus(s?.wifi), undefined, 'wifi'),
          present('Bluetooth', bluetoothStatus(s?.bluetooth), 'Reading state may need Bluetooth permission', 'bluetooth'),
        ])}
        {s?.bluetooth?.available && !s.bluetooth.permissionGranted && (
          <TouchableOpacity accessibilityRole="button" onPress={() => { void requestBluetooth(); }}
            style={[styles.permission, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>Allow Bluetooth status access</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Optional Android permission. Atlas does not scan nearby devices from this screen.
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity accessibilityRole="button" onPress={() => nav.navigate('Compass')}
          style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="compass" color={colors.primary} size={22} />
          <Text style={[styles.compassLabel, { color: colors.text }]}>Open compass</Text>
          <Icon name="chevron-right" color={colors.textSecondary} size={18} />
        </TouchableOpacity>
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          Sensors are informational, not certified emergency instruments. Some devices lack a barometer or
          ambient-temperature sensor. Battery temperature must not be used as a measure of air temperature.
          New samples are requested only while this page is open and Atlas is in the foreground.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = () => ({
  screen: { flex: 1 },
  header: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, flexDirection: 'row', alignItems: 'center' },
  headerButton: { padding: SPACING.md },
  title: { ...TYPOGRAPHY.h1, flex: 1, marginLeft: SPACING.sm },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, width: '100%', alignSelf: 'center' },
  card: { width: '100%', borderRadius: SPACING.md, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.sm },
  wideCard: { width: '48%' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardLabel: { ...TYPOGRAPHY.bodySmall, flex: 1 },
  reading: { ...TYPOGRAPHY.display, marginTop: SPACING.sm },
  detail: { ...TYPOGRAPHY.meta, marginTop: SPACING.sm },
  section: { marginTop: SPACING.xl },
  sectionTitle: { ...TYPOGRAPHY.h2, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  body: { ...TYPOGRAPHY.bodySmall },
  error: { ...TYPOGRAPHY.body, marginTop: SPACING.md },
  permission: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.lg, marginTop: SPACING.md },
  actionTitle: { ...TYPOGRAPHY.h3 },
  hint: { ...TYPOGRAPHY.bodySmall, marginTop: SPACING.xs },
  action: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.lg, marginTop: SPACING.md,
    flexDirection: 'row', alignItems: 'center' },
  compassLabel: { ...TYPOGRAPHY.h3, marginLeft: SPACING.md, flex: 1 },
  disclaimer: { ...TYPOGRAPHY.meta, marginTop: SPACING.lg },
} as const);
