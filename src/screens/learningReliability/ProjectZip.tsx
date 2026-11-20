import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { exportProjectZip, importProjectZip } from '../../learning/projectBundleZip';
import { sectionStyles as s } from './sectionStyles';

/** Export the project as one ZIP (the project, what its learners learned with candidates and verified claims, and its documents), or open one. */
export const ProjectZip: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const run = async (kind: 'export' | 'import', job: () => Promise<string | null>) => {
    setBusy(kind);
    try { const said = await job(); if (said) Alert.alert(kind === 'export' ? 'Project saved' : 'Project opened', said); }
    catch (e) { Alert.alert(kind === 'export' ? 'Could not export the project' : 'Nothing was imported', String((e as Error)?.message || e)); }
    finally { setBusy(null); }
  };
  const doExport = () => run('export', async () => {
    const r = await exportProjectZip(projectId);
    if (!r) return null;
    const c = r.manifest.counts;
    return `${r.name}\n\n${c.documents} document${c.documents === 1 ? '' : 's'}, ${c.claims} learned claim${c.claims === 1 ? '' : 's'} (candidates and verified), ${c.subjects} learner${c.subjects === 1 ? '' : 's'}, ${c.reports} report${c.reports === 1 ? '' : 's'}.`;
  });
  const doImport = () => run('import', async () => {
    const { pick, isErrorWithCode, errorCodes, types } = require('@react-native-documents/picker'); // NOSONAR: loaded lazily like the other pickers
    let file: { uri: string; name?: string | null } | undefined;
    try { [file] = await pick({ mode: 'open', allowMultiSelection: false, type: [types.allFiles] }); }
    catch (e: any) { if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null; throw e; }
    if (!file) return null;
    if (!/\.zip$/i.test(file.name || '')) throw new Error('Pick the .zip file Atlas made when the project was exported.');
    const r = await importProjectZip(file.uri, file.name || 'project.zip');
    return `${r.project}: ${r.documents} document${r.documents === 1 ? '' : 's'} added, ${r.records} learned record${r.records === 1 ? '' : 's'} added (${r.skippedRecords} already here), ${r.notes} note${r.notes === 1 ? '' : 's'}, ${r.questions} study question${r.questions === 1 ? '' : 's'}.`;
  });
  const button = ({ label, kind, onPress, testID }: { label: string; kind: 'export' | 'import'; onPress: () => void; testID: string }) => (
    <TouchableOpacity onPress={onPress} disabled={!!busy} accessibilityRole="button" testID={testID} style={[s.button, { borderColor: colors.primary }]}>
      <Text style={{ color: busy ? colors.textMuted : colors.primary }}>{busy === kind ? 'Working...' : label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={s.card} testID="project-zip">
      <Text style={[s.note, { color: colors.textSecondary }]}>One ZIP with the project, everything its learners have learned (candidates and verified, with their passages), and the project's documents. Opening a ZIP adds to what is here and never overwrites it.</Text>
      <View style={s.row}>
        {projectId ? button({ label: 'Export this project', kind: 'export', onPress: doExport, testID: 'project-zip-export' }) : <Text style={[s.small, { color: colors.textMuted }]}>Add documents first: that makes this subject's project, which can then be exported.</Text>}
        {button({ label: 'Open a project ZIP', kind: 'import', onPress: doImport, testID: 'project-zip-import' })}
        {!!busy && <ActivityIndicator color={colors.primary} />}
      </View>
    </View>
  );
};
