import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { NUDGES, useNudges } from '../atlasTools/nudges';

/** Settings card: a switch for every reminder, tip, notice and extra briefing line. */
export function NudgesCard() {
  const { colors } = useTheme();
  const flags = useNudges();
  const groups = [...new Set(NUDGES.map((n) => n.group))];
  return (
    <View style={[st.card, { backgroundColor: colors.surface }]} testID="nudges-card">
      {groups.map((group) => (
        <View key={group} style={st.group}>
          <Text style={[st.h, { color: colors.text }]}>{group}</Text>
          {NUDGES.filter((n) => n.group === group).map((n) => (
            <View key={n.id} style={st.row}>
              <View style={st.text}>
                <Text style={[st.label, { color: colors.text }]}>{n.label}</Text>
                <Text style={[st.hint, { color: colors.textSecondary }]}>{n.hint}</Text>
              </View>
              <Switch value={flags[n.id]} onValueChange={(on) => flags.setNudge(n.id, on)} accessibilityLabel={n.label} testID={`nudge-${n.id}`} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginBottom: 14 },
  group: { marginBottom: 6 },
  h: { fontSize: 15, fontWeight: '400', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  text: { flex: 1 },
  label: { fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
