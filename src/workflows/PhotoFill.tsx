import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components/Button';
import { audioSessionManager } from '../services/audioSessionManager';

interface Props { label: string; read: (uri: string, mime: string | undefined) => Promise<string>; onText: (text: string) => void }

/** "Read it from a photo": take or choose a picture, and what the AI reads from it is put in the text box for the person to check and edit. */
export const PhotoFill: React.FC<Props> = ({ label, read, onText }) => {
  const { colors } = useTheme();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const pick = async (source: 'camera' | 'library') => {
    setError('');
    try {
      await audioSessionManager.deactivate(); // the camera and the speech session collide on iOS; a no-op on Android
      const opts = { mediaType: 'photo' as const, quality: 0.8 as const, maxWidth: 1600, maxHeight: 1600 };
      const result = source === 'camera' ? await launchCamera(opts) : await launchImageLibrary(opts);
      if (result.errorCode) { setError(result.errorCode === 'permission' ? 'Atlas needs permission for that. Allow it in the phone\'s app settings.' : result.errorMessage || 'The picture could not be opened.'); return; }
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setBusy(true);
      onText(await read(asset.uri, asset.type));
    } catch (e) { setError(String((e as Error)?.message || e).slice(0, 200)); } finally { setBusy(false); audioSessionManager.ensurePlayback().catch(() => undefined); }
  };
  return (
    <View style={styles.box}>
      <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{label}</Text>
      <View style={styles.row}>
        <Button title={busy ? 'Reading...' : 'Take a photo'} variant="outline" size="small" onPress={() => { void pick('camera'); }} disabled={busy} testID="workflow-photo-camera" />
        <Button title="Choose a picture" variant="outline" size="small" onPress={() => { void pick('library'); }} disabled={busy} testID="workflow-photo-library" />
      </View>
      {!!error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="workflow-photo-error">{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { gap: SPACING.xs },
  row: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
});
