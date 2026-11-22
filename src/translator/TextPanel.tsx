import React from 'react';
import { ActivityIndicator, Clipboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { speakInAndWait, stop as stopSpeech } from '../atlasVoice/tts';
import { Button } from '../components/Button';
import { languageFor } from './languages';
import { translateText } from './translateService';
import { useTranslator } from './store';
import { useMissingVoice } from './useMissingVoice';

/** Text mode: type or paste text, get the translation, hear it, copy it. Recent translations are kept below. */
export function TextPanel() {
  const { colors } = useTheme();
  const { from, to, history, remember, clearHistory, set } = useTranslator();
  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const voiceNote = useMissingVoice(languageFor(to).name);

  const translate = async () => {
    const input = text.trim();
    if (!input || busy) return;
    setBusy(true); setError(null);
    try {
      const out = await translateText(input, from ? languageFor(from) : null, languageFor(to));
      setResult(out);
      remember({ from, to, original: input, translation: out });
    } catch (e) { setError(String((e as Error)?.message || e)); }
    setBusy(false);
  };

  return (
    <View style={styles.gap} testID="translator-text">
      <TextInput
        value={text} onChangeText={setText} multiline placeholder="Type or paste text to translate" placeholderTextColor={colors.textMuted} testID="translator-input"
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
      />
      <View style={styles.actions}>
        <TouchableOpacity onPress={async () => { try { const pasted = await Clipboard.getString(); if (pasted) setText(pasted); } catch { /* nothing to paste */ } }} accessibilityRole="button" accessibilityLabel="Paste" testID="translator-paste"><Text style={{ color: colors.primary, ...TYPOGRAPHY.bodySmall }}>Paste</Text></TouchableOpacity>
        {!!text && <TouchableOpacity onPress={() => { setText(''); setResult(''); setError(null); }} accessibilityRole="button" accessibilityLabel="Clear the text" testID="translator-clear-input"><Text style={{ color: colors.primary, ...TYPOGRAPHY.bodySmall }}>Clear</Text></TouchableOpacity>}
      </View>
      <Button title={busy ? 'Translating...' : 'Translate'} onPress={translate} disabled={busy || !text.trim()} testID="translator-go" />
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="translator-error">{error}</Text>}
      {!!voiceNote && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="translator-voice-note">{voiceNote}</Text>}
      {!!result && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="translator-result">
          <Text selectable style={{ color: colors.text, ...TYPOGRAPHY.body }}>{result}</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => { stopSpeech(); void speakInAndWait(result, languageFor(to).code, { messageId: 'translator' }); }} accessibilityRole="button" accessibilityLabel="Speak the translation" testID="translator-speak"><Icon name="volume-2" size={20} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity onPress={() => Clipboard.setString(result)} accessibilityRole="button" accessibilityLabel="Copy the translation" testID="translator-copy"><Icon name="copy" size={20} color={colors.primary} /></TouchableOpacity>
            {!!from && <TouchableOpacity onPress={() => { set({ from: to, to: from }); setText(result); setResult(''); }} accessibilityRole="button" accessibilityLabel="Translate this back" testID="translator-back"><Icon name="repeat" size={20} color={colors.primary} /></TouchableOpacity>}
          </View>
        </View>
      )}
      {history.length > 0 && (
        <View style={styles.gap}>
          <View style={styles.actions}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>RECENT</Text>
            <TouchableOpacity onPress={clearHistory} accessibilityRole="button" accessibilityLabel="Clear recent translations" testID="translator-clear"><Text style={{ color: colors.primary, ...TYPOGRAPHY.bodySmall }}>Clear</Text></TouchableOpacity>
          </View>
          {history.map((h) => (
            <TouchableOpacity key={h.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => { set({ from: h.from, to: h.to }); setText(h.original); setResult(h.translation); }} accessibilityRole="button" testID={`translator-history-${h.id}`}>
              <Text numberOfLines={2} style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{h.original}</Text>
              <Text numberOfLines={2} style={{ color: colors.text, ...TYPOGRAPHY.body }}>{h.translation}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: SPACING.md },
  input: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, minHeight: 120, textAlignVertical: 'top', ...TYPOGRAPHY.body },
  card: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, gap: SPACING.sm },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.lg },
});
