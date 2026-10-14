import React, { useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { RootStackParamList } from '../navigation/types';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { useAppStore } from '../stores/appStore';
import { isProtectedProjectUnlocked } from '../stores/protectedProjectStorage';
import { generateId } from '../utils/generateId';
import { acceptProposal, projectKnowledge, ProjectKnowledge, THERAPY_CHAT_TITLES } from '../services/projectKnowledge';
import { updateConversationKnowledge } from '../services/projectMemoryUpdater';

type Route = RouteProp<RootStackParamList, 'ProjectKnowledge'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Editable living memories stored inside the project record and its existing PIN encryption. */
export const ProjectKnowledgeScreen: React.FC = () => {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { projectId } = route.params;
  const project = useProjectStore(s => s.projects.find(p => p.id === projectId));
  const conversations = useChatStore(s => s.conversations);
  const chats = conversations.filter(c => c.projectId === projectId && !c.isPrivate);
  const models = useAppStore(s => s.downloadedModels);
  const activeModelId = useAppStore(s => s.activeModelId);
  const knowledge = projectKnowledge(project?.knowledge);
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const [editorText, setEditorText] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [workingChat, setWorkingChat] = useState<string | null>(null);
  const guarded = !!project?.pinVerifier && !isProtectedProjectUnlocked(projectId);

  const write = (updater: (current: ProjectKnowledge) => ProjectKnowledge) => {
    try {
      const current = useProjectStore.getState().getProject(projectId);
      if (!current || (current.pinVerifier && !isProtectedProjectUnlocked(projectId))) {
        Alert.alert('Locked project', 'Unlock the project before editing knowledge.'); return;
      }
      useProjectStore.getState().updateProject(projectId, { knowledge: updater(projectKnowledge(current.knowledge)) });
    } catch (error: any) { Alert.alert('Could not save', error?.message || String(error)); }
  };

  const openEditor = (key: string, content: string) => { setEditorKey(key); setEditorText(content); };
  const saveEdit = () => {
    if (!editorKey) return;
    const key = editorKey;
    const content = editorText.trim().slice(0, key.startsWith('shared:') ? 12000 : 3000);
    write(current => key.startsWith('shared:') ? {
      ...current,
      shared: current.shared.map(d => d.id === key.slice(7) ? { ...d, content, updatedAt: new Date().toISOString() } : d),
    } : {
      ...current,
      chats: { ...current.chats, [key.slice(5)]: {
        chatId: key.slice(5), content, updatedAt: new Date().toISOString(),
        // User editing invalidates any previous automated snapshot.
        lastProcessedMessageId: undefined,
      } },
    });
    setEditorKey(null);
  };
  const addTherapyChats = () => {
    const modelId = activeModelId || models[0]?.id;
    if (!modelId) { Alert.alert('Model required', 'Add a text model before creating chats.'); return; }
    if (project?.pinVerifier) { Alert.alert('Protected project', 'Protected projects cannot hold chats in this version.'); return; }
    const { createConversation } = useChatStore.getState();
    let created = 0;
    for (const title of THERAPY_CHAT_TITLES) {
      if (chats.some(c => c.title === title)) continue;
      createConversation(modelId, title, projectId);
      created++;
    }
    Alert.alert('Therapy chats', created ? `${created} specialized chats created. Each gets its own memory.` : 'All eight therapy chats already exist.');
  };
  const runUpdate = async (chatId: string) => {
    setWorkingChat(chatId);
    try {
      const didUpdate = await updateConversationKnowledge(chatId, true);
      Alert.alert(didUpdate ? 'Memory updated' : 'Nothing to summarize',
        didUpdate ? 'Chat memory saved. Any important cross-chat changes are ready for your review.' : 'This chat needs a completed conversation before it can be summarized.');
    } catch (error: any) { Alert.alert('Memory update unavailable', error?.message || String(error)); }
    finally { setWorkingChat(null); }
  };
  const control = { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 10 } as const;
  const action = { color: colors.primary, fontWeight: '600' as const, fontSize: 13 };
  const muted = { color: colors.textMuted, fontSize: 12 };

  if (!project) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}><Text style={{ color: colors.text }}>Project not found</Text></SafeAreaView>;
  if (guarded) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 24 }}>
    <Text style={{ color: colors.text }}>Unlock this project from its project page before opening its memories.</Text>
    <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingTop: 20 }}><Text style={action}>Go back</Text></TouchableOpacity>
  </SafeAreaView>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back" style={{ padding: 6, marginRight: 12 }}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Project Knowledge</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={{ ...muted, marginBottom: 18 }}>Only chats in this project can read its shared documents. Each chat also has its own living summary.</Text>
        <View style={{ ...control, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Automatic memory updates</Text>
            <Text style={muted}>Off by default. Only meaningful completed conversations are summarized.</Text>
          </View>
          <Switch value={knowledge.autoUpdate} onValueChange={v => write(k => ({ ...k, autoUpdate: v }))}
            trackColor={{ false: colors.border, true: colors.primary }} />
        </View>

        {/therap/i.test(project.name) && (
          <View style={control}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Therapy project starter chats</Text>
            <Text style={{ ...muted, marginVertical: 8 }}>Create eight focused chats. Existing chats won't be duplicated.</Text>
            <TouchableOpacity onPress={addTherapyChats} accessibilityLabel="Create eight therapy chats">
              <Text style={action}>Create missing therapy chats</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginVertical: 14 }}>Shared documents</Text>
        {knowledge.shared.map(doc => (
          <View key={doc.id} style={control}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{doc.title}</Text>
            <Text numberOfLines={3} style={{ ...muted, marginVertical: 8 }}>{doc.content || 'Empty — tap Edit to add knowledge'}</Text>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <TouchableOpacity onPress={() => openEditor(`shared:${doc.id}`, doc.content)} accessibilityLabel={`Edit ${doc.title}`}><Text style={action}>Edit</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert('Delete document?', `Delete ${doc.title}?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => write(k => ({ ...k, shared: k.shared.filter(d => d.id !== doc.id) })) },
              ])}><Text style={{ ...action, color: colors.error }}>Delete</Text></TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ ...control, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TextInput value={newTitle} onChangeText={setNewTitle} placeholder="New shared document title" placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, borderBottomColor: colors.border, borderBottomWidth: 1, flex: 1, padding: 4 }} maxLength={90} />
          <TouchableOpacity onPress={() => {
            const title = newTitle.trim(); if (!title) return;
            if (knowledge.shared.length >= 40) { Alert.alert('Document limit', 'This project can hold up to 40 shared memory documents.'); return; }
            write(k => ({ ...k, shared: [...k.shared, { id: generateId(), title, content: '', updatedAt: new Date().toISOString() }] }));
            setNewTitle('');
          }} accessibilityLabel="Add shared document"><Text style={action}>Add</Text></TouchableOpacity>
        </View>

        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginVertical: 14 }}>Individual chat memories</Text>
        {chats.length === 0 && <Text style={{ ...muted, marginBottom: 20 }}>New chats in this project will get their own memory document automatically.</Text>}
        {chats.map(chat => (
          <View key={chat.id} style={control}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{chat.pinVerifier ? 'Locked conversation' : chat.title}</Text>
            {chat.pinVerifier ? <Text style={muted}>Chat memory is unavailable while this chat is PIN protected.</Text> : <>
              <Text style={{ ...muted, marginVertical: 8 }} numberOfLines={3}>
                {knowledge.chats[chat.id]?.content || 'No summary yet'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
                <TouchableOpacity onPress={() => openEditor(`chat:${chat.id}`, knowledge.chats[chat.id]?.content ?? '')}><Text style={action}>Edit</Text></TouchableOpacity>
                <TouchableOpacity disabled={!!workingChat} onPress={() => runUpdate(chat.id)}>
                  <Text style={action}>{workingChat === chat.id ? 'Summarizing...' : 'Update with AI'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Clear chat memory?', 'The conversation will remain untouched.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => write(k => ({ ...k, chats: { ...k.chats, [chat.id]: { chatId: chat.id, content: '', updatedAt: new Date().toISOString() } } })) },
                ])}><Text style={{ ...action, color: colors.error }}>Clear</Text></TouchableOpacity>
              </View>
            </>}
          </View>
        ))}
        {workingChat && <ActivityIndicator color={colors.primary} style={{ margin: 12 }} />}

        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginVertical: 14 }}>Proposed shared updates ({knowledge.proposals.length})</Text>
        {!knowledge.proposals.length && <Text style={muted}>Important cross-chat changes will appear here for your approval.</Text>}
        {knowledge.proposals.map(proposal => (
          <View key={proposal.id} style={control}>
            <Text style={{ color: colors.text, marginBottom: 10 }}>{proposal.content}</Text>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <TouchableOpacity onPress={() => write(k => acceptProposal(k, proposal.id))}><Text style={action}>Add to Current Progress</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => write(k => ({ ...k, proposals: k.proposals.filter(p => p.id !== proposal.id) }))}><Text style={{ ...action, color: colors.error }}>Dismiss</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      {!!editorKey && <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 14 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Edit memory</Text>
        <TextInput value={editorText} onChangeText={setEditorText} multiline autoFocus
          placeholder="Write concise notes and separate facts from interpretations"
          placeholderTextColor={colors.textMuted} maxLength={editorKey.startsWith('shared:') ? 12000 : 3000} style={{ color: colors.text, minHeight: 130, maxHeight: 210, textAlignVertical: 'top', borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 10 }} />
        <View style={{ flexDirection: 'row', marginTop: 12, gap: 28 }}>
          <TouchableOpacity onPress={() => setEditorKey(null)}><Text style={action}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity onPress={saveEdit}><Text style={action}>Save changes</Text></TouchableOpacity>
        </View>
      </View>}
    </SafeAreaView>
  );
};
