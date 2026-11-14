import React, { useEffect, useState } from 'react';
import { NativeModules, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { SENSOR_INFO, NEEDS_PERMISSION, labelOf, metaOf, groupSensors, axisBars } from './sensorCatalog';
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

/** A small dot that is filled while the sensor is reporting. */
const Live: React.FC<{ on: boolean; colors: { primary: string; border: string } }> = ({ on, colors }) => {
  const fill = on ? colors.primary : colors.border;
  return <View accessibilityLabel={on ? 'Live' : 'No reading yet'} style={[styles.dot, { backgroundColor: fill, borderColor: fill }]} />;
};

/** One axis of an x/y/z reading: a centred bar that grows to the left for negative values and to the right for positive ones. */
const AxisBar: React.FC<{ axis: string; fraction: number; colors: { primary: string; border: string; textMuted: string } }> = ({ axis, fraction, colors }) => {
  const reach = Math.abs(fraction) * 50;
  const left: `${number}%` = `${fraction >= 0 ? 50 : 50 - reach}%`;
  const width: `${number}%` = `${reach}%`;
  return (
    <View style={styles.axisRow}>
      <Text style={[styles.axisName, { color: colors.textMuted }]}>{axis}</Text>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill2, { backgroundColor: colors.primary, width, left }]} />
      </View>
    </View>
  );
};

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

        <View style={styles.tools}>
          {TOOLS.map((t) => (
            <TouchableOpacity key={t.to} onPress={() => navigation.navigate(t.to)} style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel={t.label} testID={`sensor-tool-${t.to}`}>
              <Icon name={t.icon} size={20} color={colors.primary} />
              <Text style={[styles.tileText, { color: colors.text }]} numberOfLines={2}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.section, { color: colors.textMuted }]}>POSITION</Text>
        <Card style={styles.card} testID="sensor-gps">
          <View style={styles.head}><Icon name="map-pin" size={16} color={colors.primary} /><Text style={[styles.title, { color: colors.text }]}>GPS</Text><Live on={!!fix} colors={colors} /></View>
          {fix ? (
            <>
              <Text style={[styles.reading, { color: colors.text }]}>{fmtCoord(fix.lat, fix.lon)}</Text>
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
            <View style={styles.head}><Icon name="battery-charging" size={16} color={colors.primary} /><Text style={[styles.title, { color: colors.text }]}>Battery temperature</Text></View>
            <Text style={[styles.reading, { color: colors.text }]}>{fmtTemp(batteryTemp, units.temp)}</Text>
          </Card>
        )}

        {!available && <Text style={[styles.note, { color: colors.textSecondary }]} testID="sensors-unavailable">This build cannot list the phone's sensors. Update Atlas to see them.</Text>}
        {groupSensors(sensors).map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={[styles.section, { color: colors.textMuted }]}>{group.label.toUpperCase()}</Text>
            {group.sensors.map((s) => {
              const info = SENSOR_INFO[s.type];
              const value = values[s.type];
              const bars = axisBars(s.type, value);
              const waiting = silent.includes(s.type) ? (NEEDS_PERMISSION.has(s.type) ? 'Needs a permission Atlas does not ask for here' : 'No reading (permission needed or the phone does not report it)') : 'Waiting for a reading...';
              return (
                <Card key={s.type} style={styles.card} testID={`sensor-${s.type}`}>
                  <View style={styles.head}>
                    <Icon name={metaOf(s.type).icon} size={16} color={colors.primary} />
                    <Text style={[styles.title, { color: colors.text }]}>{labelOf(s)}</Text>
                    <Live on={!!value} colors={colors} />
                  </View>
                  <Text style={[styles.reading, { color: value ? colors.text : colors.textSecondary }]} testID={`sensor-value-${s.type}`}>{value && info ? info.show(value, units) : value ? value.map((n) => n.toFixed(2)).join('  ') : waiting}</Text>
                  {bars && bars.map((b) => <AxisBar key={b.axis} axis={b.axis} fraction={b.fraction} colors={colors} />)}
                  <Text style={[styles.meta, { color: colors.textMuted }]}>{info?.hint ? `${info.hint}. ` : ''}{s.name}{s.vendor ? `, ${s.vendor}` : ''}</Text>
                </Card>
              );
            })}
          </View>
        ))}
        {missing.length > 0 && (
          <Text style={[styles.note, { color: colors.textSecondary }]} testID="sensors-missing">Not found on this phone: {missing.map((t) => SENSOR_INFO[t].label).join(', ')}.</Text>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: 80, gap: SPACING.sm },
  note: { ...TYPOGRAPHY.bodySmall },
  card: { marginBottom: SPACING.xs },
  group: { gap: SPACING.xs },
  section: { ...TYPOGRAPHY.label, letterSpacing: 1.2, marginTop: SPACING.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  title: { ...TYPOGRAPHY.h3, fontWeight: '400', flex: 1 },
  reading: { ...TYPOGRAPHY.body, fontSize: 18, fontWeight: '400', letterSpacing: 0.2, marginBottom: 2 },
  meta: { ...TYPOGRAPHY.bodySmall, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 64, borderWidth: 1, borderRadius: 8, padding: SPACING.md, gap: SPACING.xs, justifyContent: 'space-between' },
  tileText: { ...TYPOGRAPHY.bodySmall },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 3 },
  axisName: { ...TYPOGRAPHY.meta, width: 12 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill2: { position: 'absolute', top: 0, bottom: 0 },
});
