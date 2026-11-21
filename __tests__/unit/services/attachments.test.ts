/**
 * Optional attachments (picture file, MTP draft file): enable / disable / detach / archive / restore / delete,
 * and the guarantee that shared files and the base model are never lost.
 */
import type { LlamaDownloadedModel, DownloadedModel } from '../../../src/types';
import {
  attachmentStatus, isAttachmentActive, mayAutoAttach, setAttachmentEnabled, detachAttachment, archiveAttachment,
  restoreAttachment, dropAttachment, isFileShared, attachmentMemoryMB,
} from '../../../src/services/modelManager/attachments';

const MB = 1024 * 1024;
const model = (extra: Partial<LlamaDownloadedModel> = {}): LlamaDownloadedModel => ({
  id: 'a/model.gguf', name: 'M', author: 'a', filePath: '/models/model-Q4_K_M.gguf', fileName: 'model-Q4_K_M.gguf', fileSize: 2000 * MB,
  quantization: 'Q4_K_M', downloadedAt: '2026-01-01', engine: 'llama', isVisionModel: true,
  mmProjPath: '/models/model-mmproj-f16.gguf', mmProjFileName: 'model-mmproj-f16.gguf', mmProjFileSize: 600 * MB,
  draftPath: '/models/model.mtp-x.gguf', draftFileName: 'x.gguf', draftFileSize: 150 * MB, ...extra,
});

describe.each([['vision', 'mmProjPath', 'mmProjFileName'], ['draft', 'draftPath', 'draftFileName']] as const)('%s attachment', (kind, pathKey, nameKey) => {
  it('is enabled by default and counts its memory', () => {
    expect(attachmentStatus(model(), kind)).toBe('enabled');
    expect(isAttachmentActive(model(), kind)).toBe(true);
    expect(attachmentMemoryMB(model(), kind)).toBe(kind === 'vision' ? 600 : 150);
  });

  it('Disable keeps the file attached but is never started and holds no memory', () => {
    const m = setAttachmentEnabled(model(), kind, false);
    expect(attachmentStatus(m, kind)).toBe('disabled');
    expect(m[pathKey]).toBe(model()[pathKey]);
    expect(isAttachmentActive(m, kind)).toBe(false);
    expect(attachmentMemoryMB(m, kind)).toBe(0);
    expect(mayAutoAttach(m, kind)).toBe(false);
  });

  it('Enable undoes Disable', () => {
    const m = setAttachmentEnabled(setAttachmentEnabled(model(), kind, false), kind, true);
    expect(isAttachmentActive(m, kind)).toBe(true);
  });

  it('Detach removes the association and blocks the folder scan from re-attaching it', () => {
    const m = detachAttachment(model(), kind);
    expect(m[pathKey]).toBeUndefined();
    expect(m[nameKey]).toBeUndefined();
    expect(attachmentStatus(m, kind)).toBe('none');
    expect(mayAutoAttach(m, kind)).toBe(false);
    expect(m.filePath).toBe(model().filePath); // the base model is untouched
  });

  it('Archive keeps a record of the file, detaches it and blocks re-attaching', () => {
    const m = archiveAttachment(model(), kind, '2026-11-20T00:00:00Z');
    expect(attachmentStatus(m, kind)).toBe('archived');
    expect(m.archivedAttachments?.[kind]).toMatchObject({ path: model()[pathKey], archivedAt: '2026-11-20T00:00:00Z' });
    expect(isAttachmentActive(m, kind)).toBe(false);
    expect(mayAutoAttach(m, kind)).toBe(false);
  });

  it('Restore reattaches an archived file, enabled, and lifts the scan block', () => {
    const m = restoreAttachment(archiveAttachment(setAttachmentEnabled(model(), kind, false), kind), kind);
    expect(m[pathKey]).toBe(model()[pathKey]);
    expect(attachmentStatus(m, kind)).toBe('enabled');
    expect(m.archivedAttachments).toBeUndefined();
    expect(mayAutoAttach(m, kind)).toBe(true);
  });

  it('Restore does nothing when nothing is archived or something else is already attached', () => {
    expect(restoreAttachment(model(), kind)).toEqual(model());
    const archived = archiveAttachment(model(), kind);
    const other = { ...archived, [pathKey]: '/models/other.gguf' } as LlamaDownloadedModel;
    expect(restoreAttachment(other, kind)[pathKey]).toBe('/models/other.gguf');
  });

  it('Delete drops the association (attached or archived) and reports the file to remove', () => {
    const live = dropAttachment(model(), kind);
    expect(live.path).toBe(model()[pathKey]);
    expect(attachmentStatus(live.model, kind)).toBe('none');
    expect(mayAutoAttach(live.model, kind)).toBe(true);
    const arch = dropAttachment(archiveAttachment(model(), kind), kind);
    expect(arch.path).toBe(model()[pathKey]);
    expect(arch.model.archivedAttachments).toBeUndefined();
  });
});

describe('attachments are independent', () => {
  it('detaching the picture file leaves the MTP file alone, and the other way round', () => {
    const noVision = detachAttachment(model(), 'vision');
    expect(isAttachmentActive(noVision, 'draft')).toBe(true);
    const noDraft = archiveAttachment(model(), 'draft');
    expect(isAttachmentActive(noDraft, 'vision')).toBe(true);
    expect(noDraft.isVisionModel).toBe(true);
  });

  it('removing the picture file marks the model as not a vision model; restoring brings that back', () => {
    const m = archiveAttachment(model(), 'vision');
    expect(m.isVisionModel).toBe(false);
    expect(restoreAttachment(m, 'vision').isVisionModel).toBe(true);
  });

  it('a model without attachments is returned unchanged by every action', () => {
    const bare = model({ mmProjPath: undefined, mmProjFileName: undefined, mmProjFileSize: undefined, draftPath: undefined, draftFileName: undefined, draftFileSize: undefined });
    expect(setAttachmentEnabled(bare, 'vision', false)).toBe(bare);
    expect(detachAttachment(bare, 'draft')).toBe(bare);
    expect(archiveAttachment(bare, 'vision')).toBe(bare);
  });
});

describe('shared files', () => {
  const a = model();
  const b = model({ id: 'b/other.gguf', filePath: '/models/other.gguf' }); // same mmproj path as `a`
  const c = model({ id: 'c/third.gguf', filePath: '/models/third.gguf', mmProjPath: undefined, draftPath: undefined, archivedAttachments: { vision: { path: a.mmProjPath!, fileName: 'x', archivedAt: 't' } } });

  it('sees a file another model still uses, attached or archived', () => {
    expect(isFileShared([a, b], a.mmProjPath!, a.id)).toBe(true);
    expect(isFileShared([a, c], a.mmProjPath!, a.id)).toBe(true); // archived on another model
  });

  it('does not call a file shared just because only this model uses it', () => {
    expect(isFileShared([a], a.mmProjPath!, a.id)).toBe(false);
    expect(isFileShared([a, b as DownloadedModel], a.draftPath!, a.id)).toBe(true); // b copied the same draft path in this fixture
    expect(isFileShared([a, { ...b, draftPath: undefined }], a.draftPath!, a.id)).toBe(false);
  });
});
