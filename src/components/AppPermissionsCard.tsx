import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

/** Every dangerous permission explicitly declared in android/app/src/main/AndroidManifest.xml. */
export const ASSISTANT_PERMISSIONS = [
  { id: 'microphone', name: 'Microphone', permission: 'android.permission.RECORD_AUDIO', hint: 'Voice calls, recording and local voice cloning', minApi: 1 },
  { id: 'camera', name: 'Camera', permission: 'android.permission.CAMERA', hint: 'QR pairing, photography and scanning', minApi: 1 },
  { id: 'location', name: 'Precise location', permission: 'android.permission.ACCESS_FINE_LOCATION', hint: 'Offline maps, GPS and local assistance', minApi: 1 },
  { id: 'approx-location', name: 'Approximate location', permission: 'android.permission.ACCESS_COARSE_LOCATION', hint: 'Location without GPS precision', minApi: 1 },
  { id: 'calendar-read', name: 'Read calendar', permission: 'android.permission.READ_CALENDAR', hint: 'Your plans and flights, used in the daily briefing', minApi: 1 },
  { id: 'calendar-write', name: 'Create calendar events', permission: 'android.permission.WRITE_CALENDAR', hint: 'Save events with your approval', minApi: 1 },
  { id: 'activity', name: 'Physical activity', permission: 'android.permission.ACTIVITY_RECOGNITION', hint: 'Step counter and movement tools', minApi: 29 },
  { id: 'notifications', name: 'Notifications', permission: 'android.permission.POST_NOTIFICATIONS', hint: 'Download progress, scheduled tasks and alerts', minApi: 33 },
] as const;

/** Android handles these as special/app-level permissions, not a normal prompt. */
const SPECIAL_PERMISSIONS = [
  ['Background activity', 'Battery optimization and long-running tasks'],
  ['Install updates', 'Android prompts you before installing downloaded APK updates'],
  ['Network and nearby devices', 'Internet, Wi-Fi state and local connectivity'],
  ['Storage access', 'All-files access is controlled above; picked documents can be used without it'],
] as const;

export function permissionRelevant(minApi: number, api: number): boolean { return api >= minApi; }

/** One overview for every permission Atlas asks for. It does not silently grant capabilities to agents. */
export function AppPermissionsCard() {
  const { colors } = useTheme();
  const android = Platform.OS === 'android';
  const api = typeof Platform.Version === 'number' ? Platform.Version : 0;
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const refresh = useCallback(async () => {
    if (!android) return;
    const entries = await Promise.all(ASSISTANT_PERMISSIONS.filter((p) => permissionRelevant(p.minApi, api))
      .map(async (p) => [p.id, await PermissionsAndroid.check(p.permission as any).catch(() => false)] as const));
    setAllowed(Object.fromEntries(entries));
  }, [android, api]);
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);
  const request = async (permission: string) => {
    if (!android) return;
    try {
      const result = await PermissionsAndroid.request(permission as any);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) Alert.alert('Permission not granted', 'You can review this in Android app settings.');
    } catch (e: any) { Alert.alert('Permission unavailable', String(e?.message || e)); }
    await refresh();
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="assistant-permission-inventory">
      <Text style={[styles.heading, { color: colors.text }]}>Device permissions</Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>Permissions granted to the app, not automatic permission for an AI agent to take actions. Tools still follow their separate consent settings.</Text>
      {!android && <Text style={{ color: colors.textSecondary }}>Review device permissions in your phone's system settings.</Text>}
      {android && ASSISTANT_PERMISSIONS.filter((p) => permissionRelevant(p.minApi, api)).map((p) => (
        <View key={p.id} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={styles.flex}>
            <Text style={{ color: colors.text }}>{p.name}</Text>
            <Text style={[styles.desc, { color: colors.textSecondary }]}>{p.hint}</Text>
          </View>
          {allowed[p.id] ? <Text style={{ color: colors.primary }}>Allowed</Text> : (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Allow ${p.name}`} onPress={() => request(p.permission)} style={[styles.button, { borderColor: colors.primary }]}>
              <Text style={{ color: colors.primary }}>Allow</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      <Text style={[styles.subheading, { color: colors.text }]}>Special system access</Text>
      {SPECIAL_PERMISSIONS.map(([name, hint]) => (
        <View key={name} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={styles.flex}><Text style={{ color: colors.text }}>{name}</Text><Text style={[styles.desc, { color: colors.textSecondary }]}>{hint}</Text></View>
          <TouchableOpacity accessibilityRole="button" onPress={() => Linking.openSettings().catch(() => undefined)}><Text style={{ color: colors.primary }}>Settings</Text></TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  heading: { fontWeight: '600', fontSize: 15 },
  subheading: { fontWeight: '600', marginTop: 14 },
  desc: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  row: { borderTopWidth: 1, paddingVertical: 11, flexDirection: 'row', gap: 10, alignItems: 'center' },
  flex: { flex: 1 },
  button: { borderWidth: 1, borderRadius: 8, padding: 8 },
});
