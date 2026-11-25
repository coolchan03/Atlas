import { blobUrlFor } from '../host/files';
import { norm } from '../host/fs';
// Opens a document in a new browser tab (PDFs and images render natively; the rest download).
export async function viewDocument(opts: { uri: string; mimeType?: string; headerTitle?: string }) {
  const url = await blobUrlFor(norm(opts.uri));
  window.open(url, '_blank', 'noopener');
}
export const errorCodes = { OPERATION_CANCELED: 'OPERATION_CANCELED' };
