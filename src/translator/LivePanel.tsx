import React from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components/Button';
import { speakInAndWait } from '../atlasVoice/tts';
import { languageFor } from './languages';
import { createInterpreter, type InterpreterState } from './interpreter';
import { useTranslator } from './store';
import { useMissingVoice } from './useMissingVoice';
import { hasMultilingualWhisper } from '../language/listenTurn';

const PHASE_TEXT: Record<InterpreterState['phase'], string> = { idle: 'Stopped', listening: 'Listening...', transcribing: 'Writing down what was said...', translating: 'Translating...', speaking: 'Speaking...' };

/**
 * Interpreter mode (one way: someone speaks the first language, it is spoken in the second) and conversation mode (both ways, two people
 * take turns). The session itself is in interpreter.ts; this only shows it and starts and stops it.
 */
export function LivePanel({ bothWays }: { bothWays: boolean }) {
  const { colors } = useTheme();
  const { from, to, speak, set } = useTranslator();
  const a = from ?? 'en-US';
  // A new session when the languages, direction or speaking choice change; the effect below stops the one it replaces.
  // `speak` is read through a ref, so flipping that switch does not end the session or clear what was said so far.
  const speakNow = React.useRef(speak);
  speakNow.current = speak;
  const session = React.useMemo(() => createInterpreter({ a, b: to, bothWays, speak: () => speakNow.current }), [a, to, bothWays]);
  const state = React.useSyncExternalStore(session.subscribe, session.state);
  React.useEffect(() => () => session.stop(), [session]);
  const [typed, setTyped] = React.useState('');
  const lastLine = state.lines[state.lines.length - 1];
  const voiceNote = useMissingVoice(languageFor(lastLine?.toCode ?? to).name);
  const sameLanguage = a === to;

  return (
    <View style={styles.gap} testID={bothWays ? 'translator-conversation' : 'translator-interpreter'}>
      <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>
        {bothWays
          ? `Two people take turns. Whoever speaks ${languageFor(a).name} is translated into ${languageFor(to).name}, and the other way round.`
          : `Listens to someone speaking ${languageFor(a).name} and says it in ${languageFor(to).name}.`}
      </Text>
      {bothWays && (
        <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="translator-listen-note">
          {hasMultilingualWhisper()
            ? 'The language of each turn is recognised automatically.'
            : 'Without a multilingual transcription model, Atlas listens in each language in turn: after one person speaks, it listens for the other. Download a multilingual model in Settings to let either person speak at any time.'}
        </Text>
      )}
      <View style={styles.rowBetween}>
        <Text style={{ color: colors.text, ...TYPOGRAPHY.body }}>Say the translation aloud</Text>
        <Switch value={speak} onValueChange={(v) => set({ speak: v })} testID="translator-speak-switch" />
      </View>
      <Button
        title={state.running ? 'Stop' : bothWays ? 'Start the conversation' : 'Start interpreting'}
        onPress={() => (state.running ? session.stop() : session.start())}
        variant={state.running ? 'outline' : 'primary'}
        icon={<Icon name={state.running ? 'square' : 'mic'} size={18} color={state.running ? colors.primary : colors.background} />}
        disabled={!state.running && sameLanguage}
        testID="translator-live-toggle"
      />
      {sameLanguage && !state.running && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="translator-same-language">Pick two different languages to start.</Text>}
      {!!voiceNote && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="translator-voice-note">{voiceNote}</Text>}
      <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="translator-live-phase">{PHASE_TEXT[state.phase]}</Text>
      {!!state.partial && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>{state.partial}</Text>}
      {!!state.error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="translator-live-error">{state.error}</Text>}
      {state.typing && (
        <View style={styles.gap}>
          <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>Nothing on this phone can listen yet. Type what was said instead, or download a transcription model in Settings.</Text>
          <TextInput value={typed} onChangeText={setTyped} placeholder="Type what was said" placeholderTextColor={colors.textMuted} testID="translator-typed"
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]} />
          <Button title="Translate" onPress={() => { const t = typed; setTyped(''); void session.say(t); }} disabled={!typed.trim()} testID="translator-typed-go" />
        </View>
      )}
      {[...state.lines].reverse().map((line) => (
        <View key={line.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID={`translator-line-${line.id}`}>
          <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{line.heard}</Text>
          <Text selectable style={{ color: colors.text, ...TYPOGRAPHY.body }}>{line.said}</Text>
          <TouchableOpacity onPress={() => { void speakInAndWait(line.said, line.toCode, { messageId: 'interpreter' }); }} accessibilityRole="button" accessibilityLabel="Say it again" testID={`translator-replay-${line.id}`}>
            <Icon name="volume-2" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: SPACING.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, ...TYPOGRAPHY.body },
  card: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, gap: SPACING.sm },
});
