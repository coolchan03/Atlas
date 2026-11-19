import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { NUDGES, useNudges } from '../atlasTools/nudges';
import { SPACING, TYPOGRAPHY } from '../constants';

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
  card: { borderRadius: SPACING.sm, padding: SPACING.lg, marginBottom: SPACING.lg },
  group: { marginBottom: SPACING.xs },
  h: { ...TYPOGRAPHY.body, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  text: { flex: 1 },
  label: { ...TYPOGRAPHY.body },
  hint: { ...TYPOGRAPHY.bodySmall, marginTop: SPACING.xs / 2 },
});
