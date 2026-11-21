/**
 * Optional attachments of a text model: the picture (vision/mmproj) file and the MTP draft file.
 *
 * Each one can be Enabled, Disabled, Detached, Archived, Restored or Deleted without touching the base model:
 *  - enabled   attached and started on load
 *  - disabled  attached but never started (no projector / draft runtime, no memory for it)
 *  - detached  not associated with the model any more; the file stays on the phone and the folder scan will not re-attach it
 *  - archived  set aside to restore later; the file stays on the phone
 *  - deleted   the file is removed (only when no other model uses it)
 *
 * These are pure functions over a model record; modelManager persists the result and does the file removal.
 * Embedded MTP lives inside the model file: it is only switched on or off (`embeddedMtp`), never removed.
 */
import type { DownloadedModel, LlamaDownloadedModel, ArchivedAttachment } from '../../types';

export type AttachmentKind = 'vision' | 'draft';
export type AttachmentStatus = 'none' | 'enabled' | 'disabled' | 'archived';

const FIELDS = {
  vision: { path: 'mmProjPath', name: 'mmProjFileName', size: 'mmProjFileSize', disabled: 'mmProjDisabled', detached: 'mmProjDetached' },
  draft: { path: 'draftPath', name: 'draftFileName', size: 'draftFileSize', disabled: 'draftDisabled', detached: 'draftDetached' },
} as const;

type AnyRecord = Record<string, unknown>;

export function attachmentPath(m: LlamaDownloadedModel, kind: AttachmentKind): string | undefined {
  return m[FIELDS[kind].path] as string | undefined;
}

export function attachmentStatus(m: LlamaDownloadedModel, kind: AttachmentKind): AttachmentStatus {
  if (attachmentPath(m, kind)) return m[FIELDS[kind].disabled] ? 'disabled' : 'enabled';
  return m.archivedAttachments?.[kind] ? 'archived' : 'none';
}

/** True when this model should start the attachment on load. Disabled, detached and archived files are never started. */
export function isAttachmentActive(m: LlamaDownloadedModel, kind: AttachmentKind): boolean {
  return attachmentStatus(m, kind) === 'enabled';
}

/** True when the folder scan may attach a picture/draft file it finds next to the model. A detached or archived file is off limits. */
export function mayAutoAttach(m: LlamaDownloadedModel, kind: AttachmentKind): boolean {
  return !m[FIELDS[kind].detached] && !m.archivedAttachments?.[kind] && !m[FIELDS[kind].disabled];
}

function clearActive(m: LlamaDownloadedModel, kind: AttachmentKind): LlamaDownloadedModel {
  const f = FIELDS[kind];
  const next: AnyRecord = { ...m };
  delete next[f.path]; delete next[f.name]; delete next[f.size]; delete next[f.disabled];
  if (kind === 'vision') { next.isVisionModel = false; delete next.mmProjManual; }
  return next as unknown as LlamaDownloadedModel;
}

export function setAttachmentEnabled(m: LlamaDownloadedModel, kind: AttachmentKind, enabled: boolean): LlamaDownloadedModel {
  if (!attachmentPath(m, kind)) return m;
  const next: AnyRecord = { ...m };
  if (enabled) delete next[FIELDS[kind].disabled]; else next[FIELDS[kind].disabled] = true;
  return next as unknown as LlamaDownloadedModel;
}

/** Remove the association; the file stays where it is and is not picked up again by the folder scan. */
export function detachAttachment(m: LlamaDownloadedModel, kind: AttachmentKind): LlamaDownloadedModel {
  if (!attachmentPath(m, kind)) return m;
  return { ...clearActive(m, kind), [FIELDS[kind].detached]: true } as LlamaDownloadedModel;
}

export function archiveAttachment(m: LlamaDownloadedModel, kind: AttachmentKind, now: string = new Date().toISOString()): LlamaDownloadedModel {
  const f = FIELDS[kind];
  const path = attachmentPath(m, kind);
  if (!path) return m;
  const archived: ArchivedAttachment = {
    path, fileName: (m[f.name] as string | undefined) ?? path.split('/').pop() ?? path,
    ...(typeof m[f.size] === 'number' ? { fileSize: m[f.size] as number } : {}), archivedAt: now,
  };
  const cleared = clearActive(m, kind);
  return { ...cleared, [f.detached]: true, archivedAttachments: { ...m.archivedAttachments, [kind]: archived } } as LlamaDownloadedModel;
}

/** Reattach an archived file (enabled). Nothing happens when nothing is archived or something else is attached already. */
export function restoreAttachment(m: LlamaDownloadedModel, kind: AttachmentKind): LlamaDownloadedModel {
  const f = FIELDS[kind];
  const archived = m.archivedAttachments?.[kind];
  if (!archived || attachmentPath(m, kind)) return m;
  const { [kind]: _removed, ...rest } = m.archivedAttachments ?? {};
  const next: AnyRecord = {
    ...m, [f.path]: archived.path, [f.name]: archived.fileName,
    ...(archived.fileSize === undefined ? {} : { [f.size]: archived.fileSize }),
    archivedAttachments: Object.keys(rest).length ? rest : undefined,
  };
  delete next[f.detached]; delete next[f.disabled];
  if (kind === 'vision') next.isVisionModel = true;
  return next as unknown as LlamaDownloadedModel;
}

/** Forget the attachment (active or archived) on this model. The caller removes the file when nobody else uses it. */
export function dropAttachment(m: LlamaDownloadedModel, kind: AttachmentKind): { model: LlamaDownloadedModel; path?: string } {
  const f = FIELDS[kind];
  const path = attachmentPath(m, kind) ?? m.archivedAttachments?.[kind]?.path;
  let model = clearActive(m, kind);
  const { [kind]: _removed, ...rest } = m.archivedAttachments ?? {};
  model = { ...model, archivedAttachments: Object.keys(rest).length ? rest : undefined } as LlamaDownloadedModel;
  const next: AnyRecord = { ...model };
  delete next[f.detached];
  return { model: next as unknown as LlamaDownloadedModel, path };
}

/** Every file path a model refers to as an attachment, attached or archived. */
function attachmentPaths(m: DownloadedModel): string[] {
  if (m.engine !== 'llama') return [];
  return [m.mmProjPath, m.draftPath, m.archivedAttachments?.vision?.path, m.archivedAttachments?.draft?.path].filter((p): p is string => !!p);
}

/** True when a model other than `exceptModelId` still refers to this file (attached or archived): it must not be deleted. */
export function isFileShared(models: DownloadedModel[], path: string, exceptModelId: string): boolean {
  return models.some((x) => x.id !== exceptModelId && attachmentPaths(x).includes(path));
}

/** The rough memory an attached file costs while it is running (its size). 0 when it is not attached or is switched off. */
export function attachmentMemoryMB(m: LlamaDownloadedModel, kind: AttachmentKind): number {
  if (!isAttachmentActive(m, kind)) return 0;
  const size = m[FIELDS[kind].size];
  return typeof size === 'number' ? Math.round(size / (1024 * 1024)) : 0;
}
