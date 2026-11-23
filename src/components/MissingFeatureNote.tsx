import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { buildFeature, type BuildFeatureId } from '../services/buildCapabilities';

/** Says a feature is missing from this version of Atlas (because its native library is not in this build) and why. Nothing when the feature is there. */
function MissingFeatureNote({ feature }: { feature: BuildFeatureId }) {
  const { colors } = useTheme();
  const f = buildFeature(feature);
  if (f.available) return null;
  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]} testID={`missing-${feature}`} accessibilityRole="alert">
      <Icon name="slash" size={16} color={colors.textSecondary} />
      <View style={styles.text}>
        <Text style={{ color: colors.text, ...TYPOGRAPHY.body }}>{f.label}: not in this version</Text>
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{f.missing}</Text>
      </View>
    </View>
  );
}

const TAB_FEATURE: Record<string, BuildFeatureId> = { text: 'localAi', image: 'imageGeneration', voice: 'neuralVoices', transcription: 'whisper' };

/** The note for whichever Models tab is open (nothing for a tab with no native-code feature, or when the feature is there). */
export function MissingFeatureForTab({ tab }: { tab: string }) {
  const feature = TAB_FEATURE[tab];
  return feature ? <MissingFeatureNote feature={feature} /> : null;
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, borderWidth: 1, borderRadius: 10, padding: SPACING.md, marginHorizontal: SPACING.lg, marginVertical: SPACING.sm },
  text: { flex: 1, gap: 2 },
});
