import React, { useEffect, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { setScreenSecure } from '../atlasTools/screenSecure';
import { useNavigation } from '@react-navigation/native';
import { useProjectStore } from '../stores/projectStore';
import { isProtectedProjectUnlocked, unlockProject } from '../stores/protectedProjectStorage';
import { formatWait, pinWaitRemaining, recordPinFailure, recordPinSuccess } from '../services/pinThrottle';

/** Metadata-only project vault gate. Projects with documents/chats cannot yet
 * be protected; the protect action checks this before encryption. */
export function ProjectPinGate({ projectId }: { projectId: string }) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const project = useProjectStore(s => s.projects.find(p => p.id === projectId));
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  void revision;
  const locked = !!project?.pinVerifier && !isProtectedProjectUnlocked(projectId);
  const protectedProject = !!project?.pinVerifier;
  useEffect(() => {
    setScreenSecure('project-pin', protectedProject);
    return () => setScreenSecure('project-pin', false);
  }, [protectedProject]);
  const submit = async () => {
    if (busy || pin.length < 4) return;
    const wait = await pinWaitRemaining('project');
    if (wait > 0) { setError(`Too many wrong PINs. Try again in ${formatWait(wait)}.`); return; }
    setBusy(true);
    try {
      await unlockProject(projectId, pin);
      await recordPinSuccess('project');
      setPin(''); setError(''); setRevision(v => v + 1);
    } catch {
      const next = await recordPinFailure('project');
      setError(next > 0 ? `Incorrect PIN. Wait ${formatWait(next)} before trying again.` : 'Incorrect PIN or encrypted project could not be opened.');
      setPin('');
    } finally { setBusy(false); }
  };
  return <Modal visible={locked} transparent={false} animationType="fade" onRequestClose={() => navigation.goBack()}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 14, backgroundColor: colors.background }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Protected project</Text>
      <Text style={{ color: colors.textSecondary }}>Enter this project's PIN. You can use the same PIN for multiple individually protected projects and chats.</Text>
      <TextInput secureTextEntry keyboardType="number-pad" value={pin} onChangeText={v => setPin(v.replace(/\D/g,'').slice(0,12))}
        placeholder="4–12 digit PIN" placeholderTextColor={colors.textMuted}
        style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 9, padding: 12 }} />
      {!!error && <Text style={{ color: colors.error }}>{error}</Text>}
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}><Text style={{ color: colors.text, textAlign: 'center' }}>Back to projects</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy || pin.length < 4} onPress={submit} style={{ padding: 14, borderRadius: 9, backgroundColor: colors.primary }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{busy ? 'Unlocking…' : 'Unlock project'}</Text>
      </TouchableOpacity>
    </View>
  </Modal>;
}
