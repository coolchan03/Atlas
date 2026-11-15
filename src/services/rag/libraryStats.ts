/** How big a project's library is, in words a person can use. Pure. */
export interface LibraryStats { documents: Array<{ id: number; chunks: number; chars: number }>; embeddingBytes: number }

export const megabytes = (bytes: number): string => (bytes >= 10 * 1024 * 1024 ? `${Math.round(bytes / 1048576)} MB` : `${(bytes / 1048576).toFixed(1)} MB`);

/** "12 documents, 41,230 passages, about 96 MB on this phone (plus the original files)". The passages and their search data are what the app stores besides the files. */
export function describeLibrary(stats: LibraryStats | null): string {
  if (!stats || !stats.documents.length) return '';
  const chunks = stats.documents.reduce((n, d) => n + d.chunks, 0);
  const bytes = stats.documents.reduce((n, d) => n + d.chars, 0) + stats.embeddingBytes;
  const docs = stats.documents.length;
  return `${docs} document${docs === 1 ? '' : 's'}, ${chunks.toLocaleString('en-US')} passages, about ${megabytes(bytes)} of search data on this phone, besides the original files.`;
}
