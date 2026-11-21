import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { describePlace } from '../../atlasMaps/whereAmI';
import { DIAL_INK } from './CompassDial';
import type { Units } from '../../atlasTools/units';

const INK_FAINT = '#6B6B6B';

/** The big heading, its direction name, the nearest city and the elevation, laid out like the old iOS compass. */
export const Readout: React.FC<{
  heading: number | null; name: string; ink: string; units: Units;
  fix: { lat: number; lon: number; altitude: number } | null;
}> = ({ heading, name, ink, units, fix }) => {
  const city = fix ? describePlace(fix.lat, fix.lon)?.nearest.city.name : undefined;
  const altitude = fix && fix.altitude > -99999 ? fix.altitude : null;
  let elevation = '';
  if (altitude !== null) elevation = units.imperial ? `${Math.round(altitude * 3.28084)} ft Elevation` : `${Math.round(altitude)} m Elevation`;
  return (
    <>
      <View style={styles.readout}>
        <Text style={[styles.degrees, { color: ink }]}>{heading === null ? '--' : `${Math.round(heading)}°`}</Text>
        <View style={styles.side}>
          <Text style={[styles.cardinal, { color: ink }]}>{heading === null ? 'Starting...' : name}</Text>
          {!!city && <Text style={[styles.place, { color: ink }]}>{city}</Text>}
        </View>
      </View>
      {!!elevation && <Text style={[styles.elevation, { color: ink }]}>{elevation}</Text>}
    </>
  );
};

/** The two page dots: tap one to show the compass or the level. */
export const PageDots: React.FC<{ levelMode: boolean; ink: string; onPick: (level: boolean) => void }> = ({ levelMode, ink, onPick }) => (
  <View style={styles.dots}>
    {[false, true].map((isLevel) => (
      <TouchableOpacity key={String(isLevel)} onPress={() => onPick(isLevel)} accessibilityLabel={isLevel ? 'Show the level' : 'Show the compass'} hitSlop={10}>
        <View style={[styles.dot, { backgroundColor: levelMode === isLevel ? ink : INK_FAINT }]} />
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  readout: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  degrees: { color: DIAL_INK, fontSize: 84, fontWeight: '200' },
  side: { marginLeft: 10, flexShrink: 1 },
  cardinal: { fontSize: 20, fontWeight: '400' },
  place: { fontSize: 18, fontWeight: '300' },
  elevation: { fontSize: 20, fontWeight: '300', marginTop: 18 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 16 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
