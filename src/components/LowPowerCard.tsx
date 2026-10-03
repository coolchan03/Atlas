import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { useLowPower, checkBatteryNow } from '../atlasTools/lowPower';
import { ModelChips } from './ModelChips';

/** Settings card for low-battery mode. */
export function LowPowerCard() {
  const { colors } = useTheme();
  const s = useLowPower();
  return (
    <View style={[st.card, { backgroundColor: colors.surface }]}>
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h, { color: colors.text }]}>Low-battery mode</Text>
          <Text style={[st.p, { color: colors.textSecondary }]}>
            Below {s.threshold}% (not charging): smaller model, short answers, hands-free off.
            {s.battery !== null ? `  Battery now: ${s.battery}%${s.charging ? ' (charging)' : ''}.` : ''}
            {s.enabled && s.active ? '  ACTIVE NOW.' : ''}
          </Text>
        </View>
        <Switch value={s.enabled} onValueChange={(v) => { s.set({ enabled: v }); setTimeout(() => checkBatteryNow(), 100); }} />
      </View>
      {s.enabled && (
        <>
          <Text style={[st.label, { color: colors.textSecondary }]}>Turn on at</Text>
          <View style={st.row}>
            {[10, 15, 20, 30, 40].map((n) => (
              <TouchableOpacity key={n} onPress={() => s.set({ threshold: n })} style={[st.pill, { backgroundColor: s.threshold === n ? colors.primary : colors.background }]}>
                <Text style={{ color: s.threshold === n ? '#fff' : colors.text }}>{n}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[st.label, { color: colors.textSecondary }]}>Answer length limit</Text>
          <View style={st.row}>
            {[128, 256, 512].map((n) => (
              <TouchableOpacity key={n} onPress={() => s.set({ maxTokens: n })} style={[st.pill, { backgroundColor: s.maxTokens === n ? colors.primary : colors.background }]}>
                <Text style={{ color: s.maxTokens === n ? '#fff' : colors.text }}>{n} tokens</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[st.label, { color: colors.textSecondary }]}>Switch to this smaller model</Text>
          <ModelChips value={s.modelId} onChange={(id) => s.set({ modelId: id })} colors={colors} emptyLabel="Don't switch" />
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  h: { fontSize: 15, fontWeight: '600' },
  p: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  label: { fontSize: 12, marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
});
