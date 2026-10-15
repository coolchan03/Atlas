import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';
import { nearbyAvailable, nearbySync } from '../../services/nearbySync';
import type { NearbyStatus } from '../../services/nearbySync';
import { useTheme } from '../../theme';

/** Scannable pairing invitation. Its short-lived key must never be logged. */
export function AtlasPairingQr({ value }: { value: string }) {
  const matrix = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const size = qr.getModuleCount();
    const cells: string[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (qr.isDark(y, x)) cells.push(`M${  x + 4  } ${  y + 4  }h1v1h-1z`);
    }
    return { path: cells.join(''), size: size + 8 };
  }, [value]);
  return (
    <Svg width={224} height={224} viewBox={`0 0 ${  matrix.size  } ${  matrix.size}`}>
      <Rect width={matrix.size} height={matrix.size} fill="#FFFFFF" />
      <Path d={matrix.path} fill="#111111" />
    </Svg>
  );
}
export function NearbySyncSettings() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<NearbyStatus>(nearbySync.getStatus());
  const [invitation, setInvitation] = useState('');
  const [paste, setPaste] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => nearbySync.subscribe(setStatus), []);
  const onEnable = async (next: boolean) => {
    setWorking(true);
    try {
      await nearbySync.setEnabled(next);
      if (!next) setInvitation('');
    } catch (e) { Alert.alert('Sync unavailable', String(e)); }
    finally { setWorking(false); }
  };
  const onInvite = async () => {
    setWorking(true);
    try { setInvitation(await nearbySync.createInvitation()); }
    catch (e) { Alert.alert('Pairing error', String(e)); }
    finally { setWorking(false); }
  };
  const onPair = async (value: string) => {
    if (!value.startsWith('atlas://sync?')) {
      Alert.alert('Invalid invitation', 'Scan or paste an Atlas QR pairing invitation.');
      return;
    }
    setWorking(true);
    try {
      await nearbySync.joinInvitation(value);
      setPaste('');
      Alert.alert('Paired', 'Atlas will sync when both devices are open on the same local network.');
    } catch (e) { Alert.alert('Pairing failed', String(e)); }
    finally { setWorking(false); }
  };
  const manualSync = async (peer: string) => {
    setWorking(true);
    try { await nearbySync.syncPeer(peer); Alert.alert('Synced', 'Changes were exchanged securely.'); }
    catch (e) { Alert.alert('Could not sync', String(e)); }
    finally { setWorking(false); }
  };
  const forget = (peer: string) => Alert.alert('Unpair device?', 'This revokes access to future sync. Existing files remain on both devices.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Unpair', style: 'destructive', onPress: () =>
      nearbySync.unpair(peer).catch(e => Alert.alert('Could not unpair', String(e))) },
  ]);
  if (!nearbyAvailable) return null;
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: colors.text }]}>Offline device sync</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Encrypted, optional, no Internet. Sync chats, agents, projects and knowledge files.
          </Text>
        </View>
        <Switch testID="nearby-sync-toggle" disabled={working} value={status.enabled} onValueChange={onEnable} />
      </View>
      {status.enabled && <>
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          Both devices must have Atlas open and share Wi-Fi or a hotspot. Wi-Fi Direct works if Android has already connected them. Locked and private items are not transferred.
        </Text>
        <Pressable testID="nearby-pair-button" style={[styles.button, { backgroundColor: colors.primary }]} disabled={working} onPress={onInvite}>
          <Text style={styles.buttonText}>Show pairing QR code</Text>
        </Pressable>
        {invitation ? <View style={styles.qrWrapper}>
          <AtlasPairingQr value={invitation} />
          <Text style={[styles.note, { color: colors.textSecondary }]}>Scan using the other device's camera. Valid for 10 minutes.</Text>
          <Pressable onPress={() => setInvitation('')}><Text style={{ color: colors.primary }}>Hide QR code</Text></Pressable>
        </View> : null}
        <TextInput testID="nearby-pair-link" value={paste} onChangeText={setPaste}
          secureTextEntry autoCapitalize="none" autoCorrect={false}
          placeholder="Or paste an Atlas pairing link" placeholderTextColor={colors.textMuted}
          style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
        <Pressable testID="nearby-join-button" disabled={working || paste.length === 0}
          onPress={() => onPair(paste)} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>Pair from link</Text>
        </Pressable>
        <Text style={[styles.subtitle, { color: colors.text }]}>Trusted devices</Text>
        {status.peers.length === 0 && <Text style={[styles.note, { color: colors.textMuted }]}>No devices paired yet.</Text>}
        {status.peers.map(peer => <View key={peer.id} style={styles.peerRow}>
          <View style={styles.peerInfo}>
            <Text style={{ color: colors.text }}>Device {peer.id.slice(0, 8)}</Text>
            <Text style={[styles.note, { color: colors.textMuted }]}>{peer.address}</Text>
          </View>
          <Pressable testID={`sync-${  peer.id}`} disabled={working} onPress={() => manualSync(peer.id)}>
            <Text style={{ color: colors.primary }}>Sync</Text>
          </Pressable>
          <Pressable testID={`unpair-${  peer.id}`} onPress={() => forget(peer.id)}>
            <Text style={{ color: colors.textMuted }}>Unpair</Text>
          </Pressable>
        </View>)}
        {status.lastSync && <Text style={[styles.note, { color: colors.textSecondary }]}>Last sync: {new Date(status.lastSync).toLocaleString()}</Text>}
        {status.syncing && <Text style={[styles.note, { color: colors.textSecondary }]}>Synchronizing…</Text>}
        {status.lastError && <Text style={[styles.note, { color: colors.textSecondary }]}>Last issue: {status.lastError}</Text>}
      </>}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12, marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleGroup: { flex: 1 },
  title: { fontWeight: '600', fontSize: 17 },
  subtitle: { fontWeight: '600', fontSize: 15 },
  description: { fontSize: 12, marginTop: 3 },
  note: { fontSize: 12 },
  button: { padding: 12, borderRadius: 8, alignItems: 'center' },
  // eslint-disable-next-line react-native/no-color-literals
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10 },
  qrWrapper: { alignItems: 'center', gap: 8, padding: 10 },
  peerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 5 },
  peerInfo: { flex: 1 },
});
