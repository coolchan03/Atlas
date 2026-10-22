/**
 * A closed record's sealed blob is authoritative after sync or restore. An open
 * record may still carry an older blob while its current body is being sealed.
 */
export function adoptClosedProtectedBlob(
  record: { id: string; protectedBlob?: string },
  state: { isOpen: boolean; blobs: Map<string, string>; lastPlaintext: Map<string, string> },
): void {
  const { isOpen, blobs, lastPlaintext } = state;
  if (isOpen || !record.protectedBlob || blobs.get(record.id) === record.protectedBlob) return;
  blobs.set(record.id, record.protectedBlob);
  lastPlaintext.delete(record.id);
}
