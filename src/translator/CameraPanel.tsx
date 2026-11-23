import React from 'react';
import { ActivityIndicator, Clipboard, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { audioSessionManager } from '../services/audioSessionManager';
import { Button } from '../components/Button';
import { languageFor } from './languages';
import { loadVisionModel, translatePicture, visionChoices } from './translateService';
import { useAppStore } from '../stores/appStore';
import { useTranslator } from './store';

interface Found { original: string; translation: string; found: boolean }

/** Camera mode: take or choose a picture, read the text in it and translate it. Needs a model that can see pictures. */
export function CameraPanel() {
  const { colors } = useTheme();
  const to = useTranslator((s) => s.to);
  const [asset, setAsset] = React.useState<Asset | null>(null);
  const [found, setFound] = React.useState<Found | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [switching, setSwitching] = React.useState<string | null>(null);
  useAppStore((s) => s.activeModelId); // the choices follow the selected model
  const choices = visionChoices();
  const switchTo = async (id: string) => {
    setSwitching(id); setError(null);
    try { await loadVisionModel(id); } catch (e) { setError(String((e as Error)?.message || e)); }
    setSwitching(null);
  };

  const run = async (a: Asset) => {
    if (!a.uri) return;
    setAsset(a); setFound(null); setError(null); setBusy(true);
    try { setFound(await translatePicture(a.uri, a.type, languageFor(to))); } catch (e) { setError(String((e as Error)?.message || e)); }
    setBusy(false);
  };
  const pick = async (source: 'camera' | 'library') => {
    try {
      await audioSessionManager.deactivate(); // the camera and the speech session collide on iOS; a no-op on Android
      const opts = { mediaType: 'photo' as const, quality: 0.8 as const, maxWidth: 1600, maxHeight: 1600 };
      const result = source === 'camera' ? await launchCamera(opts) : await launchImageLibrary(opts);
      if (result.errorCode === 'permission') { setError(source === 'camera' ? 'Atlas needs permission to use the camera. Allow it in the phone\'s app settings.' : 'Atlas needs permission to read your pictures. Allow it in the phone\'s app settings.'); return; }
      if (result.errorCode) { setError(result.errorMessage || 'The picture could not be opened.'); return; }
      const first = result.assets?.[0];
      if (first) await run(first);
    } catch { /* the picker reports its own problems */ } finally { audioSessionManager.ensurePlayback().catch(() => undefined); }
  };

  return (
    <View style={styles.gap} testID="translator-camera">
      <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>Point the camera at a sign, menu or page. Atlas reads the text and translates it into {languageFor(to).name}.</Text>
      {!choices.selectedCanSee && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="translator-vision-hint">
          <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>
            {choices.selectedName ? `${choices.selectedName} cannot see pictures.` : 'No model is selected.'}
            {choices.others.length ? ' Use one that can:' : ' Download a model with a vision file (the eye icon in My models) to translate pictures.'}
          </Text>
          {choices.others.map((m) => (
            <Button key={m.id} title={switching === m.id ? `Loading ${m.name}...` : `Use ${m.name}`} variant="outline" size="small" disabled={switching !== null} onPress={() => switchTo(m.id)} testID={`translator-use-${m.id}`} />
          ))}
        </View>
      )}
      <View style={styles.row}>
        <View style={styles.grow}><Button title="Take a photo" onPress={() => pick('camera')} icon={<Icon name="camera" size={18} color={colors.background} />} testID="translator-take-photo" /></View>
        <View style={styles.grow}><Button title="Choose a picture" variant="outline" onPress={() => pick('library')} testID="translator-choose-photo" /></View>
      </View>
      {!!asset?.uri && <Image source={{ uri: asset.uri }} style={styles.photo} resizeMode="contain" accessibilityLabel="The picture being translated" />}
      {busy && <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>Reading the picture...</Text></View>}
      {!!error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="translator-error">{error}</Text>}
      {!!found && !found.found && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.body }} testID="translator-no-text">No readable text was found in this picture.</Text>}
      {!!found?.found && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="translator-picture-result">
          {!!found.original && <Text selectable style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{found.original}</Text>}
          <Text selectable style={{ color: colors.text, ...TYPOGRAPHY.body }}>{found.translation}</Text>
          <TouchableOpacity onPress={() => Clipboard.setString(found.translation)} accessibilityRole="button" accessibilityLabel="Copy the translation" testID="translator-copy"><Icon name="copy" size={20} color={colors.primary} /></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  grow: { flex: 1 },
  photo: { width: '100%', height: 200, borderRadius: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, gap: SPACING.sm },
});
