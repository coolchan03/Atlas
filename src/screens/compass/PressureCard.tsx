import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fmtDistance } from '../../atlasMaps/maps';
import { usePressureLog } from '../../atlasTools/pressureLog';
import { pressureTrend } from '../../atlasTools/pressureTrend';
import type { Units } from '../../atlasTools/units';

const INK = '#FFFFFF';
const INK_DIM = '#9A9A9A';
const BORDER = '#333333';

interface Props {
  pressure: { hpa: number; altM: number } | null;
  /** GPS height in metres and its accuracy, when there is a fix. */
  gps: { altitude: number; accuracy: number } | null;
  units: Units;
  ink?: string;
  now?: number;
}

/** Height two ways, from GPS and from air pressure, and how the pressure has been moving. Weather moves one and not the other. */
export const PressureCard: React.FC<Props> = ({ pressure, gps, units, ink = INK, now = Date.now() }) => {
  const samples = usePressureLog((s) => s.samples);
  const record = usePressureLog((s) => s.record);
  const gpsM = gps && gps.altitude > -99999 ? gps.altitude : undefined;
  useEffect(() => { if (pressure) record({ at: Date.now(), hpa: pressure.hpa, gpsM }); }, [pressure?.hpa, gpsM]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pressure) return null;
  const trend = pressureTrend(samples, now);
  const gap = gpsM === undefined ? null : Math.abs(pressure.altM - gpsM);
  return (
    <View style={styles.card} testID="pressure-card">
      <Text style={[styles.title, { color: ink }]}>Height two ways</Text>
      <Text style={[styles.row, { color: ink }]}>GPS: {gpsM === undefined ? 'no fix yet' : fmtDistance(gpsM, units.imperial)}</Text>
      <Text style={[styles.row, { color: ink }]}>Air pressure: {fmtDistance(pressure.altM, units.imperial)} ({pressure.hpa.toFixed(1)} hPa)</Text>
      {gap !== null && gap > 30 && (
        <Text style={styles.note}>They differ by {fmtDistance(gap, units.imperial)}. Weather moves the pressure reading, and GPS height is rougher than its latitude and longitude. A slow drift in the gap over hours is the weather.</Text>
      )}
      {trend ? (
        <>
          <Text style={[styles.row, { color: ink }]} testID="pressure-trend">Pressure is {trend.label}: {trend.change3h >= 0 ? '+' : ''}{trend.change3h.toFixed(1)} hPa over 3 hours{trend.adjusted ? ' (your own climbing is taken out)' : ''}.</Text>
          {!!trend.hint && <Text style={[styles.hint, { color: ink }]} testID="pressure-hint">{trend.hint}</Text>}
        </>
      ) : (
        <Text style={styles.note} testID="pressure-no-trend">Keep this screen open or come back over the next hours. Atlas notes the pressure here every 10 minutes while it is open and shows the trend after about 45 minutes. It does not read pressure in the background.</Text>
      )}
      <Text style={styles.note}>A guide, not a forecast.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, marginTop: 16, gap: 4 },
  title: { fontSize: 16, fontWeight: '400' },
  row: { fontSize: 15 },
  hint: { fontSize: 15, fontWeight: '400' },
  note: { color: INK_DIM, fontSize: 12 },
});
