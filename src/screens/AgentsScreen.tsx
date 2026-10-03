import React, { useState } from 'react';
import { useWideLayout } from '../hooks/useWideLayout';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useAgentStore, Agent } from '../stores/agentStore';
import { installAtlasStarter } from '../learning/starter';

/** Agents tab: personas with their own system prompts. Tap the circle to make one active. */
export const AgentsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const wide = useWideLayout();
  const styles = useThemedStyles(createStyles);
  const agents = useAgentStore((s) => s.agents);
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent);
  const [starterMsg, setStarterMsg] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const install = async () => {
    setInstalling(true);
    try {
      const r = await installAtlasStarter(setStarterMsg);
      setStarterMsg(`Done: ${r.added} documents added${r.skipped ? `, ${r.skipped} already there` : ''}. Open the "Atlas - Emergency" project to chat with them.`);
    } catch (e: any) {
      setStarterMsg(`Could not add the cards: ${String(e?.message || e)}`);
    } finally {
      setInstalling(false);
    }
  };

  const renderItem = ({ item }: { item: Agent }) => {
    const active = item.id === activeAgentId;
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AgentEdit', { agentId: item.id })} activeOpacity={0.75}>
        <TouchableOpacity onPress={() => setActiveAgent(active ? null : item.id)} hitSlop={10} style={styles.radioWrap} accessibilityLabel={active ? 'Active agent' : 'Use this agent'}>
          <Icon name={active ? 'check-circle' : 'circle'} size={22} color={active ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.cardText}>
          <Text style={styles.name}>{item.name}{active ? '  (active)' : ''}</Text>
          {!!item.description && <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>}
          <Text style={styles.prompt} numberOfLines={2}>{item.systemPrompt}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Agents</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={() => navigation.navigate('Learning', {})} style={styles.addButton} accessibilityLabel="Learning mode">
            <Icon name="trending-up" size={18} color={colors.primary} />
            <Text style={styles.addText}>Learn</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('AgentEdit', {})} style={styles.addButton} accessibilityLabel="New agent">
            <Icon name="plus" size={18} color={colors.primary} />
            <Text style={styles.addText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.help}>
        An agent decides who answers and how (its system prompt). Projects hold your chats and documents.
        Tap the circle to choose the active agent - it is used in every chat. Tap again for no agent.
      </Text>
      <TouchableOpacity style={styles.starter} onPress={install} disabled={installing}>
        <Icon name="download" size={18} color={colors.primary} />
        <View style={styles.cardText}>
          <Text style={styles.name}>{installing ? 'Adding emergency cards...' : 'Add Atlas emergency cards'}</Text>
          <Text style={styles.desc}>{starterMsg ?? 'Creates the "Atlas - Emergency" project with the built-in cards and the whole Survival Manual, and turns on the Atlas agent. Takes a minute.'}</Text>
        </View>
      </TouchableOpacity>
      <FlatList data={agents} keyExtractor={(a) => a.id} renderItem={renderItem} contentContainerStyle={[styles.list, wide.column]} />
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  title: { ...TYPOGRAPHY.h1, color: colors.text },
  headerButtons: { flexDirection: 'row' as const },
  starter: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: SPACING.md, borderRadius: 10, borderWidth: 1, borderColor: colors.primary },
  addButton: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: SPACING.sm },
  addText: { ...TYPOGRAPHY.body, color: colors.primary, marginLeft: 4 },
  help: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, paddingHorizontal: SPACING.lg, marginTop: SPACING.sm, lineHeight: 18 },
  list: { padding: SPACING.lg, paddingBottom: 120 },
  card: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: colors.surface, borderRadius: 10, padding: SPACING.md, marginBottom: SPACING.md, ...shadows.small },
  radioWrap: { marginRight: SPACING.md },
  cardText: { flex: 1 },
  name: { ...TYPOGRAPHY.body, color: colors.text, fontWeight: '600' as const },
  desc: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: 2 },
  prompt: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, marginTop: 4 },
});
