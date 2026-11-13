import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAppStore } from '../stores/appStore';
import { useAgentStore } from '../stores/agentStore';
import { useProjectStore } from '../stores/projectStore';
import { useVoiceProfiles } from '../atlasVoice/profiles';
import { useHomeShortcuts } from './HomeScreen/homeShortcutStore';
import { useCallPrefs } from './HomeScreen/callPrefs';
import { callTitle, startCall, type CallChoice } from './HomeScreen/quickCall';

interface Option { id: string; label: string }

const Choices: React.FC<{ title: string; hint?: string; options: Option[]; value: string; onPick: (id: string) => void; testID: string }> = ({ title, hint, options, value, onPick, testID }) => {
  const { colors } = useTheme();
  return (
    <View testID={testID}>
      <Text style={[styles.label, { color: colors.text }]}>{title}</Text>
      {!!hint && <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>}
      <View style={styles.chips}>
        {options.map((o) => (
          <TouchableOpacity key={o.id || 'none'} onPress={() => onPick(o.id)} accessibilityRole="radio" accessibilityState={{ selected: value === o.id }} testID={`${testID}-${o.id || 'none'}`}
            style={[styles.chip, { borderColor: value === o.id ? colors.primary : colors.border, backgroundColor: value === o.id ? colors.primary : colors.surface }]}>
            <Text style={{ color: value === o.id ? colors.background : colors.text }}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

/** Call any agent, with any model, from any project folder: the therapist with your therapy folder, Jake, or no agent at all. */
export const CallSetupScreen: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const agents = useAgentStore((s) => s.agents);
  const projects = useProjectStore((s) => s.projects);
  const models = useAppStore((s) => s.downloadedModels);
  const profiles = useVoiceProfiles((s) => s.profiles);
  const last = useCallPrefs((s) => s.last);
  const remember = useCallPrefs((s) => s.remember);
  const addShortcut = useHomeShortcuts((s) => s.addShortcut);
  const [choice, setChoice] = useState<CallChoice>(last);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CallChoice>) => setChoice((c) => ({ ...c, ...patch }));
  const agentName = choice.agentId ? agents.find((a) => a.id === choice.agentId)?.name : undefined;

  const call = async () => {
    setBusy(true);
    remember(choice);
    await startCall((screen, params) => navigation.navigate(screen, params), choice);
    setBusy(false);
  };
  const lastName = last.agentId ? agents.find((a) => a.id === last.agentId)?.name : undefined;
  const callAgain = async () => { setBusy(true); await startCall((screen, params) => navigation.navigate(screen, params), last); setBusy(false); };
  const save = () => {
    addShortcut({ title: callTitle(choice.agentId), action: 'call', agentId: choice.agentId, modelId: choice.modelId, projectId: choice.projectId, voiceProfileId: choice.voiceProfileId });
    Alert.alert('Saved on Home', `${callTitle(choice.agentId)} is now a one-tap button on the Home screen.`);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Call" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>Talk hands-free with any agent. Choose who, which model and which project folder it can use, then call. Your choice is remembered.</Text>
        {Object.keys(last).length > 0 && <Button title={lastName ? `Call ${lastName} again` : 'Call again'} onPress={callAgain} disabled={busy} testID="call-again" />}
        <Choices testID="call-agent" title="Who to call" options={[{ id: '', label: 'No agent' }, ...agents.map((a) => ({ id: a.id, label: a.name }))]} value={choice.agentId ?? ''} onPick={(id) => set({ agentId: id || undefined })} />
        <Choices testID="call-model" title="Model" hint="Loaded now means whatever is ready. Choosing another loads it first." options={[{ id: '', label: 'Loaded now' }, ...models.map((m) => ({ id: m.id, label: m.name }))]} value={choice.modelId ?? ''} onPick={(id) => set({ modelId: id || undefined })} />
        <Choices testID="call-project" title="Project folder" hint="The agent can use that project's documents, such as your therapy folder." options={[{ id: '', label: 'None' }, ...projects.map((p) => ({ id: p.id, label: p.name }))]} value={choice.projectId ?? ''} onPick={(id) => set({ projectId: id || undefined })} />
        {profiles.length > 0 && (
          <Choices testID="call-voice" title="Voice" hint="The agent's own voice is used when you leave this." options={[{ id: '', label: "Agent's voice" }, ...profiles.map((p) => ({ id: p.id, label: p.name }))]} value={choice.voiceProfileId ?? ''} onPick={(id) => set({ voiceProfileId: id || undefined })} />
        )}
        <Button title={agentName ? `Call ${agentName}` : 'Call'} onPress={call} disabled={busy} testID="call-start" />
        <Button title="Save as a one-tap Home button" variant="outline" onPress={save} testID="call-save" />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: 80, gap: SPACING.md },
  label: { ...TYPOGRAPHY.h3, marginTop: SPACING.sm },
  hint: { ...TYPOGRAPHY.bodySmall },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
});
