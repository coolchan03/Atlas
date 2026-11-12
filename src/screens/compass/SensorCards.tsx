import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CompassSensors } from './useCompassSensors';
import { fmtTemp, useUnits } from '../../atlasTools/units';

interface Card { label: string; value: string; detail?: string }

/** Small read-outs for the motion, pressure and battery-temperature sensors that report. */
export const SensorCards: React.FC<{
  colors: { surface: string; border: string; text: string; textSecondary: string };
  sensors: Pick<CompassSensors, 'accel' | 'orientation' | 'pressure' | 'batteryTemp'>;
}> = ({ colors, sensors: { accel, orientation, pressure, batteryTemp } }) => {
  const units = useUnits();
  const cards: Card[] = [];
  if (accel) cards.push({ label: 'ACCELEROMETER', value: `${accel.g.toFixed(2)} g`, detail: `x ${accel.x.toFixed(1)}  y ${accel.y.toFixed(1)}  z ${accel.z.toFixed(1)}` });
  if (orientation) cards.push({ label: 'ORIENTATION', value: `Pitch ${orientation.pitch.toFixed(1)}°`, detail: `Roll ${orientation.roll.toFixed(1)}°` });
  if (pressure) cards.push({ label: 'PRESSURE / ALT', value: `${pressure.hpa.toFixed(1)} hPa`, detail: `${pressure.altM >= 0 ? '+' : ''}${Math.round(pressure.altM)} m est.` });
  if (batteryTemp !== null) cards.push({ label: 'BATTERY TEMP', value: fmtTemp(batteryTemp, units.temp) });
  if (!cards.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {cards.map((c) => (
          <View key={c.label} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{c.label}</Text>
            <Text style={[styles.value, { color: colors.text }]}>{c.value}</Text>
            {c.detail ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{c.detail}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 16, paddingHorizontal: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  card: { padding: 12, borderRadius: 10, borderWidth: 1, minWidth: 136, alignItems: 'center' },
  label: { fontSize: 11 },
  value: { fontSize: 18, fontWeight: '400', marginTop: 4 },
  detail: { fontSize: 11, marginTop: 2 },
});
