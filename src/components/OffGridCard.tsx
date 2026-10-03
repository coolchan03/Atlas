import React from 'react';
import { Switch, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useOffGrid } from '../atlasTools/offGrid';

/** Home: one switch for emergency / off-grid use. */
export function OffGridCard() {
  const { colors } = useTheme();
  const on = useOffGrid((s) => s.on);
  const setOn = useOffGrid((s) => s.setOn);
  const night = useOffGrid((s) => s.nightRed);
  const setNight = useOffGrid((s) => s.setNightRed);
  return (
    <View style={{ backgroundColor: on ? '#3A0A0A' : colors.surface, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: on ? '#FFB4B4' : colors.text, fontSize: 16, fontWeight: '700' }}>Off-grid mode {on ? '· ON' : ''}</Text>
          <Text style={{ color: on ? '#E89A9A' : colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
            Atlas agent on, no internet tools, low-battery mode on. Everything still works offline.
          </Text>
        </View>
        <Switch value={on} onValueChange={setOn} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <Text style={{ flex: 1, color: on ? '#E89A9A' : colors.textSecondary, fontSize: 13 }}>Red night screens (protects night vision, saves battery)</Text>
        <Switch value={night} onValueChange={setNight} />
      </View>
    </View>
  );
}
