/**
 * One long-press menu for a chat, shared by every chat list (Home recents, Chats tab,
 * project chats): rename, set/remove PIN, archive, delete. Lists call `open(chat)` and
 * render `element` once; the dialogs live here so every list offers the same options.
 */
import React, { useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from './CustomAlert';
import { useTheme } from '../theme';
import { useChatStore, useAppStore } from '../stores';
import { protectChat, permanentlyUnprotectChat } from '../stores/encryptedChatStorage';
import { onnxImageGeneratorService } from '../services';
import type { Conversation } from '../types';

/** Deletes a chat and the images generated in it. */
export function deleteChatAndImages(conversationId: string): void {
  const imageIds = useAppStore.getState().removeImagesByConversationId(conversationId);
  for (const imageId of imageIds) onnxImageGeneratorService.deleteGeneratedImage(imageId).catch(() => {});
  useChatStore.getState().deleteConversation(conversationId);
}

export function useChatOptions(): { open: (c: Conversation) => void; confirmDelete: (c: Conversation) => void; element: React.ReactElement } {
  const { colors } = useTheme();
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [pinTarget, setPinTarget] = useState<Conversation | null>(null);
  const [pinAction, setPinAction] = useState<'set' | 'remove'>('set');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  // CustomAlert closes itself after any button press, so a follow-up dialog opened from a
  // button would be closed at once. Queue it here and show it from onClose instead.
  const nextAlert = useRef<AlertState | null>(null);

  const closePin = () => { setPinTarget(null); setNewPin(''); setNewPin2(''); };
  const savePin = async () => {
    if (!pinTarget || pinBusy) return;
    if (!/^[0-9]{4,12}$/.test(newPin)) { Alert.alert('PIN', 'Enter 4-12 digits.'); return; }
    if (pinAction === 'set' && newPin !== newPin2) { Alert.alert('PIN', 'The two PINs do not match.'); return; }
    setPinBusy(true);
    try {
      // Remove: decrypt, verify a readable plaintext write, then revoke this chat's key.
      if (pinAction === 'remove') await permanentlyUnprotectChat(pinTarget.id, newPin);
      else await protectChat(pinTarget.id, newPin);
      closePin();
    } catch (e: any) { Alert.alert('PIN update failed', String(e?.message ?? e)); }
    finally { setPinBusy(false); }
  };

  const deleteAlert = (conversation: Conversation) => (showAlert(
      'Delete Chat',
      `Delete "${conversation.pinVerifier ? 'Locked conversation' : conversation.title}"? This will also delete all images generated in this chat.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteChatAndImages(conversation.id) },
      ],
    ));
  const confirmDelete = (conversation: Conversation) => setAlertState(deleteAlert(conversation));

  const open = (conversation: Conversation) => {
    const locked = !!conversation.pinVerifier;
    setAlertState(showAlert('Chat options', locked ? 'Locked conversation' : conversation.title, [
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertState(hideAlert()) },
      { text: 'Rename', onPress: () => { setAlertState(hideAlert()); setRenameTitle(conversation.title); setRenameTarget(conversation); } },
      { text: locked ? 'Remove chat PIN' : 'Set chat PIN', onPress: () => {
        setAlertState(hideAlert());
        setPinAction(locked ? 'remove' : 'set');
        setNewPin(''); setNewPin2(''); setPinTarget(conversation);
      } },
      { text: conversation.isArchived ? 'Unarchive' : 'Archive', onPress: () => {
        useChatStore.getState().setConversationArchived(conversation.id, !conversation.isArchived);
        setAlertState(hideAlert());
      } },
      { text: 'Delete', style: 'destructive', onPress: () => { nextAlert.current = deleteAlert(conversation); } },
    ]));
  };

  const box = { backgroundColor: colors.surface, padding: 20, borderRadius: 14, gap: 14 } as const;
  const backdrop = { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' } as const;
  const input = { color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 8 } as const;

  const element = (
    <>
      <Modal visible={!!pinTarget} transparent animationType="fade" onRequestClose={closePin}>
        <View style={backdrop}>
          <View style={box}>
            <Text style={[styles.title, { color: colors.text }]}>{pinAction === 'remove' ? 'Remove chat PIN' : 'Set a chat PIN'}</Text>
            <Text style={{ color: colors.textSecondary }}>{pinAction === 'remove' ? 'Enter the current PIN to permanently remove encryption. The conversation will be saved normally afterward.' : 'Encrypt only this conversation with its own Android Keystore key. You can use the same PIN on other protected chats.'}</Text>
            <TextInput value={newPin} onChangeText={v => setNewPin(v.replace(/\D/g, '').slice(0, 12))} placeholder="4-12 digits" placeholderTextColor={colors.textMuted} secureTextEntry keyboardType="number-pad" style={input} testID="chat-pin-input" />
            {pinAction === 'set' && <TextInput value={newPin2} onChangeText={v => setNewPin2(v.replace(/\D/g, '').slice(0, 12))} placeholder="Type the PIN again" placeholderTextColor={colors.textMuted} secureTextEntry keyboardType="number-pad" style={input} testID="chat-pin-confirm" />}
            {pinAction === 'set' && <Text style={[styles.note, { color: colors.textMuted }]}>If you forget this PIN the chat cannot be recovered.</Text>}
            <View style={styles.buttons}>
              <TouchableOpacity onPress={closePin}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity disabled={pinBusy} onPress={savePin}><Text style={{ color: colors.primary }}>{pinAction === 'remove' ? 'Remove PIN' : 'Set PIN'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <View style={backdrop}>
          <View style={box}>
            <Text style={[styles.title, { color: colors.text }]}>Rename chat</Text>
            <TextInput value={renameTitle} onChangeText={setRenameTitle} maxLength={100} autoFocus selectTextOnFocus style={input} testID="chat-rename-input" />
            <View style={styles.buttons}>
              <TouchableOpacity onPress={() => setRenameTarget(null)}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { if (renameTarget) useChatStore.getState().renameConversation(renameTarget.id, renameTitle); setRenameTarget(null); }}><Text style={{ color: colors.primary }}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => { const next = nextAlert.current; nextAlert.current = null; setAlertState(next ?? hideAlert()); }}
      />
    </>
  );

  return { open, confirmDelete, element };
}

const styles = StyleSheet.create({
  title: { fontSize: 18 },
  note: { fontSize: 12 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
});
