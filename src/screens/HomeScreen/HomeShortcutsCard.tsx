import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { useAppStore } from '../../stores/appStore';
import { useChatStore } from '../../stores/chatStore';
import { useRemoteServerStore } from '../../stores/remoteServerStore';
import { useAgentStore } from '../../stores/agentStore';
import { useProjectStore } from '../../stores/projectStore';
import { UndoRow, useUndo } from '../../components/UndoRow';
import { useTopics } from '../../topics/store';
import { useUiModeStore } from '../../stores/uiModeStore';
import { activeModelService } from '../../services/activeModelService';
import { instrumentalPlayer } from '../../music/backgroundPlayer';
import { useAtlasVoiceStore } from '../../atlasVoice/store';
import { ttsAvailable } from '../../atlasVoice/tts';
import { useVoiceProfiles } from '../../atlasVoice/profiles';
import { CHAT_TONES, type ChatTonePreset } from '../../services/chatTone';
import { MusicPlayerWidget } from './MusicPlayerWidget';
import { LearningReliabilityWidget } from './LearningReliabilityWidget';
import { ReadAloudWidget } from './ReadAloudWidget';
import { selectResumeConversation, shortcutDestination, useHomeShortcuts, type HomeShortcut, type HomeWidgetAction } from './homeShortcutStore';

type Choice = { id: string; label: string };
type Details = Omit<HomeShortcut, 'id'>;
const initial = (): Details => ({ title: '', action: 'call', tone: 'balanced' });
const WIDGET_ACTIONS: Array<{ id: HomeWidgetAction; label: string }> = [
  { id: 'call', label: 'Call an agent' },
  { id: 'resume-last', label: 'Resume last chat' },
  { id: 'resume-most', label: 'Resume most-used chat' },
  { id: 'chat', label: 'Open a chat' },
  { id: 'model-picker', label: 'Load a model' },
  { id: 'music-player', label: 'Music player' },
  { id: 'music-studio', label: 'Music Studio' },
  { id: 'learning-status', label: 'Learning progress' },
  { id: 'learning', label: 'Teach the AI' },
  { id: 'daily-brief', label: 'Daily briefing' },
  { id: 'recorder', label: 'Voice recorder' },
  { id: 'compass', label: 'Compass / Level' },
  { id: 'read-aloud', label: 'Read text aloud' },
  { id: 'course', label: 'Open a course board' },
  { id: 'project', label: 'Open a project' },
  { id: 'practice', label: 'Practice a project' },
];
const actionLabel = (action: HomeWidgetAction | undefined) => WIDGET_ACTIONS.find((a) => a.id === (action || 'chat'))?.label || 'Open chat';
const inChat = (action?: HomeWidgetAction) => action === 'call' || action === 'chat' || !action;

/** Widgets that simply open one screen. */
const SCREEN_FOR_ACTION: Partial<Record<HomeWidgetAction, string>> = {
  'music-studio': 'MusicStudio',
  'music-player': 'MusicStudio',
  'learning-status': 'LearningReliability',
  learning: 'TeachList',
  'daily-brief': 'DailyBrief',
  recorder: 'Recorder',
  compass: 'Compass',
  'read-aloud': 'ReadAloud',
};

/** Title and message for the first reason a chat widget cannot start, or null when it can. */
function launchProblem(
  shortcut: HomeShortcut,
  destination: ReturnType<typeof shortcutDestination>,
  app: { activeModelId: string | null; downloadedModels: Array<{ id: string }> },
): [string, string] | null {
  if (destination === 'locked') return ['Unlock first', 'Open the PIN-locked chat normally before using a widget.'];
  if (shortcut.conversationId && destination !== 'existing') return ['Chat not available', 'This widget points to a removed or private chat. Edit it to choose another.'];
  if (!(shortcut.modelId || app.activeModelId) && destination !== 'existing') return ['Select a model', 'Load a text model first in the Models tab.'];
  if (shortcut.modelId && !app.downloadedModels.some((m) => m.id === shortcut.modelId)) return ['Model missing', 'The selected model is not installed. Edit this widget or reinstall the model.'];
  return null;
}

/** One tap means the model this call uses is loaded before the call opens (a resumed chat keeps its own model). */
async function loadCallModel(shortcut: HomeShortcut, resumedModel: string | undefined, fallback: string) {
  const loadId = shortcut.modelId || resumedModel || fallback;
  if (loadId) await activeModelService.loadTextModel(loadId);
  // An explicitly chosen on-device model must not be shadowed by a previously active remote model.
  if (shortcut.modelId && !shortcut.conversationId) useRemoteServerStore.getState().setActiveRemoteTextModelId(null);
}

