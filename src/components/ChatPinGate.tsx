import React, { useEffect, useState } from 'react';
import { AppState, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useChatStore } from '../stores/chatStore';
import { unlockChat } from '../stores/encryptedChatStorage';
import { useTheme } from '../theme';
import { useNavigation } from '@react-navigation/native';

const unlocked = new Map<string, string>();
let failed = 0;
let cooldownUntil = 0;
AppState.addEventListener('change', state => { if (state !== 'active') unlocked.clear(); });

export function ChatPinGate({ conversationId }: { conversationId?: string | null }) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const verifier = useChatStore(s => s.conversations.find(c => c.id === conversationId)?.pinVerifier);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') { setRevision(v => v + 1); setPin(''); } });
    return () => sub.remove();
  }, []);
  useEffect(() => { setPin(''); setError(''); }, [conversationId]);
  const locked = !!conversationId && !!verifier && unlocked.get(conversationId) !== verifier;
  void revision;
  const submit = async (unlockMatching = false) => {
    if (!conversationId || !verifier || busy) return;
    if (Date.now() < cooldownUntil) { setError('Too many attempts. Try again shortly.'); return; }
    setBusy(true);
    try {
      // Native decryption checks the PIN and authenticates this specific item.
      await unlockChat(conversationId, pin);
      unlocked.set(conversationId, verifier);
      if (unlockMatching) {
        // The same PIN can protect any number of separately encrypted chats;
        // items with different PINs remain locked.
        for (const chat of useChatStore.getState().conversations) {
          if (!chat.pinVerifier || chat.id === conversationId || unlocked.get(chat.id) === chat.pinVerifier) continue;
          try { await unlockChat(chat.id, pin); unlocked.set(chat.id, chat.pinVerifier); } catch { /* different credential */ }
        }
      }
      failed = 0; setPin(''); setError(''); setRevision(v => v + 1);
    } catch {
      failed++;
      if (failed >= 5) { cooldownUntil = Date.now() + 60_000; failed = 0; }
      setError('Incorrect PIN or protected chat could not be opened.'); setPin('');
    } finally { setBusy(false); }
  };
  return <Modal visible={locked} animationType="fade" onRequestClose={() => navigation.goBack()} transparent={false}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 32, gap: 18, backgroundColor: colors.background }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Locked conversation</Text>
      <Text style={{ color: colors.textSecondary }}>Enter this chat's PIN to open it.</Text>
      <TextInput value={pin} onChangeText={v => setPin(v.replace(/\D/g, '').slice(0, 12))} secureTextEntry keyboardType="number-pad" placeholder="4–12 digit PIN" placeholderTextColor={colors.textMuted} style={{ color: colors.text, padding: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.border }} />
      {!!error && <Text style={{ color: colors.error }}>{error}</Text>}
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}><Text style={{ color: colors.text, textAlign: 'center' }}>Back to chats</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy || pin.length < 4} onPress={() => submit(false)} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.background, textAlign: 'center', fontWeight: '700' }}>Unlock this chat</Text>
      </TouchableOpacity>
      <TouchableOpacity disabled={busy || pin.length < 4} onPress={() => submit(true)} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.text, textAlign: 'center' }}>Unlock other chats using the same PIN</Text>
      </TouchableOpacity>
    </View>
  </Modal>;
}
