import { pickFiles, saveToUser } from '../host/files';
import { fs, norm, baseName, dirName } from '../host/fs';

export const types = {
  allFiles: '*/*', images: 'image/*', plainText: 'text/plain', audio: 'audio/*', video: 'video/*', pdf: 'application/pdf',
  json: 'application/json', zip: 'application/zip', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt_: '', presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ts: '.ts',
} as Record<string, string>;
export const errorCodes = { IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS', UNABLE_TO_OPEN_FILE_TYPE: 'UNABLE_TO_OPEN_FILE_TYPE', OPERATION_CANCELED: 'OPERATION_CANCELED' };
export const isErrorWithCode = (e: unknown): e is { code: string } => !!e && typeof e === 'object' && 'code' in (e as object);
export const isErrorWithMessage = (e: unknown): e is { message: string } => !!e && typeof e === 'object' && 'message' in (e as object);
export const isCancel = (e: unknown) => isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED;

export async function pick(opts: { type?: string | string[]; allowMultiSelection?: boolean; mode?: string; allowVirtualFiles?: boolean } = {}) {
  const t = Array.isArray(opts.type) ? opts.type : opts.type ? [opts.type] : [];
  const files = await pickFiles({ accept: t.filter(Boolean), multiple: !!opts.allowMultiSelection });
  return files.map((f) => ({ uri: f.uri, name: f.name, type: f.type, size: f.size, hasRequestedType: true, isVirtual: false, convertibleToMimeTypes: null, error: null }));
}
export async function pickDirectory(_opts?: unknown) {
  const files = await pickFiles({ directory: true, multiple: true });
  const first = files[0]?.path ?? '';
  // A directory pick imports every file under one folder: report that folder.
  return { uri: `file://${dirName(first)}` };
}
export async function keepLocalCopy(opts: { files: { uri: string; fileName: string }[]; destination?: string }) {
  const out: any[] = [];
  for (const f of opts.files) {
    try {
      const dest = `/atlas/files/${Date.now().toString(36)}-${f.fileName}`;
      await fs().mkdir(dirName(dest));
      await fs().copy(norm(f.uri), dest);
      out.push({ status: 'success', sourceUri: f.uri, localUri: `file://${dest}` });
    } catch (e: any) {
      out.push({ status: 'error', sourceUri: f.uri, copyError: String(e?.message ?? e) });
    }
  }
  return out;
}
export async function saveDocuments(opts: { sourceUris: string[]; copy?: boolean; mimeType?: string; fileName?: string }) {
  const out: { uri: string; name: string }[] = [];
  for (const src of opts.sourceUris) {
    const name = opts.fileName ?? baseName(src);
    const uri = await saveToUser(norm(src), name, opts.mimeType);
    out.push({ uri, name });
  }
  return out;
}
export const releaseSecureAccess = async () => undefined;
export const releaseLongTermAccess = async () => undefined;
