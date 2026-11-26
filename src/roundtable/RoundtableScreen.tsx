import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { askModel } from '../study/engine';
import { speakAndWait, stop as stopSpeech, listVoices, keepScreenOn } from '../atlasVoice/tts';
import { castLine } from '../atlasVoice/podcastAudio';
import { shareItem } from '../utils/shareItem';
import { ROUNDTABLE_FORMATS, formatById, type RoundtableFormat } from './formats';
import { advance, hostOf, newSession, playerSays, progress, transcriptText, wrapUp, type Session } from './engine';
import { useRoundtables } from './store';
import { canDraw, illustrateScene } from './illustrate';
import { resolveDocumentPath } from '../utils/resolveDocumentPath';

const clampRounds = (f: RoundtableFormat, n: number) => (Number.isFinite(n) ? Math.max(1, Math.min(f.maxRounds, Math.round(n))) : f.defaultRounds);
type Styles = ReturnType<typeof createStyles>;

/** Pick a format, a topic and how long it runs; or go back to a saved one. */
const SetupView: React.FC<{ onStart: (s: Session) => void; onOpen: (s: Session) => void; styles: Styles }> = ({ onStart, onOpen, styles }) => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const saved = useRoundtables((s) => s.sessions);
  const [format, setFormat] = useState<RoundtableFormat>(ROUNDTABLE_FORMATS[0]);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [rounds, setRounds] = useState(ROUNDTABLE_FORMATS[0].defaultRounds);
  const [pictures, setPictures] = useState(false);
  const canIllustrate = format.roles('').some((r) => r.draws) && canDraw();
  const shown = clampRounds(format, rounds);
  const start = () => {
    if (!topic.trim()) { Alert.alert('Add a topic first', format.topicHint); return; }
    onStart(newSession(format, { topic, rounds: shown, notes, pictures: canIllustrate && pictures }));
  };
  return (
    <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled" testID="roundtable-setup">
      <Text style={styles.hint}>Different roles take turns on your phone's model: they argue, build, attack, teach or play a story with you. Everything stays on the phone.</Text>
      <Text style={styles.label}>FORMAT</Text>
      <View style={styles.chips}>
        {ROUNDTABLE_FORMATS.map((f) => (
          <TouchableOpacity key={f.id} onPress={() => { setFormat(f); setRounds(f.defaultRounds); }} testID={`roundtable-format-${f.id}`} accessibilityRole="radio" accessibilityState={{ selected: format.id === f.id }} style={[styles.chip, format.id === f.id && styles.chipOn]}>
            <Text style={format.id === f.id ? styles.chipTextOn : styles.chipText}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint} testID="roundtable-blurb">{format.blurb}</Text>
      <Text style={styles.hint}>Roles: {format.roles('').map((r) => r.name).join(', ')}.</Text>
      <Text style={styles.label}>TOPIC</Text>
      <TextInput value={topic} onChangeText={setTopic} multiline placeholder={format.topicHint} placeholderTextColor={colors.textMuted} style={styles.input} testID="roundtable-topic" />
      <Text style={styles.label}>{format.id === 'game' ? 'TURNS YOU PLAY' : 'ROUNDS'}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity onPress={() => setRounds(clampRounds(format, shown - 1))} accessibilityLabel="One fewer" testID="roundtable-rounds-down" style={styles.stepButton}><Icon name="minus" size={16} color={colors.text} /></TouchableOpacity>
        <Text style={styles.count} testID="roundtable-rounds">{shown}</Text>
        <TouchableOpacity onPress={() => setRounds(clampRounds(format, shown + 1))} accessibilityLabel="One more" testID="roundtable-rounds-up" style={styles.stepButton}><Icon name="plus" size={16} color={colors.text} /></TouchableOpacity>
      </View>
      <Text style={styles.label}>NOTES (OPTIONAL)</Text>
      <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Paste facts the roles may use" placeholderTextColor={colors.textMuted} style={[styles.input, styles.notes]} testID="roundtable-notes" />
      {canIllustrate && (
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.name}>Draw each scene</Text>
            <Text style={styles.hint}>Your image model paints a picture after each scene. Slower, and it needs the memory an image model uses.</Text>
          </View>
          <Switch value={pictures} onValueChange={setPictures} testID="roundtable-pictures" />
        </View>
      )}
      <Button title="Start" onPress={start} testID="roundtable-start" />
      {!!saved.length && <Text style={styles.label}>SAVED</Text>}
      {saved.slice(0, 8).map((s) => (
        <TouchableOpacity key={s.id} onPress={() => onOpen(s)} style={styles.saved} testID={`roundtable-saved-${s.id}`}>
          <Text style={styles.name} numberOfLines={1}>{formatById(s.formatId)?.label}: {s.topic}</Text>
          <Text style={styles.hint}>{s.turns.filter((t) => !t.hidden).length} turns · {s.status === 'done' ? 'finished' : 'can continue'}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const ROLE_COLORS = ['#0E7490', '#9A3412', '#4338CA', '#047857'];

/** The buttons under the transcript: what can be done depends on whether it is running, stopped, finished or failed. */
const Actions: React.FC<{ session: Session; working: boolean; listening: boolean; hasTurns: boolean; title: string; onRun: (s: Session) => void; onStop: () => void; onListen: () => void; onLeave: () => void; styles: Styles }> = ({ session, working, listening, hasTurns, title, onRun, onStop, onListen, onLeave, styles }) => {
  if (working) return <View style={styles.actions}><Button title="Stop" variant="outline" onPress={onStop} testID="roundtable-stop" /></View>;
  const retry = session.status === 'stopped' || session.status === 'error';
  return (
    <View style={styles.actions}>
      {retry && <Button title={session.status === 'error' ? 'Try again' : 'Continue'} onPress={() => onRun(session)} testID="roundtable-continue" />}
      {session.status !== 'done' && <Button title="Wrap up" variant="outline" onPress={() => onRun(wrapUp(session))} testID="roundtable-wrapup" />}
      {hasTurns && <Button title={listening ? 'Stop listening' : 'Listen'} variant="outline" onPress={onListen} testID="roundtable-listen" />}
      {hasTurns && <Button title="Share" variant="outline" onPress={() => void shareItem({ title, text: transcriptText(session) })} testID="roundtable-share" />}
      <Button title="New roundtable" variant="outline" onPress={onLeave} testID="roundtable-new" />
    </View>
  );
};

/** The transcript, whose turn it is, and what the person can do now. */
const RunView: React.FC<{ session: Session; working: boolean; onRun: (s: Session) => void; onStop: () => void; onSend: (text: string) => void; onLeave: () => void; styles: Styles }> = ({ session, working, onRun, onStop, onSend, onLeave, styles }) => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const [reply, setReply] = useState('');
  const [listening, setListening] = useState(false);
  const listenRef = useRef(0);
  const scroller = useRef<ScrollView>(null);
  useEffect(() => () => { listenRef.current++; void stopSpeech(); }, []);
  const fmt = formatById(session.formatId);
  const turns = session.turns.filter((t) => !t.hidden);
  const next = session.cursor < session.steps.length ? session.steps[session.cursor] : undefined;
  const speaking = next && next.kind !== 'player' ? session.roles.find((r) => r.id === next.role)?.name : undefined;
  const bar = progress(session);
  const status = session.status === 'done' ? 'finished' : session.status === 'waiting' ? 'your turn' : session.status;

  const listen = async () => {
    if (listening) { listenRef.current++; await stopSpeech(); setListening(false); return; }
    const token = ++listenRef.current;
    setListening(true);
    try {
      const voices = await listVoices('en').catch(() => []);
      const speakers = session.roles.filter((r) => !r.human).length;
      for (const t of turns) {
        if (token !== listenRef.current) break;
        const cast = castLine(hostOf(session, t.role), speakers, voices);
        await speakAndWait(t.text, { voice: cast.voice, pitch: cast.pitch, messageId: 'roundtable' });
      }
    } finally { if (token === listenRef.current) setListening(false); }
  };

  return (
    <ScrollView ref={scroller} contentContainerStyle={[styles.body, wide.column]} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} testID="roundtable-run">
      <Text style={styles.name}>{session.topic}</Text>
      <Text style={styles.hint} testID="roundtable-progress">{bar.done} of {bar.total} steps · {status}</Text>
      {turns.map((t, i) => {
        const role = session.roles.find((r) => r.id === t.role);
        return (
          <View key={`${i}-${t.role}`} style={[styles.turn, role?.human && styles.turnYou]} testID={`roundtable-turn-${i}`}>
            <Text style={[styles.who, { color: ROLE_COLORS[Math.max(0, session.roles.indexOf(role!)) % 4] }]}>{t.name}</Text>
            <Text style={styles.text}>{t.text}</Text>
            {!!t.image && <Image source={{ uri: `file://${resolveDocumentPath(t.image)}` }} style={styles.picture} accessibilityLabel={`Picture for ${t.name}'s turn`} testID={`roundtable-picture-${i}`} />}
          </View>
        );
      })}
      {working && !!speaking && <View style={styles.row}><ActivityIndicator /><Text style={styles.hint} testID="roundtable-speaking">{speaking} is writing...</Text></View>}
      {session.status === 'error' && <Text style={styles.error} testID="roundtable-error">{session.error}</Text>}
      {session.status === 'waiting' && (
        <View testID="roundtable-player">
          <Text style={styles.label}>{(next?.instruction ?? 'Your turn').toUpperCase()}</Text>
          <TextInput value={reply} onChangeText={setReply} multiline placeholder="Type here" placeholderTextColor={colors.textMuted} style={styles.input} testID="roundtable-reply" />
          <Button title="Send" onPress={() => { onSend(reply); setReply(''); }} disabled={!reply.trim() || working} testID="roundtable-send" />
        </View>
      )}
      <Actions session={session} working={working} listening={listening} hasTurns={!!turns.length} title={`${fmt?.label}: ${session.topic}`} onRun={onRun} onStop={onStop} onListen={() => void listen()} onLeave={onLeave} styles={styles} />
    </ScrollView>
  );
};

/** Roles take turns on one model: pick a format, give it a topic, watch it run, and join in where the format asks you to. */
export const RoundtableScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const [session, setSession] = useState<Session | null>(null);
  const [working, setWorking] = useState(false);
  const stopRef = useRef(false);
  useEffect(() => () => { stopRef.current = true; keepScreenOn(false, 'roundtable'); }, []);

  const keep = (s: Session) => { setSession(s); useRoundtables.getState().save(s); };
  const run = async (from: Session) => {
    stopRef.current = false;
    setWorking(true);
    setSession(from);
    keepScreenOn(true, 'roundtable'); // several model turns in a row: don't let the phone sleep and pause it
    try { keep(await advance(from, { ask: askModel, shouldStop: () => stopRef.current, onUpdate: setSession, illustrate: (turn, sess) => illustrateScene(turn, sess, askModel) })); } finally { setWorking(false); keepScreenOn(false, 'roundtable'); }
  };
  const leave = () => { stopRef.current = true; setSession(null); };

  return (
    <SafeAreaView style={styles.fill} edges={['top']}>
      <ScreenHeader title={session ? formatById(session.formatId)?.label ?? 'Roundtable' : 'Roundtable'} onBack={session ? leave : undefined} />
      {session
        ? <RunView session={session} working={working} styles={styles} onRun={(s) => void run(s)} onStop={() => { stopRef.current = true; }} onLeave={leave}
          onSend={(text) => { const next = playerSays(session, text); keep(next); void run(next); }} />
        : <SetupView styles={styles} onStart={(s) => void run(s)} onOpen={setSession} />}
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  fill: { flex: 1, backgroundColor: colors.background },
  body: { padding: SPACING.lg, gap: SPACING.sm },
  hint: { ...TYPOGRAPHY.meta, color: colors.textSecondary },
  label: { ...TYPOGRAPHY.meta, color: colors.textSecondary, marginTop: SPACING.md },
  name: { ...TYPOGRAPHY.h2, color: colors.text },
  count: { ...TYPOGRAPHY.h2, color: colors.text, minWidth: 32, textAlign: 'center' as const },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: SPACING.xs },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  chipTextOn: { ...TYPOGRAPHY.bodySmall, color: colors.background },
  input: { ...TYPOGRAPHY.body, color: colors.text, backgroundColor: colors.surface, borderRadius: 8, padding: SPACING.sm, minHeight: 56, textAlignVertical: 'top' as const },
  notes: { minHeight: 80 },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  saved: { padding: SPACING.sm, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  turn: { padding: SPACING.sm, borderRadius: 8, backgroundColor: colors.surface, gap: 2 },
  turnYou: { borderWidth: 1, borderColor: colors.primary },
  who: { ...TYPOGRAPHY.label },
  text: { ...TYPOGRAPHY.body, color: colors.text },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm },
  grow: { flex: 1 },
  picture: { width: '100%' as const, aspectRatio: 1, borderRadius: 8, marginTop: SPACING.xs },
  error: { ...TYPOGRAPHY.bodySmall, color: colors.error },
  actions: { gap: SPACING.sm, marginTop: SPACING.md },
});
