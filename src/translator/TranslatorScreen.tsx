import { NavigationRouteContext } from '@react-navigation/native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { languageFor } from './languages';
import { LanguagePicker } from './LanguagePicker';
import { TextPanel } from './TextPanel';
import { LivePanel } from './LivePanel';
import { CameraPanel } from './CameraPanel';
import { useTranslator, type TranslatorMode } from './store';
import { useWideLayout } from '../hooks/useWideLayout';

const MODES: Array<{ id: TranslatorMode; label: string; icon: string }> = [
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'interpreter', label: 'Interpreter', icon: 'mic' },
  { id: 'conversation', label: 'Conversation', icon: 'users' },
  { id: 'camera', label: 'Camera', icon: 'camera' },
];

/** Translate text, interpret speech live, hold a two-way conversation, or translate a picture, on the phone's own AI. */
export const TranslatorScreen: React.FC = () => {
  const { colors } = useTheme();
  const { mode, from, to, set, swap } = useTranslator();
  const shared = (React.useContext(NavigationRouteContext)?.params as { picture?: { uri: string; mime: string } } | undefined)?.picture;
  React.useEffect(() => { if (shared) set({ mode: 'camera' }); }, [shared?.uri]); // eslint-disable-line react-hooks/exhaustive-deps
  // Wide screens keep the content in a centred column (a tablet gets two panes in text mode, see TextPanel).
  const wide = useWideLayout(1100);
  const [picking, setPicking] = React.useState<'from' | 'to' | null>(null);
  // Only text mode can recognise the language to translate from; the live modes need to know it to listen.
  const fromLabel = from ? languageFor(from).name : 'Detect language';
  const showFrom = mode !== 'camera';
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Translator" />
      <View style={[styles.modes, { borderBottomColor: colors.border }]}>
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <TouchableOpacity key={m.id} style={styles.mode} onPress={() => set({ mode: m.id, ...(m.id !== 'text' && !from ? { from: to === 'en-US' ? 'es-ES' : 'en-US' } : {}) })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={m.label} testID={`translator-mode-${m.id}`}>
              <Icon name={m.icon} size={20} color={on ? colors.primary : colors.textSecondary} />
              <Text style={{ color: on ? colors.primary : colors.textSecondary, ...TYPOGRAPHY.meta }}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <View style={styles.languages}>
          {showFrom && (
            <>
              <TouchableOpacity style={[styles.language, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setPicking('from')} accessibilityRole="button" accessibilityLabel={`Translate from ${fromLabel}`} testID="translator-from">
                <Text numberOfLines={1} style={{ color: colors.text, ...TYPOGRAPHY.body }}>{fromLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={swap} disabled={!from} accessibilityRole="button" accessibilityLabel="Swap languages" testID="translator-swap">
                <Icon name="repeat" size={20} color={from ? colors.primary : colors.textDisabled} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={[styles.language, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setPicking('to')} accessibilityRole="button" accessibilityLabel={`Translate to ${languageFor(to).name}`} testID="translator-to">
            <Text numberOfLines={1} style={{ color: colors.text, ...TYPOGRAPHY.body }}>{languageFor(to).name}</Text>
          </TouchableOpacity>
        </View>
        {mode === 'text' && <TextPanel />}
        {mode === 'interpreter' && <LivePanel bothWays={false} />}
        {mode === 'conversation' && <LivePanel bothWays />}
        {mode === 'camera' && <CameraPanel shared={shared} />}
      </ScrollView>
      <LanguagePicker
        visible={picking !== null}
        title={picking === 'from' ? 'Translate from' : 'Translate to'}
        allowDetect={picking === 'from' && mode === 'text'}
        selected={picking === 'from' ? from : to}
        onPick={(code) => { if (picking === 'from') set({ from: code }); else if (code) set({ to: code }); setPicking(null); }}
        onClose={() => setPicking(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  modes: { flexDirection: 'row', borderBottomWidth: 1 },
  mode: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: SPACING.sm, minHeight: 56, justifyContent: 'center' },
  body: { padding: SPACING.lg, gap: SPACING.lg },
  languages: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  language: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, minHeight: 48, justifyContent: 'center' },
});
