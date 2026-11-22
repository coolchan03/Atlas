import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { MarkdownText } from '../components/MarkdownText';
import { ReadingContext } from '../theme/globalText';
import { tint } from './tint';
import { READING_FONTS, READING_SIZES, READING_SPACINGS, useReadingLook, useReadingPrefs } from './readingPrefs';

/** Wraps a lesson so the reader's own size, spacing and font apply to every piece of text inside it. */
export function ReadingScope({ children }: { children: React.ReactNode }) {
  const look = useReadingLook();
  return <ReadingContext.Provider value={look}>{children}</ReadingContext.Provider>;
}

/** A lesson section's text: markdown with key terms (bold words) in the accent colour. */
export function LessonText({ text }: { text: string }) {
  return <MarkdownText accentTerms>{text}</MarkdownText>;
}

/** "Aa" at the top of a lesson: opens the size, spacing and font choices for reading lessons. */
export function ReadingControls() {
  const { colors } = useTheme();
  const [open, setOpen] = React.useState(false);
  const prefs = useReadingPrefs();
  const chipStyle = (on: boolean) => [styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? tint(colors.primary, 0.12) : 'transparent' }];
  const chips = <T extends string>(o: { label: string; items: Array<{ id: T; name: string }>; value: T; pick: (id: T) => void }) => { const { label, items, value, pick } = o; return (
    <View style={styles.chipRow}>
      <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.chips}>
        {items.map((item) => {
          const on = item.id === value;
          return (
            <TouchableOpacity key={item.id} onPress={() => pick(item.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${label}: ${item.name}`} testID={`reading-${label.toLowerCase()}-${item.id}`}
              style={chipStyle(on)}>
              <Text style={{ color: on ? colors.primary : colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{item.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  ); };
  return (
    <View testID="reading-controls">
      <TouchableOpacity style={styles.toggle} onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel="Reading options" accessibilityState={{ expanded: open }} testID="reading-toggle">
        <Icon name="type" size={16} color={open ? colors.primary : colors.textSecondary} />
        <Text style={{ color: open ? colors.primary : colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>Reading</Text>
      </TouchableOpacity>
      {open && (
        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="reading-panel">
          {chips({ label: 'Size', items: READING_SIZES, value: prefs.size, pick: (size) => prefs.set({ size }) })}
          {chips({ label: 'Spacing', items: READING_SPACINGS, value: prefs.spacing, pick: (spacing) => prefs.set({ spacing }) })}
          {chips({ label: 'Font', items: READING_FONTS, value: prefs.font, pick: (font) => prefs.set({ font }) })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingVertical: 4 },
  panel: { borderWidth: 1, borderRadius: 10, padding: SPACING.sm, gap: SPACING.sm },
  chipRow: { gap: 4 },
  chipLabel: { ...TYPOGRAPHY.meta },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
});
