/** What a file shared from another app is, by its type: the phone gives a content address without a file name, so one is made up with the right ending. */
export type SharedKind = 'picture' | 'document' | 'text';

export function sharedKind(mime: string): SharedKind {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'picture';
  return m.startsWith('text/') ? 'text' : 'document';
}

/** A file name with the ending the document reader needs. */
export function sharedName(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'application/pdf') return 'shared.pdf';
  if (m.includes('wordprocessingml')) return 'shared.docx';
  if (m === 'application/msword') return 'shared.doc';
  return 'shared.txt';
}
