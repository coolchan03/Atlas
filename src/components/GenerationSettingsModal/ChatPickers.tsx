import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from '../../theme';
import type { ThemeColors } from '../../theme';
import { useChatStore } from '../../stores';
import { useAgentStore } from '../../stores/agentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVoiceProfiles } from '../../atlasVoice/profiles';
import { CHAT_TONES, type ChatTonePreset } from '../../services/chatTone';
import type { Conversation } from '../../types';

type Option = { id: string; label: string };

const ChipPicker: React.FC<{ title: string; active: string; options: Option[]; onChoose: (id: string) => void }> = ({ title, active, options, onChoose }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chipRow}>
        {options.map((o) => {
          const selected = active === o.id;
          return (
            <TouchableOpacity key={o.id || 'default'} accessibilityRole="radio" accessibilityState={{ selected }}
              onPress={() => onChoose(o.id)} style={selected ? styles.chipOn : styles.chip}>
              <Text style={selected ? styles.chipTextOn : styles.chipText}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

/** Pick this chat's agent, project, voice and conversation style. */
export const ChatPickers: React.FC<{ conv: Conversation }> = ({ conv }) => {
  const agents = useAgentStore((s) => s.agents);
  const projects = useProjectStore((s) => s.projects);
  const voices = useVoiceProfiles((s) => s.profiles);
  const { setConversationAgent, setConversationProject, setConversationVoiceProfile, setConversationTone } = useChatStore.getState();
  const moveToProject = (id: string) => {
    try { setConversationProject(conv.id, id || null); } catch (e: any) { Alert.alert('Cannot move chat', String(e?.message || e)); }
  };
  return (
    <>
      <ChipPicker title="Agent for this chat" active={conv.agentId || ''} onChoose={(id) => setConversationAgent(conv.id, id || null)}
        options={[{ id: '', label: 'Default' }, ...agents.filter((a) => a.id !== 'talk' && a.id !== 'field-id').map((a) => ({ id: a.id, label: a.name }))]} />
      <ChipPicker title="Project" active={conv.projectId || ''} onChoose={moveToProject}
        options={[{ id: '', label: 'None' }, ...projects.map((p) => ({ id: p.id, label: p.name }))]} />
      <ChipPicker title="Voice for this chat" active={conv.voiceProfileId || ''} onChoose={(id) => setConversationVoiceProfile(conv.id, id || undefined)}
        options={[{ id: '', label: 'Agent / default voice' }, ...voices.map((v) => ({ id: v.id, label: v.name }))]} />
      <ChipPicker title="Style preset (agent settings take priority)" active={conv.tonePreset || 'balanced'} onChoose={(id) => setConversationTone(conv.id, id as ChatTonePreset)}
        options={CHAT_TONES.map((t) => ({ id: t.id, label: t.name }))} />
    </>
  );
};

const makeStyles = (colors: ThemeColors) => {
  const chip = { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 };
  return {
    box: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12 },
    title: { color: colors.text, fontWeight: '400' as const },
    chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginTop: 8, gap: 8 },
    chip: { ...chip, backgroundColor: colors.background },
    chipOn: { ...chip, backgroundColor: colors.primary },
    chipText: { color: colors.text, fontSize: 13 },
    chipTextOn: { color: colors.background, fontSize: 13 },
  };
};
