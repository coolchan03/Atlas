import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { exportKnowledgeFile, exportTrainingFiles } from '../../learning/exportFiles';
import { sectionStyles as s } from './sectionStyles';

/** Save what Atlas learned as portable files: knowledge for other apps, and a training dataset. Nothing is uploaded or trained. */
export const ExportSection: React.FC = () => {
  const { colors } = useTheme();
  const [baseModel, setBaseModel] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (job: () => Promise<string>) => {
    setBusy(true);
    try { Alert.alert('Saved', await job()); } catch (e: any) { Alert.alert('Could not export', String(e?.message || e)); } finally { setBusy(false); }
  };
  const button = (label: string, testID: string, job: () => Promise<string>) => (
    <TouchableOpacity onPress={() => run(job)} disabled={busy} style={[s.button, { borderColor: colors.primary }]} accessibilityRole="button" testID={testID}>
      <Text style={{ color: colors.primary }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[s.card, { borderColor: colors.border }]} testID="export-section">
      <Text style={[s.title, { color: colors.text }]}>Export</Text>
      <Text style={[s.note, { color: colors.textSecondary }]}>
        Files are saved in the Atlas exports folder on this phone. Cited passages are included only for the training set, which needs them to prove where each example came from.
      </Text>
      <View style={s.row}>
        {button('Verified knowledge', 'export-verified', async () => { const r = await exportKnowledgeFile({ everything: false, includePassages: false }); return `${r.records} records saved to ${r.path}`; })}
        {button('Everything, including unreviewed', 'export-all', async () => { const r = await exportKnowledgeFile({ everything: true, includePassages: false }); return `${r.records} records saved to ${r.path}`; })}
      </View>
      <TextInput testID="export-base-model" value={baseModel} onChangeText={setBaseModel} placeholder="Base model for training (the exact name)" placeholderTextColor={colors.textMuted}
        style={[s.input, { color: colors.text, borderColor: colors.border }]} />
      {button('Training data', 'export-training', async () => {
        const r = await exportTrainingFiles(baseModel);
        const c = r.manifest.counts;
        return `${c.train + c.validation + c.test} examples (${c.train} train, ${c.validation} validation, ${c.test} test) saved to ${r.dir}. Atlas has not trained anything: see manifest.json for what training needs.`;
      })}
    </View>
  );
};
