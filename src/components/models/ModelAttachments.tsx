/**
 * Manage a GGUF model's optional supporting files on their own, without touching the base model:
 * the picture (vision/mmproj) file and the MTP draft file. Enable, Disable, Detach, Archive, Restore, Delete.
 * Embedded MTP (inside the model file) can only be switched on or off.
 *
 * Shows what is actually running for the loaded model (not what the model could do) and roughly what each part costs.
 */
import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from '../../theme';
import type { ThemeColors } from '../../theme';
import { SPACING, TYPOGRAPHY } from '../../constants';
import { modelManager, llmService } from '../../services';
import { attachmentStatus, attachmentMemoryMB, type AttachmentKind } from '../../services/modelManager/attachments';
import type { LlamaDownloadedModel } from '../../types';
import type { LoadReport } from '../../services/llmTypes';

const createStyles = (colors: ThemeColors) => ({
  row: { marginTop: SPACING.md },
  title: { ...TYPOGRAPHY.bodySmall, fontWeight: '600' as const, color: colors.text },
  note: { ...TYPOGRAPHY.meta, color: colors.textMuted, marginTop: SPACING.xs },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  button: {
    flexDirection: 'row' as const, borderWidth: 1, borderColor: colors.border, borderRadius: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginRight: SPACING.sm, marginTop: SPACING.sm,
  },
  buttonDanger: { borderColor: colors.error },
  buttonText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  buttonTextDanger: { color: colors.error },
});

const KIND_LABEL: Record<AttachmentKind, string> = { vision: 'Picture file', draft: 'MTP file' };

interface Props {
  model: LlamaDownloadedModel;
  /** True while this model is the one loaded; its real load report is shown. */
  loaded: boolean;
  busy: boolean;
  onAdd: (kind: AttachmentKind) => void;
  onError: (message: string) => void;
}

/** One sentence that says what is really running for this part, from the engine's load report rather than from what is attached. */
export function runtimeLine(kind: AttachmentKind, report: LoadReport | null): string | null {
  if (!report) return null;
  const part = kind === 'vision' ? report.vision : report.mtp;
  if (part.loaded) return part.estimatedMB > 0 ? `Running now, using about ${part.estimatedMB} MB.` : 'Running now.';
  if (part.skippedBecause) return `Not running: ${part.skippedBecause}.`;
  return null;
}

export const ModelAttachments: React.FC<Props> = ({ model, loaded, busy, onAdd, onError }) => {
  const styles = useThemedStyles(createStyles);
  const report = loaded ? llmService.getLoadReport() : null;
  const run = (fn: () => Promise<unknown>) => { fn().catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))); };

  const confirmDelete = async (kind: AttachmentKind) => {
    const shared = await modelManager.isAttachmentShared(model.id, kind).catch(() => false);
    const name = KIND_LABEL[kind].toLowerCase();
    const body = shared
      ? `Another model also uses this ${name}, so the file stays on the phone. It will only be removed from ${model.name}.`
      : `The ${name} will be deleted from the phone. ${model.name} itself is not deleted.`;
    Alert.alert(`Delete ${name}?`, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => modelManager.deleteAttachment(model.id, kind)) },
    ]);
  };

  const row = (kind: AttachmentKind) => {
    const status = attachmentStatus(model, kind);
    const mb = attachmentMemoryMB(model, kind);
    const sizeBytes = kind === 'vision' ? model.mmProjFileSize : model.draftFileSize;
    const sizeMB = sizeBytes ? Math.round(sizeBytes / (1024 * 1024)) : 0;
    const summary = {
      none: 'None attached.',
      enabled: `On${mb ? `, about ${mb} MB while running` : ''}.`,
      disabled: `Off. Kept on the phone${sizeMB ? ` (${sizeMB} MB)` : ''}; not started, so it uses no memory.`,
      archived: 'Archived. Kept on the phone, not used.',
    }[status];
    const action = (a: { label: string; id: string; onPress: () => void; danger?: boolean }) => (
      <TouchableOpacity key={a.id} accessibilityRole="button" disabled={busy} testID={`${kind}-${a.id}-${model.id}`}
        style={[styles.button, a.danger && styles.buttonDanger]} onPress={a.onPress}>
        <Text style={[styles.buttonText, a.danger && styles.buttonTextDanger]}>{a.label}</Text>
      </TouchableOpacity>
    );
    const live = runtimeLine(kind, report);
    return (
      <View key={kind} style={styles.row} testID={`attachment-${kind}-${model.id}`}>
        <Text style={styles.title}>{KIND_LABEL[kind]}</Text>
        <Text style={styles.note}>{summary}{live ? ` ${live}` : ''}</Text>
        <View style={styles.actions}>
          {status === 'none' && action({ label: 'Add file', id: 'add', onPress: () => onAdd(kind) })}
          {status === 'enabled' && action({ label: 'Disable', id: 'disable', onPress: () => run(() => modelManager.setAttachmentEnabled(model.id, kind, false)) })}
          {status === 'disabled' && action({ label: 'Enable', id: 'enable', onPress: () => run(() => modelManager.setAttachmentEnabled(model.id, kind, true)) })}
          {(status === 'enabled' || status === 'disabled') && action({ label: 'Detach', id: 'detach', onPress: () => run(() => modelManager.detachAttachment(model.id, kind)) })}
          {(status === 'enabled' || status === 'disabled') && action({ label: 'Archive', id: 'archive', onPress: () => run(() => modelManager.archiveAttachment(model.id, kind)) })}
          {status === 'archived' && action({ label: 'Restore', id: 'restore', onPress: () => run(() => modelManager.restoreAttachment(model.id, kind)) })}
          {status !== 'none' && action({ label: 'Delete', id: 'delete', danger: true, onPress: () => { void confirmDelete(kind); } })}
        </View>
      </View>
    );
  };

  const mtpReport = report?.mtp;
  return (
    <View testID={`attachments-${model.id}`}>
      {row('vision')}
      {row('draft')}
      {!model.draftPath && (
        <View style={styles.row}>
          <Text style={styles.title}>MTP built into the model</Text>
          <Text style={styles.note}>
            {model.embeddedMtp ? 'On.' : 'Off.'} The layers live inside the model file, so this switch only turns drafting on or off.
            {mtpReport && mtpReport.kind === 'embedded' ? ` ${mtpReport.loaded ? 'Running now.' : `Not running: ${mtpReport.skippedBecause ?? 'it did not start'}.`}` : ''}
            {' '}It helps only if replies actually get faster; Find the best settings measures that.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" disabled={busy} testID={`embedded-mtp-${model.id}`} style={styles.button}
              onPress={() => run(() => modelManager.setEmbeddedMtp(model.id, !model.embeddedMtp))}>
              <Text style={styles.buttonText}>{model.embeddedMtp ? 'Turn off' : 'Turn on'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {loaded && (
        <Text style={styles.note}>Changes apply the next time this model loads.</Text>
      )}
    </View>
  );
};
