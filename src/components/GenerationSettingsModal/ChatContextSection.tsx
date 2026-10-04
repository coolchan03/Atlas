import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { useChatStore } from '../../stores';
import { contextCompactionService, llmService } from '../../services';
import { useChatPrefs } from '../../atlasTools/chatPrefs';
import { useAgentStore } from '../../stores/agentStore';

/** Chat settings: this chat's own instructions, and compressing older messages so long chats keep going. */
export const ChatContextSection: React.FC = () => {
  const { colors } = useTheme();
  const convId = useChatStore((s) => s.activeConversationId);
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === s.activeConversationId));
  const [text, setText] = useState(conv?.instructions || '');
  const [busy, setBusy] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const autoCompress = useChatPrefs((s) => s.autoCompress);
  const setPrefs = useChatPrefs((s) => s.set);
  const agentName = useAgentStore((s) => s.agents.find((a) => a.id === s.activeAgentId)?.name);
  useEffect(() => { setText(conv?.instructions || ''); }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!convId || !conv) return null;

  const save = (v: string) => {
    setText(v);
    useChatStore.setState((s: any) => ({ conversations: s.conversations.map((c: any) => (c.id === convId ? { ...c, instructions: v } : c)) }));
  };
  const compress = async () => {
    if (!llmService.isModelLoaded()) { Alert.alert('Load a model first', 'Compressing uses the loaded model to write the summary.'); return; }
    if (llmService.isCurrentlyGenerating()) { Alert.alert('Busy', 'Wait for the answer to finish, then try again.'); return; }
    setBusy(true);
    try {
      const did = await contextCompactionService.compactNow(convId, 4);
      Alert.alert(did ? 'Chat compressed' : 'Nothing to compress', did ? 'Older messages were summarized. They stay on screen, but the AI now reads the short summary instead, so the chat can go on much longer.' : 'This chat is still short.');
    } catch (e: any) { Alert.alert('Could not compress', String(e?.message || e)); } finally { setBusy(false); }
  };
  const box = { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12 };
  return (
    <View>
      <View style={box}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>Instructions for this chat</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          Added under {agentName ? `the ${agentName} agent's` : 'the agent\'s'} and the project's instructions, only in this chat. Edit agents in the Agents tab and projects in Projects.
        </Text>
        <TextInput value={text} onChangeText={save} multiline placeholder="e.g. Answer in Spanish. I am a nurse, use medical terms." placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, backgroundColor: colors.background, borderRadius: 8, padding: 10, marginTop: 8, minHeight: 60, textAlignVertical: 'top' }} />
      </View>
      <View style={box}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Compress long chats automatically</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>When a chat nears the model's memory limit, older messages are summarized so it can keep going.</Text>
          </View>
          <Switch value={autoCompress} onValueChange={(v) => setPrefs({ autoCompress: v })} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 14 }}>
          <TouchableOpacity onPress={compress} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
            {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="minimize-2" size={15} color={colors.primary} />}
            <Text style={{ color: colors.primary, marginLeft: 6 }}>Compress now</Text>
          </TouchableOpacity>
          {!!conv.compactionSummary && (
            <>
              <TouchableOpacity onPress={() => setShowSummary((v) => !v)}><Text style={{ color: colors.textSecondary }}>{showSummary ? 'Hide summary' : 'View summary'}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => contextCompactionService.clearSummary(convId)}><Text style={{ color: colors.textMuted }}>Undo</Text></TouchableOpacity>
            </>
          )}
        </View>
        {showSummary && !!conv.compactionSummary && (
          <Text selectable style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>{conv.compactionSummary}</Text>
        )}
      </View>
    </View>
  );
};
