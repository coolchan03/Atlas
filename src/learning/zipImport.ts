import { Alert } from 'react-native';
import { resolvePickedFileUri } from '../utils/resolvePickedFileUri';
import { addFilesToProject, type AddResult } from './documents';
import { discardStage, stageZip, summarizeStage } from './zipStaging';
import { trackTask } from '../tasks/taskRegistry';

/** Asks the person to confirm what the zip holds, once. Resolves true to add. */
const confirm = (summary: string, note: string): Promise<boolean> => new Promise((resolve) => {
  Alert.alert('Add from this zip?', `${summary}\n\n${note}`, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Add the documents', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) });
});

/**
 * Pick a zip, unpack it safely into a scratch folder, show what is in it (every file accounted for), and add the books and notes
 * to the project only after the person agrees. Question files are listed but not imported here: they go through the question
 * import, which shows the questions for review first. Declining leaves nothing behind.
 */
export async function pickAndAddZip(projectId: string, onProgress?: (m: string) => void): Promise<AddResult | null> {
  const { pick, isErrorWithCode, errorCodes } = require('@react-native-documents/picker'); // NOSONAR: loaded lazily like the other pickers
  let file: { uri: string; name?: string | null } | undefined;
  try { [file] = await pick({ mode: 'open', allowMultiSelection: false, type: ['application/zip', 'application/x-zip-compressed'] }); }
  catch (e: any) { if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null; throw e; }
  if (!file) return null;
  const zipPath = await resolvePickedFileUri(file.uri, file.name || 'import.zip');
  return (await trackTask({ type: 'zip', title: `Opening ${file.name || 'a zip'}`, retryable: false }, async (ctl) => {
    ctl.progress({ stage: 'Unpacking and checking' });
    const staged = await stageZip(zipPath);
    try {
      const docs = staged.entries.filter((e) => e.kind === 'document');
      const note = staged.counts.questions ? 'The question files can be added with "Add your own questions".' : 'Nothing was added yet.';
      if (!docs.length || !(await confirm(summarizeStage(staged), note))) return { added: [], skipped: [], failed: [] } as AddResult;
      ctl.progress({ stage: 'Adding documents', completed: 0, total: docs.length });
      return await addFilesToProject({ projectId, files: docs.map((d) => ({ path: d.path, name: d.name.split('/').pop() || d.name, size: d.size })), onProgress });
    } finally { await discardStage(staged); }
  })) ?? null;
}
