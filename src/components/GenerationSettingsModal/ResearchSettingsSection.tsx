import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';

export type ResearchDepth = 'quick' | 'deep';

interface ResearchSettingsSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  depth: ResearchDepth;
  onDepthChange: (depth: ResearchDepth) => void;
  busy?: boolean;
  status?: string | null;
}

/** Research options belong in Chat Settings, not in the conversation header. */
export const ResearchSettingsSection: React.FC<ResearchSettingsSectionProps> = ({
  enabled, onEnabledChange, depth, onDepthChange, busy = false, status,
}) => {
  const { colors } = useTheme();
  return (
    <View testID="research-settings-section" style={[styles.section, { borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: colors.surfaceLight }]}>
          <Icon name="book-open" size={19} color={colors.primary} />
        </View>
        <View style={styles.description}>
          <Text style={[styles.title, { color: colors.text }]}>Deep Research</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Search the web and prepare a source-cited report.
          </Text>
        </View>
        <Switch
          testID="deep-research-toggle"
          accessibilityLabel="Enable Deep Research for this chat"
          accessibilityRole="switch"
          value={enabled}
          disabled={busy}
          onValueChange={onEnabledChange}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      {enabled && (
        <View style={styles.depthContainer}>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>Research depth</Text>
          <View style={styles.depthButtons}>
            {(['quick', 'deep'] as const).map(option => {
              const chosen = depth === option;
              return (
                <TouchableOpacity key={option}
                  testID={`research-depth-${option}`}
                  accessibilityRole="button"
                  accessibilityLabel={option === 'quick' ? 'Quick research, one search' : 'Deep research, three searches'}
                  accessibilityState={{ selected: chosen, disabled: busy }}
                  disabled={busy}
                  onPress={() => onDepthChange(option)}
                  style={[styles.depthButton, {
                    borderColor: chosen ? colors.primary : colors.border,
                    backgroundColor: chosen ? colors.surfaceLight : colors.surface,
                  }]}>
                  <Icon name={option === 'quick' ? 'zap' : 'book-open'} size={14}
                    color={chosen ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.optionText, { color: chosen ? colors.primary : colors.text }]}>
                    {option === 'quick' ? 'Quick (1 search)' : 'Deep (3 searches)'}
                  </Text>
                  {chosen && <Icon name="check" size={13} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
          {busy && <Text style={[styles.hint, { color: colors.textMuted }]}>
            Research settings are locked while a response is running.
          </Text>}
          {!!status && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.primary }]}>{status}</Text>}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { paddingVertical: 12, marginVertical: 5, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  description: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  depthContainer: { paddingTop: 13, paddingLeft: 2, gap: 8 },
  caption: { fontSize: 12, fontWeight: '600' },
  depthButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  depthButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 9, minHeight: 40,
  },
  optionText: { fontSize: 12, fontWeight: '600' },
});
