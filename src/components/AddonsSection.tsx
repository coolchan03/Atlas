import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { ADDONS, Addon, useAddonDownloads, downloadAddon, cancelAddon, deleteAddon, installedAddonPath, resolveAddon } from '../atlasTools/addons';

/** Optional add-on packs (Kiwix) you can download inside the app. */
export function AddonsSection() {
  const { colors } = useTheme();
  const progress = useAddonDownloads((s) => s.progress);
  const resolved = useAddonDownloads((s) => s.resolved);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const refresh = async () => {
    const out: Record<string, boolean> = {};
    for (const a of ADDONS) out[a.id] = !!(await installedAddonPath(a).catch(() => null));
    setInstalled(out);
  };
  useEffect(() => { refresh(); }, [Object.keys(progress).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const get = async (a: Addon) => {
    try {
      const r = await resolveAddon(a);
      Alert.alert(`Download ${a.name}?`, `${r.file}\nSize: ${r.size || a.approx}\nUse Wi-Fi. You can keep using the app while it downloads (keep the app open).`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => downloadAddon(a).then(refresh).catch((e) => { if (!/abort|stop|cancel/i.test(String(e?.message))) Alert.alert('Download failed', String(e?.message || e)); refresh(); }) },
      ]);
    } catch (e: any) {
      Alert.alert('Could not reach the Kiwix server', String(e?.message || e));
    }
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Add-ons to download</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 6 }}>
        Optional offline encyclopedias. Nothing is downloaded unless you choose it. Stored in this app's folder (deleted if you uninstall the app).
      </Text>
      {ADDONS.map((a) => {
        const p = progress[a.id];
        const busy = p !== undefined;
        return (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{a.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{a.what} · {resolved[a.id]?.size || a.approx}</Text>
              {busy && (
                <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 6 }}>
                  <View style={{ height: 4, width: `${Math.round((p || 0) * 100)}%`, backgroundColor: colors.primary, borderRadius: 2 }} />
                </View>
              )}
            </View>
            {busy ? (
              <TouchableOpacity onPress={() => cancelAddon(a)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ color: colors.textSecondary, marginLeft: 6 }}>{Math.round((p || 0) * 100)}% · Stop</Text>
              </TouchableOpacity>
            ) : installed[a.id] ? (
              <TouchableOpacity onPress={() => Alert.alert('Remove add-on?', a.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => deleteAddon(a).then(refresh) }])}>
                <Text style={{ color: colors.primary }}>Installed ✓</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => get(a)} style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: colors.primary }}>Get</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}
