import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Asset } from 'react-native-image-picker';
import { useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { useAppStore } from '../stores/appStore';
import { pickPicture } from '../services/pickPicture';
import { loadVisionModel, visionChoices } from '../translator/translateService';
import { speakAndWait, stop as stopSpeech, keepScreenOn } from '../atlasVoice/tts';
import { shareItem } from '../utils/shareItem';
import { resolveDocumentPath } from '../utils/resolveDocumentPath';
import { PHOTO_MODES, choiceOf, type PhotoMode } from './modes';
import { runPhoto, type PhotoResult } from './service';

/** Photo studio: the narrator, the time machine and sketch to picture, all from one photo. */
export const PhotoStudioScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const wide = useWideLayout(760);
  useAppStore((s) => s.activeModelId); // the vision choices follow the selected model
  const [mode, setMode] = useState<PhotoMode>(PHOTO_MODES[0]);
  const [choiceId, setChoiceId] = useState<string>(PHOTO_MODES[0].choices[0].id);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0);
  const vision = visionChoices();
  useEffect(() => () => { run.current++; void stopSpeech(); keepScreenOn(false, 'photo-studio'); }, []);

  const pickMode = (m: PhotoMode) => { setMode(m); setChoiceId(m.choices[0].id); setResult(null); setError(null); };
  const go = async (a: Asset, m: PhotoMode, choice: string) => {
    if (!a.uri) return;
    const mine = ++run.current;
    setAsset(a); setResult(null); setError(null); setBusy(true);
    keepScreenOn(true, 'photo-studio');
    try {
      const r = await runPhoto({ mode: m, choiceId: choice, picture: { uri: a.uri, mimeType: a.type } });
      if (mine === run.current) setResult(r);
    } catch (e) { if (mine === run.current) setError(String((e as Error)?.message || e)); } finally { if (mine === run.current) setBusy(false); keepScreenOn(false, 'photo-studio'); }
  };
  const pick = async (source: 'camera' | 'library') => {
    const picked = await pickPicture(source);
    if (picked.error) setError(picked.error);
    else if (picked.asset) await go(picked.asset, mode, choiceId);
  };
  const speak = async () => {
    if (!result?.text) return;
    if (speaking) { await stopSpeech(); setSpeaking(false); return; }
    setSpeaking(true);
    try { await speakAndWait(result.text, { messageId: 'photo-studio' }); } finally { setSpeaking(false); }
  };
  const switchTo = async (id: string) => { setError(null); try { await loadVisionModel(id); } catch (e) { setError(String((e as Error)?.message || e)); } };

  return (
    <SafeAreaView style={styles.fill} edges={['top']}>
      <ScreenHeader title="Photo studio" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} testID="photo-studio">
        <View style={styles.chips}>
          {PHOTO_MODES.map((m) => (
            <TouchableOpacity key={m.id} onPress={() => pickMode(m)} testID={`photo-mode-${m.id}`} accessibilityRole="radio" accessibilityState={{ selected: mode.id === m.id }} style={[styles.chip, mode.id === m.id && styles.chipOn]}>
              <Text style={mode.id === m.id ? styles.chipTextOn : styles.chipText}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint} testID="photo-blurb">{mode.blurb}</Text>
        <Text style={styles.label}>{mode.choiceLabel}</Text>
        <View style={styles.chips}>
          {mode.choices.map((c) => (
            <TouchableOpacity key={c.id} onPress={() => setChoiceId(c.id)} testID={`photo-choice-${c.id}`} accessibilityRole="radio" accessibilityState={{ selected: choiceOf(mode, choiceId).id === c.id }} style={[styles.chip, choiceOf(mode, choiceId).id === c.id && styles.chipOn]}>
              <Text style={choiceOf(mode, choiceId).id === c.id ? styles.chipTextOn : styles.chipText}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {!vision.selectedCanSee && (
          <View style={styles.card} testID="photo-vision-hint">
            <Text style={styles.text}>{vision.selectedName ? `${vision.selectedName} cannot see pictures.` : 'No model is selected.'}{vision.others.length ? ' Use one that can:' : ' Download a model with a vision file (the eye icon in My models) to use the Photo studio.'}</Text>
            {vision.others.map((o) => <Button key={o.id} title={o.name} variant="outline" onPress={() => void switchTo(o.id)} testID={`photo-use-${o.id}`} />)}
          </View>
        )}
        <View style={styles.actions}>
          <Button title="Take a photo" onPress={() => void pick('camera')} disabled={busy} testID="photo-camera" />
          <Button title="Choose a photo" variant="outline" onPress={() => void pick('library')} disabled={busy} testID="photo-library" />
          {!!asset && !busy && <Button title="Run again" variant="outline" onPress={() => void go(asset, mode, choiceId)} testID="photo-again" />}
        </View>
        {!!asset?.uri && <Image source={{ uri: asset.uri }} style={styles.picture} accessibilityLabel="Your photo" testID="photo-original" />}
        {busy && <View style={styles.row}><ActivityIndicator /><Text style={styles.hint}>Working on it. A picture can take a minute.</Text></View>}
        {!!error && <Text style={styles.error} testID="photo-error">{error}</Text>}
        {!!result && (
          <View style={styles.card} testID="photo-result">
            {!!result.text && <Text style={styles.text} testID="photo-text">{result.text}</Text>}
            {!result.text && <Text style={styles.hint} testID="photo-seen">{result.seen}</Text>}
            {!!result.image && <Image source={{ uri: `file://${resolveDocumentPath(result.image)}` }} style={styles.picture} accessibilityLabel="The painted picture" testID="photo-painted" />}
            {!!result.note && <Text style={styles.hint} testID="photo-note">{result.note}</Text>}
            <View style={styles.actions}>
              {!!result.text && <Button title={speaking ? 'Stop' : 'Listen'} variant="outline" onPress={() => void speak()} testID="photo-listen" />}
              {!!result.text && <Button title="Share" variant="outline" onPress={() => void shareItem({ title: mode.label, text: result.text }).catch(() => Alert.alert('Could not share'))} testID="photo-share" />}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  fill: { flex: 1, backgroundColor: colors.background },
  body: { padding: SPACING.lg, gap: SPACING.sm },
  hint: { ...TYPOGRAPHY.meta, color: colors.textSecondary },
  label: { ...TYPOGRAPHY.meta, color: colors.textSecondary, marginTop: SPACING.sm },
  text: { ...TYPOGRAPHY.body, color: colors.text },
  error: { ...TYPOGRAPHY.bodySmall, color: colors.error },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: SPACING.xs },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  chipTextOn: { ...TYPOGRAPHY.bodySmall, color: colors.background },
  card: { padding: SPACING.md, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: SPACING.sm },
  actions: { gap: SPACING.sm, marginTop: SPACING.xs },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm },
  picture: { width: '100%' as const, aspectRatio: 1, borderRadius: 8 },
});
