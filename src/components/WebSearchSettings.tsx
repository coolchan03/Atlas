import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { PROVIDERS, useSearchSettings, searchWeb } from '../services/tools/webSearchProviders';

/** Tools screen: pick the web search provider and enter its address / key, with a test button. */
export function WebSearchSettings() {
  const { colors } = useTheme();
  const s = useSearchSettings();
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = PROVIDERS.find((p) => p.id === s.provider)!;

  const runTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      const r = await searchWeb('water purification boiling time', async () => []);
      setTest(r.results.length
        ? `Working - ${r.results.length} results from ${r.provider}${r.provider !== s.provider ? ` (your choice failed: ${r.notes.join('; ')})` : ''}.\nFirst: ${r.results[0].title}`
        : `No results. ${r.notes.join('; ')}`);
    } catch (e: any) {
      setTest(`Failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[st.card, { backgroundColor: colors.surface }]}>
      <Text style={[st.h, { color: colors.text }]}>Web search provider</Text>
      <Text style={[st.p, { color: colors.textSecondary }]}>Used by the Web search tool. If your choice fails, the built-in metasearch, then DuckDuckGo, then Brave are tried.</Text>
      <View style={st.wrap}>
        {PROVIDERS.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => s.setProvider(p.id)} style={[st.pill, { backgroundColor: p.id === s.provider ? colors.primary : colors.background }]}>
            <Text style={{ color: p.id === s.provider ? '#fff' : colors.text, fontSize: 13 }}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[st.p, { color: colors.textSecondary, marginTop: 8 }]}>{current.note}</Text>
      {current.needs === 'url' && (
        <TextInput
          style={[st.input, { color: colors.text, backgroundColor: colors.background }]}
          value={s.searxngUrl}
          onChangeText={s.setSearxngUrl}
          placeholder="https://search.example.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      )}
      {current.needs === 'key' && (
        <TextInput
          style={[st.input, { color: colors.text, backgroundColor: colors.background }]}
          value={s.keys[current.id] || ''}
          onChangeText={(k) => s.setKey(current.id, k)}
          placeholder="API key"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      )}
      <View style={st.row}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Results per search</Text>
        {[3, 5, 8].map((n) => (
          <TouchableOpacity key={n} onPress={() => s.setResults(n)} style={[st.small, { backgroundColor: s.results === n ? colors.primary : colors.background }]}>
            <Text style={{ color: s.results === n ? '#fff' : colors.text }}>{n}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={runTest} style={[st.test, { borderColor: colors.primary }]} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: colors.primary }}>Test</Text>}
        </TouchableOpacity>
      </View>
      {!!test && <Text style={[st.p, { color: colors.textSecondary, marginTop: 8 }]}>{test}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginBottom: 14 },
  h: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  p: { fontSize: 13, lineHeight: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  input: { borderRadius: 8, padding: 10, marginTop: 10, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  small: { width: 34, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  test: { marginLeft: 'auto', borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
});
