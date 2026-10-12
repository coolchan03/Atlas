import React, { useEffect, useState } from 'react';
import { AppState, Modal, NativeModules, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useChatStore } from '../stores/chatStore';
import { useTheme } from '../theme';

const unlocked = new Set<string>();
let failed = 0;
let cooldownUntil = 0;
AppState.addEventListener('change', state => { if (state !== 'active') unlocked.clear(); });

export function ChatPinGate({ conversationId }: { conversationId?: string | null }) {
  const { colors } = useTheme();
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
  const locked = !!conversationId && !!verifier && !unlocked.has(conversationId);
  void revision;
  const submit = async () => {
    if (!conversationId || !verifier || busy) return;
    if (Date.now() < cooldownUntil) { setError('Too many attempts. Try again shortly.'); return; }
    const native = NativeModules.AtlasDevice;
    if (!native?.verifyChatPin) { setError('PIN unlock requires the updated Atlas APK.'); return; }
    setBusy(true);
    try {
      if (await native.verifyChatPin(pin, verifier)) {
        unlocked.add(conversationId);
        failed = 0; setPin(''); setError(''); setRevision(v => v + 1);
      } else {
        failed++;
        if (failed >= 5) { cooldownUntil = Date.now() + 60_000; failed = 0; }
        setError('Incorrect PIN'); setPin('');
      }
    } catch { setError('PIN verification unavailable'); }
    finally { setBusy(false); }
  };
  return <Modal visible={locked} animationType="fade" onRequestClose={() => {}} transparent={false}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 32, gap: 18, backgroundColor: colors.background }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Locked conversation</Text>
      <Text style={{ color: colors.textSecondary }}>Enter this chat's PIN to open it.</Text>
      <TextInput value={pin} onChangeText={v => setPin(v.replace(/\D/g, '').slice(0, 12))} secureTextEntry keyboardType="number-pad" placeholder="4–12 digit PIN" placeholderTextColor={colors.textMuted} style={{ color: colors.text, padding: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.border }} />
      {!!error && <Text style={{ color: colors.error }}>{error}</Text>}
      <TouchableOpacity disabled={busy || pin.length < 4} onPress={submit} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.background, textAlign: 'center', fontWeight: '700' }}>Unlock</Text>
      </TouchableOpacity>
    </View>
  </Modal>;
}
