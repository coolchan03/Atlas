import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, useWindowDimensions, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useEmergencyColors } from '../atlasTools/offGrid';

type Vector = { x: number; y: number; z: number };
export interface SensorSnapshot {
  sampledAt: number;
  wifi?: { available: boolean; enabled: boolean; connected: boolean };
  bluetooth?: { available: boolean; enabled?: boolean; permissionGranted: boolean };
  sensors?: Record<string, boolean>;
  battery?: { percent?: number; charging?: boolean; batteryTemperatureC?: number };
  pressureHpa?: number; pressureChangeHpaPerHour?: number;
  ambientTemperatureC?: number; temperatureChangeCPerHour?: number;
  humidityPercent?: number; lightLux?: number; proximityCm?: number;
  accelerationMs2?: Vector; rotationRadPerSec?: Vector; magneticMicroT?: Vector;
}

export function sensorValue(value: number | undefined, unit: string, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) + ' ' + unit : 'No reading';
}
export function sensorVector(v: Vector | undefined, unit: string): string {
  return v && [v.x, v.y, v.z].every(n => Number.isFinite(n))
    ? [v.x, v.y, v.z].map(n => n.toFixed(2)).join(' / ') + ' ' + unit : 'No reading';
}
export function availability(snapshot: SensorSnapshot, key: string, field: number | undefined, unit: string): string {
  if (!snapshot.sensors?.[key]) return 'Not installed';
  return sensorValue(field, unit);
}

export const SensorToolkitScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const { width } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<SensorSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const active = useRef(false);
  const busy = useRef(false);
  const read = useCallback(async () => {
    if (busy.current) return;
    const native = NativeModules.AtlasEnvironment;
    if (!native?.snapshot) { setError('Environmental sensor module is unavailable in this APK.'); return; }
    busy.current = true;
    setLoading(true);
    try {
      const result: SensorSnapshot = await native.snapshot();
      if (active.current) { setSnapshot(result); setError(''); }
    } catch (err) {
      if (active.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy.current = false;
      if (active.current) setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    active.current = true;
    void read();
    const interval = setInterval(() => { void read(); }, 12000);
    return () => { active.current = false; clearInterval(interval); };
  }, [read]));

  const requestBluetooth = async () => {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return;
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      if (result === PermissionsAndroid.RESULTS.GRANTED) { setError(''); await read(); }
      else setError('Bluetooth permission was declined. Other sensor readings remain available.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bluetooth permission could not be requested.');
    }
  };

  const present = (label: string, value: string, detail?: string, icon = 'activity') => (
    <View key={label} accessibilityLabel={label + ': ' + value}
      style={{ width: width >= 720 ? '48%' : '100%', backgroundColor: colors.surface,
        borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} color={colors.primary} size={18} />
        <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 23, color: colors.text, fontWeight: '700', marginTop: 9 }}>{value}</Text>
      {!!detail && <Text style={{ color: colors.textMuted, marginTop: 7, fontSize: 12 }}>{detail}</Text>}
    </View>
  );
  const section = (title: string, items: React.ReactNode[]) => (
    <View style={{ marginTop: 20 }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, marginBottom: 10 }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>{items}</View>
    </View>
  );
  const s = snapshot;
  const keys = s?.sensors || {};
  const pressure = s ? availability(s, 'pressure', s.pressureHpa, 'hPa') : 'Waiting for sample';
  const temperature = s ? availability(s, 'ambientTemperature', s.ambientTemperatureC, '°C') : 'Waiting for sample';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => nav.goBack()} style={{ padding: 9 }}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: '800', flex: 1, marginLeft: 6 }}>Sensor toolkit</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh sensor readings"
          onPress={() => { void read(); }} style={{ padding: 10 }} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.primary} /> : <Icon name="refresh-cw" size={20} color={colors.primary} />}
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 50, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
          Live on-device readings · refreshes about every 12 seconds while open · works without internet
        </Text>
        {s?.sampledAt ? <Text style={{ color: colors.textMuted, marginTop: 7, fontSize: 12 }}>Last sample: {new Date(s.sampledAt).toLocaleTimeString()}</Text> : null}
        {!!error && <Text style={{ color: colors.error || '#B91C1C', marginTop: 10 }}>{error}</Text>}
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
            s?.battery ? s.battery.charging ? 'Charging' : 'On battery' : 'No reading', 'battery'),
          present('Battery temperature', sensorValue(s?.battery?.batteryTemperatureC, '°C'),
            'Battery temperature is NOT ambient air temperature', 'thermometer'),
          present('Wi-Fi', !s?.wifi?.available ? 'Not available' : s.wifi.connected ? 'Connected' : s.wifi.enabled ? 'On, not connected' : 'Off', undefined, 'wifi'),
          present('Bluetooth', !s?.bluetooth?.available ? 'Not available' : !s.bluetooth.permissionGranted ? 'Permission needed' :
            s.bluetooth.enabled ? 'On' : 'Off', 'Reading state may need Bluetooth permission', 'bluetooth'),
        ])}
        {s?.bluetooth?.available && !s.bluetooth.permissionGranted && (
          <TouchableOpacity accessibilityRole="button" onPress={() => { void requestBluetooth(); }}
            style={{ backgroundColor: colors.surface, borderColor: colors.primary,
              borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Allow Bluetooth status access</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
              Optional Android permission. Atlas does not scan nearby devices from this screen.
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity accessibilityRole="button" onPress={() => nav.navigate('Compass')}
          style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, padding: 16,
            borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Icon name="compass" color={colors.primary} size={22} />
          <Text style={{ color: colors.text, fontWeight: '600', marginLeft: 12, flex: 1 }}>Open compass</Text>
          <Icon name="chevron-right" color={colors.textSecondary} size={18} />
        </TouchableOpacity>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 16 }}>
          Sensors are informational, not certified emergency instruments. Some devices lack a barometer or
          ambient-temperature sensor. Battery temperature must not be used as a measure of air temperature.
          Values are collected only while this page is open.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
