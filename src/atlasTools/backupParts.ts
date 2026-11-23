/**
 * Password-encrypted backups in slices. The phone's encryption call takes the whole text at once, and that is what capped an encrypted
 * backup at 35 MB (the text, its encrypted copy and the encoded copy all sit in memory together). Here a big backup is cut into slices
 * of a few MB and each slice goes through the same call on its own, so the memory the native side needs stays small however big the
 * backup is. A backup that fits in one slice is still written in the original single-piece format, so older builds can open it.
 * Each slice carries its place ("2/5") inside the encrypted text, so a missing, repeated or swapped slice is found when it is opened.
 */
const SEALED_V1 = 'atlasbackup:v1:';
const SEALED_V2 = 'atlasbackup:v2:';
/** Characters per slice (up to 12 MB of text once written as UTF-8). */
const SLICE_CHARS = 4 * 1024 * 1024;

export interface PortableCrypto {
  encryptPortableBackup(text: string, password: string): Promise<string>;
  decryptPortableBackup(text: string, password: string): Promise<string>;
}

export const isSealedBackup = (text: string): boolean => text.startsWith(SEALED_V1) || text.startsWith(SEALED_V2);

/** The end of the slice that starts at `from`: never between the two halves of one character (an emoji would be damaged). */
function sliceEnd(text: string, from: number): number {
  const end = Math.min(text.length, from + SLICE_CHARS);
  if (end >= text.length) return end;
  const last = text.charCodeAt(end - 1);
  return last >= 0xd800 && last <= 0xdbff ? end - 1 : end;
}

export async function sealBackup(text: string, password: string, crypto: PortableCrypto): Promise<string> {
  if (text.length <= SLICE_CHARS) return crypto.encryptPortableBackup(text, password);
  const slices: string[] = [];
  for (let from = 0; from < text.length;) {
    const end = sliceEnd(text, from);
    slices.push(text.slice(from, end));
    from = end;
  }
  const sealed: string[] = [];
  for (let i = 0; i < slices.length; i += 1) {
    sealed.push(await crypto.encryptPortableBackup(`${i + 1}/${slices.length}\n${slices[i]}`, password));
    slices[i] = '';
  }
  return SEALED_V2 + sealed.join('\n');
}

export async function openBackup(sealed: string, password: string, crypto: PortableCrypto): Promise<string> {
  if (!sealed.startsWith(SEALED_V2)) return crypto.decryptPortableBackup(sealed, password);
  const pieces = sealed.slice(SEALED_V2.length).split('\n').filter((p) => p.length > 0);
  if (pieces.length === 0) throw new Error('Damaged encrypted backup: it has no content.');
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const plain = await crypto.decryptPortableBackup(pieces[i], password);
    const head = /^(\d+)\/(\d+)\n/.exec(plain);
    if (!head || Number(head[1]) !== i + 1 || Number(head[2]) !== pieces.length)
      throw new Error('Damaged encrypted backup: a part is missing or out of order. Nothing was changed.');
    out.push(plain.slice(head[0].length));
    pieces[i] = '';
  }
  return out.join('');
}