/** Home widgets are configured within Atlas; never create Android launcher tiles or shortcuts. */
export function HomeShortcutsCard({ navigation }: { navigation: any }) {
  const { colors } = useTheme();
  const shortcuts = useHomeShortcuts((s) => s.shortcuts);
  const { addShortcut, removeShortcut, updateShortcut } = useHomeShortcuts.getState();
  const agents = useAgentStore((s) => s.agents);
  const projects = useProjectStore((s) => s.projects);
  const voices = useVoiceProfiles((s) => s.profiles);
  const localModels = useAppStore((s) => s.downloadedModels);
  const activeModelId = useAppStore((s) => s.activeModelId);
  const conversations = useChatStore((s) => s.conversations);
  const courses = useTopics((s) => s.courses);
  const undo = useUndo();
  const [open, setOpen] = useState(false);
  const [launchingId, setLaunchingId] = useState('');
  const [draft, setDraft] = useState<Details>(initial);
  const [editingId, setEditingId] = useState('');
  const update = (change: Partial<Details>) => setDraft((d) => ({ ...d, ...change }));
  const openScreen = (screen: string, params?: Record<string, string>) => navigation.getParent()?.navigate(screen, params);
  const goToChat = (id: string, call: boolean) => {
    const chats = useChatStore.getState();
    chats.setActiveConversation(id);
    if (call) {
      // Do not feed instrumental background audio back into a hands-free call.
      instrumentalPlayer.pause();
      useAtlasVoiceStore.getState().setHandsFree(true);
      useUiModeStore.getState().setInterfaceMode('audio');
    } else useUiModeStore.getState().setInterfaceMode('chat');
    openScreen('Chat', { conversationId: id });
  };
  const select = ({ caption, value, setter, choices }: { caption: string; value: string | undefined; setter: (id: string | undefined) => void; choices: Choice[] }) => (
    <View style={styles.selector}>
      <Text style={[styles.caption, { color: colors.textSecondary }]}>{caption}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {choices.map((choice) => {
          const selected = (value || '') === choice.id;
          return (
            <TouchableOpacity key={`${caption}-${choice.id}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setter(choice.id || undefined)}
              style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.background }]}>
              <Text style={{ color: selected ? colors.background : colors.text }}>{choice.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
  const openChatWidget = async (shortcut: HomeShortcut) => {
    const chats = useChatStore.getState();
    const app = useAppStore.getState();
    const startCall = shortcut.action === 'call';
    if (startCall && !ttsAvailable()) { Alert.alert('Voice unavailable', 'The Android speech engine is not available in this build.'); return; }
    const destination = shortcutDestination(shortcut.conversationId, chats.conversations, false);
    const problem = launchProblem(shortcut, destination, app);
    if (problem) { Alert.alert(problem[0], problem[1]); return; }
    const modelId = shortcut.modelId || app.activeModelId || '';
    const existing = destination === 'existing';
    if (startCall) {
      setLaunchingId(shortcut.id);
      await loadCallModel(shortcut, existing ? chats.conversations.find((c) => c.id === shortcut.conversationId)?.modelId : undefined, modelId);
    }
    const id = existing && shortcut.conversationId
      ? shortcut.conversationId
      : chats.createConversation(modelId, shortcut.title || 'New conversation', shortcut.projectId);
    // Preserve a resumed chat's own model unless a new chat is being created.
    if (shortcut.modelId && !existing) app.setActiveModelId(shortcut.modelId);
    if (shortcut.agentId !== undefined) chats.setConversationAgent(id, shortcut.agentId);
    if (shortcut.projectId && existing) chats.setConversationProject(id, shortcut.projectId);
    if (shortcut.voiceProfileId !== undefined) chats.setConversationVoiceProfile(id, shortcut.voiceProfileId);
    if (shortcut.tone) chats.setConversationTone(id, shortcut.tone);
    goToChat(id, startCall);
  };
  const launch = async (shortcut: HomeShortcut) => {
    if (launchingId) return;
    try {
      const action = shortcut.action || 'chat';
      const screen = SCREEN_FOR_ACTION[action];
      if (screen) { openScreen(screen); return; }
      if (action === 'course' && shortcut.courseId) { openScreen('TopicBoard', { courseId: shortcut.courseId }); return; }
      if (action === 'project' && shortcut.projectId) { openScreen('ProjectDetail', { projectId: shortcut.projectId }); return; }
      if (action === 'practice') { openScreen('Practice', shortcut.projectId ? { projectId: shortcut.projectId } : undefined); return; }
      if (action === 'model-picker') { navigation.navigate('ModelsTab', { initialTab: 'text' }); return; }
      if (action === 'resume-last' || action === 'resume-most') {
        const chats = useChatStore.getState();
        const chat = selectResumeConversation(chats.conversations, action, chats.activeConversationId);
        if (chat) goToChat(chat.id, false);
        else Alert.alert('No available chat', 'Start an unlocked, non-private chat first.');
        return;
      }
      await openChatWidget(shortcut);
    } catch (error: any) { Alert.alert('Could not open widget', String(error?.message || error)); }
    finally { setLaunchingId(''); }
  };
  const startEdit = (widget: HomeShortcut) => {
    const { id, ...rest } = widget;
    setDraft(rest); setEditingId(id); setOpen(true);
  };
  const closeEditor = () => { setDraft(initial()); setEditingId(''); setOpen(false); };
  const add = () => {
    if (!draft.title?.trim()) { Alert.alert('Name the widget', 'Choose a short name such as Call my assistant.'); return; }
    if (draft.action === 'call' && !draft.conversationId && !draft.modelId && !activeModelId) {
      Alert.alert('Choose a model', 'Pick a downloaded model, or load the current model first.'); return;
    }
    if (draft.action === 'course' && !draft.courseId) { Alert.alert('Choose a course', 'Pick the course this widget opens.'); return; }
    if (draft.action === 'project' && !draft.projectId) { Alert.alert('Choose a project', 'Pick the project this widget opens.'); return; }
    if (editingId) updateShortcut(editingId, draft); else addShortcut(draft);
    closeEditor();
  };
  const summaries: Choice[] = conversations.filter((c) => !c.isPrivate && !c.pinVerifier && !c.protectedBlob && !c.isArchived)
    .slice().sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, 12).map((c) => ({ id: c.id, label: c.title.slice(0, 22) }));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="home-custom-shortcuts">
      <View style={styles.top}>
        <Icon name="sliders" size={18} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.text }]}>My home widgets</Text>
        <TouchableOpacity onPress={() => (open ? closeEditor() : setOpen(true))} accessibilityRole="button" testID="home-add-shortcut">
          <Text style={{ color: colors.primary }}>{open ? 'Cancel' : '+ Add widget'}</Text>
        </TouchableOpacity>
      </View>
      {!shortcuts.length && !open && (
        <Text style={[styles.small, { color: colors.textSecondary }]}>Add as many call buttons as you like, each with its own agent, model, project and chat. Or resume a chat, or control instrumental music . Everything stays within Atlas.</Text>
      )}
      {shortcuts.map((widget) => {
        const agent = agents.find((a) => a.id === widget.agentId)?.name || 'Default assistant';
        const voice = voices.find((v) => v.id === widget.voiceProfileId)?.name;
        const isMusicPlayer = widget.action === 'music-player';
        const isLearning = widget.action === 'learning-status';
        const isReader = widget.action === 'read-aloud';
        return (
          <View key={widget.id} style={[styles.savedRow, { borderTopColor: colors.border }]}>
            <View style={styles.flex}>
              <TouchableOpacity accessibilityRole="button" onPress={() => launch(widget)} testID={`launch-shortcut-${widget.id}`}>
                <Text style={[styles.widgetTitle, { color: colors.text }]}>{widget.title}{launchingId === widget.id ? ' · Loading model…' : ''}</Text>
                <Text style={[styles.small, { color: colors.textSecondary }]}>{inChat(widget.action)
                  ? [widget.action === 'call' ? 'Call' : 'Chat', agent, localModels.find((m) => m.id === widget.modelId)?.name, projects.find((p) => p.id === widget.projectId)?.name,
                    widget.conversationId ? (conversations.find((c) => c.id === widget.conversationId)?.title.slice(0, 22) ?? 'chat removed') : undefined, voice].filter(Boolean).join(' · ')
                  : [actionLabel(widget.action), widget.action === 'course' ? courses.find((c) => c.id === widget.courseId)?.title : undefined,
                    widget.action === 'project' || widget.action === 'practice' ? projects.find((p) => p.id === widget.projectId)?.name : undefined].filter(Boolean).join(' · ')}</Text>
              </TouchableOpacity>
              {isMusicPlayer && <MusicPlayerWidget openStudio={() => openScreen('MusicStudio')}/>}
              {isLearning && <LearningReliabilityWidget openLearning={() => openScreen('LearningReliability')}/>}
              {isReader && <ReadAloudWidget openReader={() => openScreen('ReadAloud')}/>}
            </View>
            {(inChat(widget.action) || ['course', 'project', 'practice'].includes(widget.action ?? '')) && <TouchableOpacity onPress={() => startEdit(widget)} accessibilityLabel={`Edit ${widget.title}`} testID={`edit-shortcut-${widget.id}`}><Icon name="edit-2" size={18} color={colors.textMuted} /></TouchableOpacity>}
            <TouchableOpacity onPress={() => {
              const index = shortcuts.findIndex((x) => x.id === widget.id);
              undo.remove(widget.title, () => removeShortcut(widget.id), () => useHomeShortcuts.setState((s) => ({ shortcuts: [...s.shortcuts.slice(0, index), widget, ...s.shortcuts.slice(index)] })));
            }} accessibilityLabel={`Remove ${widget.title}`}><Icon name="x" size={18} color={colors.textMuted} /></TouchableOpacity>
          </View>
        );
      })}
      <UndoRow pending={undo.pending} undo={undo.undo} />
      {open && (
        <View testID="home-shortcut-editor">
          <TextInput value={draft.title} onChangeText={(title) => update({ title })} placeholder="Widget name" placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          {select({ caption: 'Widget type', value: draft.action || 'call', choices: WIDGET_ACTIONS,
            setter: (action) => update({ action: (action || 'call') as HomeWidgetAction, conversationId: undefined }) })}
          {inChat(draft.action) && <>
            {inChat(draft.action) && select({ caption: draft.action === 'call' ? 'Chat to call in' : 'Chat to open', value: draft.conversationId, setter: (conversationId) => update({ conversationId }), choices: [{ id: '', label: draft.action === 'call' ? 'New chat each time' : 'New chat' }, ...summaries] })}
            {draft.action === 'call' && <Text style={[styles.small, { color: colors.textSecondary }]}>Starts a hands-free call with this agent, model, project and chat. Make as many call buttons as you want. You can hang up and return to the conversation later.</Text>}
            {select({ caption: 'Agent', value: draft.agentId, setter: (agentId) => update({ agentId }),
              choices: [{ id: '', label: 'Default agent' }, ...agents.filter((a) => a.id !== 'talk' && a.id !== 'field-id').map((a) => ({ id: a.id, label: a.name }))] })}
            {select({ caption: 'Project', value: draft.projectId, setter: (projectId) => update({ projectId }), choices: [{ id: '', label: 'None' }, ...projects.map((p) => ({ id: p.id, label: p.name }))] })}
            {select({ caption: 'Text model', value: draft.modelId, setter: (modelId) => update({ modelId }),
              choices: [{ id: '', label: `Current model${activeModelId ? '' : ' (none loaded)'}` }, ...localModels.map((m) => ({ id: m.id, label: m.name }))] })}
            {select({ caption: 'Voice', value: draft.voiceProfileId, setter: (voiceProfileId) => update({ voiceProfileId }), choices: [{ id: '', label: 'Default/agent voice' }, ...voices.map((v) => ({ id: v.id, label: v.name }))] })}
            {select({ caption: 'Conversation style', value: draft.tone, setter: (tone) => update({ tone: (tone || 'balanced') as ChatTonePreset }), choices: CHAT_TONES.map((t) => ({ id: t.id, label: t.name })) })}
          </>}
          {draft.action === 'course' && select({ caption: 'Course', value: draft.courseId, setter: (courseId) => update({ courseId }), choices: courses.map((c) => ({ id: c.id, label: c.title.slice(0, 26) })) })}
          {(draft.action === 'project' || draft.action === 'practice') && select({ caption: 'Project', value: draft.projectId, setter: (projectId) => update({ projectId }),
            choices: [...(draft.action === 'practice' ? [{ id: '', label: 'All projects' }] : []), ...projects.map((p) => ({ id: p.id, label: p.name }))] })}
          {draft.action === 'resume-most' && <Text style={[styles.small, { color: colors.textSecondary }]}>Uses the number of your sent messages to find your most-used unlocked chat. No message content is inspected.</Text>}
          {draft.action === 'resume-last' && <Text style={[styles.small, { color: colors.textSecondary }]}>Opens your last active unlocked chat, or the most recently updated one.</Text>}
          <TouchableOpacity accessibilityRole="button" style={[styles.save, { borderColor: colors.primary }]} onPress={add} testID="home-save-shortcut">
            <Text style={[styles.centered, { color: colors.primary }]}>{editingId ? 'Save changes' : 'Add to Atlas home'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 10 },
  top: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  heading: { flex: 1, fontSize: 16, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  savedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: 1, paddingVertical: 10, marginTop: 8 },
  flex: { flex: 1 },
  widgetTitle: { fontSize: 14, fontWeight: '600' },
  centered: { textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 12 },
  selector: { marginTop: 10 },
  caption: { fontSize: 12, marginBottom: 5 },
  chips: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  save: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, marginTop: 14 },
});
