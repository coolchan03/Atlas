import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme';
import { listAtlasPacks, installAtlasPack, AtlasPack } from '../atlasTools/atlasPacks';

const KEY = 'atlas-installed-packs';
const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

/** Download the Atlas library (subject packs) into the "Atlas - Library" project. */
export function AtlasPacksSection() {
  const { colors } = useTheme();
  const [packs, setPacks] = useState<AtlasPack[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<{ name: string; msg: string } | null>(null);

  const load = async () => {
    setErr(null);
    try { setPacks(await listAtlasPacks()); } catch (e: any) { setErr(String(e?.message || e)); }
  };
  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((v) => { if (v) setInstalled(JSON.parse(v)); }).catch(() => undefined);
    void load();
  }, []);

  const install = async (p: AtlasPack) => {
    setBusy({ name: p.name, msg: 'Starting...' });
    try {
      const r = await installAtlasPack(p, (msg) => setBusy({ name: p.name, msg }));
      const next = { ...installed, [p.name]: p.updated };
      setInstalled(next);
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      Alert.alert('Pack added', `${r.added} added, ${r.skipped} already there${r.failed.length ? `, ${r.failed.length} could not be added` : ''}. Chat in the "Atlas - Library" project (Atlas agent) or use Study there.`);
    } catch (e: any) {
      Alert.alert('Could not add the pack', String(e?.message || e));
    } finally { setBusy(null); }
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Atlas library</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 6 }}>
        The Atlas books (medicine, survival, power, farming, rebuilding...) as text, for the AI to search offline. Each subject is a separate download into the "Atlas - Library" project. Use Wi-Fi.
      </Text>
      {err && <Text style={{ color: colors.error, fontSize: 13 }}>{err} <Text style={{ color: colors.primary }} onPress={load}>Retry</Text></Text>}
      {packs === null && !err && <ActivityIndicator color={colors.primary} />}
      {packs?.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 13 }}>No packs published yet. They are being built on GitHub - check back later.</Text>}
      {packs?.map((p) => {
        const isBusy = busy?.name === p.name;
        const have = installed[p.name];
        const outdated = have && have !== p.updated;
        return (
          <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{p.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{mb(p.size)}{isBusy ? ` · ${busy?.msg}` : ''}</Text>
            </View>
            {isBusy ? <ActivityIndicator color={colors.primary} /> : have && !outdated ? (
              <Text style={{ color: colors.primary }}>Added ✓</Text>
            ) : (
              <TouchableOpacity disabled={!!busy} onPress={() => install(p)} style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: colors.primary }}>{outdated ? 'Update' : 'Get'}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}
