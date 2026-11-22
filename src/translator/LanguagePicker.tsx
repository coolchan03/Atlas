import React from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { searchLanguages, type TranslatorLanguage } from './languages';

interface Props {
  visible: boolean;
  title: string;
  /** Offer "Detect language" first (text mode, for the language being translated from). */
  allowDetect?: boolean;
  selected: string | null;
  onPick: (code: string | null) => void;
  onClose: () => void;
}

/** A searchable list of languages in a full-screen sheet. */
export function LanguagePicker({ visible, title, allowDetect, selected, onPick, onClose }: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = React.useState('');
  const items: Array<TranslatorLanguage | null> = [...(allowDetect && !query.trim() ? [null] : []), ...searchLanguages(query)];
  const done = (code: string | null) => { setQuery(''); onPick(code); };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="language-picker-close"><Icon name="x" size={22} color={colors.text} /></TouchableOpacity>
        </View>
        <TextInput
          value={query} onChangeText={setQuery} placeholder="Search languages" placeholderTextColor={colors.textMuted} autoCorrect={false} testID="language-search"
          style={[styles.search, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
        />
        <FlatList
          data={items}
          keyExtractor={(l) => l?.code ?? 'detect'}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const code = item?.code ?? null;
            const on = code === selected;
            return (
              <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => done(code)} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`language-${code ?? 'detect'}`}>
                <View style={styles.grow}>
                  <Text style={{ color: on ? colors.primary : colors.text, ...TYPOGRAPHY.body }}>{item ? item.name : 'Detect language'}</Text>
                  {!!item && item.native !== item.name && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{item.native}</Text>}
                </View>
                {on && <Icon name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, borderBottomWidth: 1 },
  title: { ...TYPOGRAPHY.h2 },
  search: { margin: SPACING.md, borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, ...TYPOGRAPHY.body },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  grow: { flex: 1 },
});
