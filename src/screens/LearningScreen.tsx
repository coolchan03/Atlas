import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useAgentStore } from '../stores/agentStore';
import { useProjectStore } from '../stores';
import { useLearningStore, LearnEvent } from '../learning/store';
import { startLearning, stopLearning, isLearning, onLearningStatus, auditNow } from '../learning/engine';
import { keepScreenOn } from '../atlasVoice/tts';

const KIND_ICON: Record<string, string> = {
  question: 'help-circle', report: 'edit-3', judge: 'check-square', manager: 'briefcase', info: 'info', error: 'alert-triangle',
};

function Stepper({ label, value, onChange, colors, styles }: any) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepRow}>
        <TouchableOpacity onPress={() => onChange(Math.max(1, value - 1))} style={styles.stepBtn}><Icon name="minus" size={16} color={colors.text} /></TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity onPress={() => onChange(Math.min(20, value + 1))} style={styles.stepBtn}><Icon name="plus" size={16} color={colors.text} /></TouchableOpacity>
      </View>
    </View>
  );
}

/** Learning mode for one agent: learner -> judge -> manager loop, all on the phone. */
export const LearningScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const wide = width >= 900; // tablets / unfolded screens: settings and feed side by side

  const agents = useAgentStore((s) => s.agents);
  const [agentId, setAgentId] = useState<string>(route.params?.agentId || useAgentStore.getState().activeAgentId || agents[0]?.id);
  const agent = agents.find((a) => a.id === agentId);
  const projects = useProjectStore((s) => s.projects);
  const rawCfg = useLearningStore((s) => s.config[agentId]);
  const cfg = Object.assign({ topic: '', projectId: '', reportsPerJudge: 3, judgesPerManager: 3 }, rawCfg || {});
  const setConfig = useLearningStore((s) => s.setConfig);
  const st = useLearningStore((s) => s.state[agentId]);
  const events = useLearningStore((s) => s.events).filter((e) => e.agentId === agentId).slice(0, 80);
  const clearAgent = useLearningStore((s) => s.clearAgent);
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const [running, setRunning] = useState(isLearning());
  const [statusText, setStatusText] = useState(isLearning() ? 'Running' : 'Idle');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    onLearningStatus((s) => { setStatusText(s); setRunning(isLearning()); });
    const t = setInterval(() => setRunning(isLearning()), 1000);
    return () => { onLearningStatus(null); clearInterval(t); };
  }, []);
  useEffect(() => { keepScreenOn(running); return () => keepScreenOn(false); }, [running]);

  const start = () => { setRunning(true); setStatusText('Starting...'); startLearning(agentId).finally(() => setRunning(false)); };

  const settings = (
    <View>
      <Text style={styles.label}>Agent</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {agents.map((a) => (
          <TouchableOpacity key={a.id} disabled={running} onPress={() => setAgentId(a.id)} style={[styles.chip, a.id === agentId && styles.chipOn]}>
            <Text style={[styles.chipText, a.id === agentId && styles.chipTextOn]}>{a.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>Topic to practice</Text>
      <TextInput
        style={styles.input}
        value={cfg.topic}
        editable={!running}
        onChangeText={(t) => setConfig(agentId, { topic: t })}
        placeholder="e.g. wound infections and when to use antibiotics"
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <Text style={styles.label}>Knowledge base (project)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {[{ id: '', name: 'None' }, ...projects].map((p) => (
          <TouchableOpacity key={p.id || 'none'} disabled={running} onPress={() => setConfig(agentId, { projectId: p.id })} style={[styles.chip, cfg.projectId === p.id && styles.chipOn]}>
            <Text style={[styles.chipText, cfg.projectId === p.id && styles.chipTextOn]}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.row}>
        <Stepper label="Reports per judge" value={cfg.reportsPerJudge} onChange={(v: number) => setConfig(agentId, { reportsPerJudge: v })} colors={colors} styles={styles} />
        <Stepper label="Judge turns per manager" value={cfg.judgesPerManager} onChange={(v: number) => setConfig(agentId, { judgesPerManager: v })} colors={colors} styles={styles} />
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{running ? statusText : 'Idle'}</Text>
        <Text style={styles.counts}>
          Reports: {st?.totalReports ?? 0} · until judge: {Math.max(0, cfg.reportsPerJudge - (st?.reportsSinceJudge ?? 0))} · judge turns until manager: {Math.max(0, cfg.judgesPerManager - (st?.judgesSinceManager ?? 0))}
        </Text>
        {!!st?.direction && <Text style={styles.direction}>Direction: {st.direction}</Text>}
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          onPress={running ? stopLearning : start}
          disabled={!cfg.topic.trim() && !running}
          style={[styles.bigBtn, { backgroundColor: running ? colors.error : colors.primary, opacity: !cfg.topic.trim() && !running ? 0.5 : 1 }]}
        >
          <Icon name={running ? 'square' : 'play'} size={16} color="#fff" />
          <Text style={styles.bigBtnText}>{running ? 'Stop' : 'Start learning'}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={running} onPress={() => auditNow(agentId)} style={styles.smallBtn}>
          <Text style={styles.smallBtnText}>Manager audit now</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Lessons this agent uses in every chat</Text>
      <TextInput
        style={[styles.input, styles.lessons]}
        value={agent?.lessons || ''}
        editable={!running}
        onChangeText={(t) => updateAgent(agentId, { lessons: t })}
        placeholder="None yet. The manager writes these after auditing the judge. You can edit them."
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
      />
      <TouchableOpacity disabled={running} onPress={() => { clearAgent(agentId); updateAgent(agentId, { lessons: '' }); }} style={styles.resetBtn}>
        <Text style={styles.resetText}>Reset lessons and history for this agent</Text>
      </TouchableOpacity>
      <Text style={styles.note}>
        Keep the app open while it learns (the screen stays on). Plugging in is a good idea. It learns rules, not new
        knowledge: the model itself does not change, but the lessons are added to this agent's instructions.
      </Text>
    </View>
  );

  const feed = (
    <View>
      <Text style={styles.label}>Activity</Text>
      {events.length === 0 && <Text style={styles.note}>Nothing yet. Pick a topic and press Start.</Text>}
      {events.map((e: LearnEvent) => (
        <TouchableOpacity key={e.id} onPress={() => setOpen(open === e.id ? null : e.id)} style={styles.event}>
          <View style={styles.eventHead}>
            <Icon name={KIND_ICON[e.kind] || 'circle'} size={14} color={e.kind === 'error' ? colors.error : e.kind === 'manager' ? colors.primary : colors.textSecondary} />
            <Text style={styles.eventTitle}>{e.title}</Text>
            <Text style={styles.eventTime}>{new Date(e.at).toLocaleTimeString()}</Text>
          </View>
          {!!e.body && <Text style={styles.eventBody} numberOfLines={open === e.id ? undefined : 3}>{e.body}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Icon name="arrow-left" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Learning mode</Text>
      </View>
      {wide ? (
        <View style={styles.wideRow}>
          <ScrollView style={styles.wideLeft} contentContainerStyle={styles.pad}>{settings}</ScrollView>
          <ScrollView style={styles.wideRight} contentContainerStyle={styles.pad}>{feed}</ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">{settings}{feed}</ScrollView>
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { marginRight: SPACING.md },
  title: { ...TYPOGRAPHY.h2, color: colors.text },
  pad: { padding: SPACING.lg, paddingBottom: 120 },
  wideRow: { flex: 1, flexDirection: 'row' as const },
  wideLeft: { flex: 1, maxWidth: 560, borderRightWidth: 1, borderRightColor: colors.border },
  wideRight: { flex: 1 },
  label: { ...TYPOGRAPHY.label, color: colors.text, marginTop: SPACING.lg, marginBottom: SPACING.sm, textTransform: 'uppercase' as const },
  input: { ...TYPOGRAPHY.body, backgroundColor: colors.surface, borderRadius: 8, padding: SPACING.md, color: colors.text },
  lessons: { minHeight: 120 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.surface, marginRight: 8 },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: SPACING.md, gap: 12, flexWrap: 'wrap' as const },
  stepper: { flex: 1, minWidth: 140 },
  stepLabel: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginBottom: 4 },
  stepRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  stepBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepValue: { ...TYPOGRAPHY.body, color: colors.text, width: 36, textAlign: 'center' as const },
  statusBox: { marginTop: SPACING.lg, padding: SPACING.md, borderRadius: 8, backgroundColor: colors.surface },
  statusText: { ...TYPOGRAPHY.body, color: colors.text, fontWeight: '600' as const },
  counts: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 4 },
  direction: { ...TYPOGRAPHY.bodySmall, color: colors.primary, marginTop: 6 },
  bigBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, gap: 8 },
  bigBtnText: { color: '#fff', fontWeight: '600' as const, fontSize: 15 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  smallBtnText: { color: colors.text, fontSize: 13 },
  resetBtn: { marginTop: SPACING.sm, paddingVertical: 8 },
  resetText: { color: colors.error, fontSize: 13 },
  note: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, marginTop: SPACING.md, lineHeight: 18 },
  event: { backgroundColor: colors.surface, borderRadius: 8, padding: SPACING.md, marginBottom: SPACING.sm, ...shadows.small },
  eventHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  eventTitle: { ...TYPOGRAPHY.bodySmall, color: colors.text, fontWeight: '600' as const, flex: 1 },
  eventTime: { fontSize: 11, color: colors.textMuted },
  eventBody: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
});
