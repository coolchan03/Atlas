import React, { useState, useEffect } from 'react';
import { useWideLayout } from '../hooks/useWideLayout';
import { View, Text, FlatList, TouchableOpacity, Platform, Alert, Modal, TextInput } from 'react-native';
import { protectChat, permanentlyUnprotectChat, unlockChat, onProtectedChatsRelocked } from '../stores/encryptedChatStorage';
import { useChatPrefs, useVaultSession, visibleConversations } from '../atlasTools/chatPrefs';
import { formatWait, pinWaitRemaining, recordPinFailure, recordPinSuccess } from '../services/pinThrottle';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Icon from 'react-native-vector-icons/Feather';
import { AttachStep, useSpotlightTour } from 'react-native-spotlight-tour';
import { IMAGE_NEW_CHAT_STEP_INDEX, IMAGE_DRAW_STEP_INDEX } from '../components/onboarding/spotlightConfig';
import { setPendingSpotlight } from '../components/onboarding/spotlightState';
import { Button } from '../components/Button';
import { ModelSelectorModal } from '../components';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from '../components/CustomAlert';
import { AnimatedEntry } from '../components/AnimatedEntry';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { useFocusTrigger } from '../hooks/useFocusTrigger';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useChatStore, useProjectStore, useAppStore } from '../stores';
import { useActiveTextModel } from '../hooks/useActiveTextModel';
import { onnxImageGeneratorService, activeModelService, llmService, remoteServerManager } from '../services';
import { loadModelWithOverride } from '../services/loadModelWithOverride';
import { Conversation } from '../types';
import { RootStackParamList, MainTabParamList } from '../navigation/types';
type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ChatsTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export const ChatsListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const focusTrigger = useFocusTrigger();
  const { colors } = useTheme();
  const wide = useWideLayout();
  const styles = useThemedStyles(createStyles);
  const conversations = useChatStore(s => s.conversations);
  const { deleteConversation, setActiveConversation, setConversationArchived } = useChatStore.getState();
  const [showArchived, setShowArchived] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [pinTarget, setPinTarget] = useState<Conversation | null>(null);
  const [pinAction, setPinAction] = useState<'set' | 'remove'>('set');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const hideLocked = useChatPrefs(s => s.hideLockedChats);
  const vaultOpen = useVaultSession(s => s.open);
  const setVaultOpen = useVaultSession(s => s.setOpen);
  const [vaultPrompt, setVaultPrompt] = useState(false);
  const [vaultPin, setVaultPin] = useState('');
  const [vaultError, setVaultError] = useState('');
  useEffect(() => onProtectedChatsRelocked(() => setVaultOpen(false)), [setVaultOpen]);
  /** Opens the hidden vault: unlocks every locked chat that uses this PIN. */
  const openVault = async () => {
    const wait = await pinWaitRemaining('chat');
    if (wait > 0) { setVaultError(`Too many wrong PINs. Try again in ${formatWait(wait)}.`); return; }
    let opened = 0;
    for (const chat of useChatStore.getState().conversations.filter(c => c.pinVerifier)) {
      try { await unlockChat(chat.id, vaultPin); opened++; } catch { /* other PIN */ }
    }
    setVaultPin('');
    if (!opened) {
      // Same answer for "no chats" and "wrong PIN", so the vault cannot be probed.
      const next = await recordPinFailure('chat');
      setVaultError(next > 0 ? `Nothing opened. Wait ${formatWait(next)}.` : 'Nothing opened with that PIN.');
      return;
    }
    await recordPinSuccess('chat');
    setVaultError(''); setVaultPrompt(false); setVaultOpen(true);
  };
  const savePin = async () => {
    if (!pinTarget || pinBusy) return;
    if (!/^[0-9]{4,12}$/.test(newPin)) { Alert.alert('PIN', 'Enter 4–12 digits.'); return; }
    if (pinAction === 'set' && newPin !== newPin2) { Alert.alert('PIN', 'The two PINs do not match.'); return; }
    setPinBusy(true);
    try {
      if (pinAction === 'remove') {
        // Decrypt, verify a readable plaintext write, then revoke this chat's key.
        await permanentlyUnprotectChat(pinTarget.id, newPin);
      } else {
        await protectChat(pinTarget.id, newPin);
      }
      setPinTarget(null); setNewPin(''); setNewPin2('');
    } catch (e: any) { Alert.alert('PIN update failed', String(e?.message ?? e)); }
    finally { setPinBusy(false); }
  };
  const { getProject } = useProjectStore();
  const activeImageModelId = useAppStore(s => s.activeImageModelId);
  const onboardingChecklist = useAppStore(s => s.onboardingChecklist);
  const shownSpotlights = useAppStore(s => s.shownSpotlights);
  const { removeImagesByConversationId, markSpotlightShown } = useAppStore.getState();
  const { modelId: activeTextModelId } = useActiveTextModel();
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [pendingPrivateChat, setPendingPrivateChat] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const { goTo } = useSpotlightTour();

  // Reactive: image model loaded → spotlight "New Chat" button (step 14)
  useEffect(() => {
    if (
      activeImageModelId &&
      !shownSpotlights.imageNewChat &&
      !onboardingChecklist.triedImageGen
    ) {
      markSpotlightShown('imageNewChat');
      // Queue step 15 so ChatScreen picks it up when "New Chat" is tapped
      setPendingSpotlight(IMAGE_DRAW_STEP_INDEX);
      setTimeout(() => goTo(IMAGE_NEW_CHAT_STEP_INDEX), 800);
    }
  }, [activeImageModelId, shownSpotlights, onboardingChecklist.triedImageGen, markSpotlightShown, goTo]);

  const hasModels = !!activeTextModelId || !!activeImageModelId;

  const handleChatPress = (conversation: Conversation) => {
    setActiveConversation(conversation.id);
    navigation.navigate('Chat', { conversationId: conversation.id });
  };

  const startNewChat = (privateChat: boolean) => {
    setPendingPrivateChat(privateChat);
    if (hasModels) {
      navigation.navigate('Chat', { privateChat });
      return;
    }
    setShowModelSelector(true);
  };

  const handleNewChat = () => {
    Alert.alert('New conversation', 'Choose whether this chat should be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Regular chat', onPress: () => startNewChat(false) },
      { text: 'Private (not saved)', onPress: () => startNewChat(true) },
    ]);
  };

  const handleSelectTextModel = async (model: any) => {
    // Shared inline Load-Anyway flow: a memory-blocked load offers "Load Anyway"
    // here just like the chat screen (was a dead-end "Failed to load model").
    await loadModelWithOverride(
      (opts) => activeModelService.loadTextModel(model.id, undefined, opts),
      {
        setAlertState,
        onAttemptStart: () => setIsModelLoading(true),
        onAttemptEnd: () => setIsModelLoading(false),
        onSuccess: () => { setShowModelSelector(false); navigation.navigate('Chat', { privateChat: pendingPrivateChat }); },
      },
    );
  };

  const handleSelectImageModel = async (model: any) => {
    await loadModelWithOverride(
      (opts) => activeModelService.loadImageModel(model.id, undefined, opts),
      {
        setAlertState,
        onAttemptStart: () => setIsModelLoading(true),
        onAttemptEnd: () => setIsModelLoading(false),
        onSuccess: () => { setShowModelSelector(false); navigation.navigate('Chat', { privateChat: pendingPrivateChat }); },
      },
    );
  };

  const handleUnloadTextModel = async () => {
    setIsModelLoading(true);
    try {
      remoteServerManager.clearActiveRemoteModel();
      if (llmService.isModelLoaded()) {
        await activeModelService.unloadTextModel();
      }
    } finally {
      setIsModelLoading(false);
    }
  };

  const handleUnloadImageModel = async () => {
    setIsModelLoading(true);
    try {
      await activeModelService.unloadImageModel();
    } finally {
      setIsModelLoading(false);
    }
  };

  const handleDeleteChat = (conversation: Conversation) => {
    setAlertState(showAlert(
      'Delete Chat',
      `Delete "${conversation.title}"? This will also delete all images generated in this chat.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setAlertState(hideAlert());
            const imageIds = removeImagesByConversationId(conversation.id);
            for (const imageId of imageIds) {
              onnxImageGeneratorService.deleteGeneratedImage(imageId).catch(() => {});
            }
            deleteConversation(conversation.id);
          },
        },
      ]
    ));
  };

  const handleChatLongPress = (conversation: Conversation) => {
    setAlertState(showAlert('Chat options', conversation.title, [
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertState(hideAlert()) },
      { text: 'Rename', onPress: () => { setAlertState(hideAlert()); setRenameTitle(conversation.title); setRenameTarget(conversation); } },
      { text: conversation.pinVerifier ? 'Remove chat PIN' : 'Set chat PIN', onPress: () => {
        setAlertState(hideAlert());
        setPinAction(conversation.pinVerifier ? 'remove' : 'set');
        setNewPin(''); setPinTarget(conversation);
      } },
      { text: conversation.isArchived ? 'Unarchive' : 'Archive', onPress: () => {
        setConversationArchived(conversation.id, !conversation.isArchived);
        setAlertState(hideAlert());
      } },
      { text: 'Delete', style: 'destructive', onPress: () => { setAlertState(hideAlert()); handleDeleteChat(conversation); } },
    ]));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } 
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    
  };

  const renderRightActions = (conversation: Conversation) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => handleDeleteChat(conversation)}
    >
      <Icon name="trash-2" size={16} color={colors.error} />
    </TouchableOpacity>
  );

  const renderChat = ({ item, index }: { item: Conversation; index: number }) => {
    const project = item.projectId ? getProject(item.projectId) : null;
    const lastMessage = item.messages[item.messages.length - 1];

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
        containerStyle={styles.swipeableContainer}
      >
        <AnimatedListItem
          index={index}
          trigger={focusTrigger}
          style={styles.chatItem}
          onPress={() => handleChatPress(item)}
          onLongPress={() => handleChatLongPress(item)}
          testID={`conversation-item-${index}`}
        >
          <View style={styles.chatContent}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle} numberOfLines={1}>
                {item.pinVerifier ? 'Locked conversation' : item.title}
              </Text>
              <Text style={styles.chatDate}>{formatDate(item.updatedAt)}</Text>
            </View>
            {!!item.pinVerifier ? <Text style={styles.chatPreview}>PIN required</Text> : lastMessage && (
              <Text style={styles.chatPreview} numberOfLines={1}>
                {lastMessage.role === 'user' ? 'You: ' : ''}{lastMessage.content}
              </Text>
            )}
            {project && (
              <View style={styles.projectBadge}>
                <Text style={styles.projectBadgeText}>{project.name}</Text>
              </View>
            )}
          </View>
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        </AnimatedListItem>
      </Swipeable>
    );
  };

  // Sort conversations by updatedAt (most recent first)
  const sortedConversations = visibleConversations(conversations, hideLocked, vaultOpen).filter(c => !!c.isArchived === showArchived).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          // Long-press the title to open hidden PIN-locked chats (the "vault").
          onLongPress={() => { if (vaultOpen) { setVaultOpen(false); return; } setVaultError(''); setVaultPin(''); setVaultPrompt(true); }}
          delayLongPress={600}
          activeOpacity={1}
          accessibilityHint="Long press to open or close locked chats">
          <Text style={styles.title}>{showArchived ? 'Archived chats' : vaultOpen && hideLocked ? 'Chats + vault' : 'Chats'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowArchived(v => !v)} accessibilityLabel={showArchived ? 'Show current chats' : 'Show archived chats'} style={{ padding: 8 }}>
          <Icon name={showArchived ? 'inbox' : 'archive'} size={19} color={colors.textMuted} />
        </TouchableOpacity>
        <AttachStep index={[2, 14]}>
          <Button
            title="New"
            variant="primary"
            size="small"
            onPress={handleNewChat}
            icon={<Icon name="plus" size={16} color={colors.primary} />}
          />
        </AttachStep>
      </View>

      {sortedConversations.length === 0 ? (
        <View style={styles.emptyState}>
          <AnimatedEntry index={0} staggerMs={60} trigger={focusTrigger}>
            <View style={styles.emptyIcon}>
              <Icon name="message-circle" size={32} color={colors.textMuted} />
            </View>
          </AnimatedEntry>
          <AnimatedEntry index={1} staggerMs={60} trigger={focusTrigger}>
            <Text style={styles.emptyTitle}>No Chats Yet</Text>
          </AnimatedEntry>
          <AnimatedEntry index={2} staggerMs={60} trigger={focusTrigger}>
            <Text style={styles.emptyText}>
              {hasModels
                ? 'Start a new conversation to begin chatting with your local AI.'
                : 'Download a model from the Models tab to start chatting.'}
            </Text>
          </AnimatedEntry>
          {hasModels && (
            <AnimatedListItem index={3} staggerMs={60} trigger={focusTrigger} hapticType="impactLight" style={styles.emptyButton} onPress={handleNewChat}>
              <Icon name="plus" size={18} color={colors.primary} />
              <Text style={styles.emptyButtonText}>New Chat</Text>
            </AnimatedListItem>
          )}
        </View>
      ) : (
        <FlatList
          data={sortedConversations}
          renderItem={renderChat}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, wide.column]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== 'android'}
          testID="conversation-list"
        />
      )}
      <Modal visible={!!pinTarget} transparent animationType="fade" onRequestClose={() => setPinTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 14, gap: 14 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{pinAction === 'remove' ? 'Remove chat PIN' : 'Set a chat PIN'}</Text>
            <Text style={{ color: colors.textSecondary }}>{pinAction === 'remove' ? 'Enter the current PIN to permanently remove encryption. The conversation will be saved normally afterward.' : 'Encrypt only this conversation with its own Android Keystore key. You can use the same PIN on other protected chats.'}</Text>
            <TextInput value={newPin} onChangeText={v => setNewPin(v.replace(/\D/g, '').slice(0, 12))} placeholder="4–12 digits" placeholderTextColor={colors.textMuted} secureTextEntry keyboardType="number-pad" style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 8 }} />
            {pinAction === 'set' && <TextInput value={newPin2} onChangeText={v => setNewPin2(v.replace(/\D/g, '').slice(0, 12))} placeholder="Type the PIN again" placeholderTextColor={colors.textMuted} secureTextEntry keyboardType="number-pad" style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 8 }} />}
            {pinAction === 'set' && <Text style={{ color: colors.textMuted, fontSize: 12 }}>If you forget this PIN the chat cannot be recovered.</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
              <TouchableOpacity onPress={() => { setPinTarget(null); setNewPin(''); setNewPin2(''); }}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity disabled={pinBusy} onPress={savePin}><Text style={{ color: colors.primary, fontWeight: '700' }}>{pinAction === 'remove' ? 'Remove PIN' : 'Set PIN'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={vaultPrompt} transparent animationType="fade" onRequestClose={() => setVaultPrompt(false)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 14, gap: 14 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Enter PIN</Text>
            <TextInput value={vaultPin} onChangeText={v => setVaultPin(v.replace(/\D/g, '').slice(0, 12))} placeholder="4–12 digits" placeholderTextColor={colors.textMuted} secureTextEntry keyboardType="number-pad" autoFocus style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 8 }} />
            {!!vaultError && <Text style={{ color: colors.error }}>{vaultError}</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
              <TouchableOpacity onPress={() => setVaultPrompt(false)}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity disabled={vaultPin.length < 4} onPress={openVault}><Text style={{ color: colors.primary, fontWeight: '700' }}>Open</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 14, gap: 14 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Rename chat</Text>
            <TextInput value={renameTitle} onChangeText={setRenameTitle} maxLength={100} autoFocus selectTextOnFocus style={{ color: colors.text, borderWidth: 1, borderColor: colors.textMuted, borderRadius: 8, padding: 10 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18 }}>
              <TouchableOpacity onPress={() => setRenameTarget(null)}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { if (renameTarget) useChatStore.getState().renameConversation(renameTarget.id, renameTitle); setRenameTarget(null); }}><Text style={{ color: colors.primary, fontWeight: '600' }}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState(hideAlert())}
      />
      <ModelSelectorModal
        visible={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        onSelectModel={handleSelectTextModel}
        onSelectImageModel={handleSelectImageModel}
        onUnloadModel={handleUnloadTextModel}
        onUnloadImageModel={handleUnloadImageModel}
        isLoading={isModelLoading}
        onAddServer={() => {
          setShowModelSelector(false);
          navigation.navigate('RemoteServers');
        }}
        onBrowseModels={(tab) => {
          setShowModelSelector(false);
          navigation.navigate('ModelsTab', { initialTab: tab });
        }}
        onSelectionComplete={() => {
          setShowModelSelector(false);
          navigation.navigate('Chat', {});
        }}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  swipeableContainer: {
    overflow: 'visible' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.small,
    zIndex: 1,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  list: {
    padding: SPACING.lg,
  },
  chatItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 10,
    marginBottom: SPACING.md,
    ...shadows.small,
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  chatTitle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  chatDate: {
    ...TYPOGRAPHY.metaSmall,
    color: colors.textMuted,
  },
  chatPreview: {
    ...TYPOGRAPHY.meta,
    color: colors.textSecondary,
    marginTop: 1,
  },
  projectBadge: {
    alignSelf: 'flex-start' as const,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 4,
    marginTop: SPACING.sm - 2,
  },
  projectBadgeText: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.xxl + SPACING.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: SPACING.xl - SPACING.xs,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: SPACING.xl - SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    gap: SPACING.sm,
  },
  emptyButtonText: {
    ...TYPOGRAPHY.body,
    color: colors.primary,
  },
  deleteAction: {
    backgroundColor: colors.errorBackground,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 44,
    borderRadius: 10,
    marginBottom: SPACING.md,
    marginLeft: SPACING.sm,
  },
});
