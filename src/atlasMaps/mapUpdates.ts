/**
 * Telling a map that is new from one that is already installed, and one that has a newer file on the server, plus
 * whether a download will fit. Pure, so it is tested without a device. The server lists each file's size, and a
 * regenerated map has a different size, so a size gap means there is an update.
 */
export type MapState = 'new' | 'installed' | 'update';

const UNITS: Record<string, number> = { K: 1e3, M: 1e6, G: 1e9 };

/** "123M", "1.2G", "45K" or plain bytes (as the server lists them) to a number of bytes, or null. */
export function listingBytes(size: string): number | null {
  const m = size.trim().match(/^(\d+(?:\.\d+)?)\s*([KMG]?)B?$/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * (UNITS[m[2].toUpperCase()] ?? 1));
}

/** The server rounds sizes to one decimal in its own unit, so a gap smaller than that is the same file. */
export function mapState(remoteSize: string, installedBytes: number | undefined): MapState {
  if (installedBytes === undefined) return 'new';
  const remote = listingBytes(remoteSize);
  if (remote === null) return 'installed';
  const tolerance = Math.max(0.03 * remote, 0.1 * (remote >= 1e9 ? 1e9 : 1e6));
  return Math.abs(remote - installedBytes) > tolerance ? 'update' : 'installed';
}

/** Room for a download, with a margin for the unpacked file and the copy kept until the new one is complete. */
export function roomFor(downloadBytes: number, freeBytes: number): boolean {
  return freeBytes >= downloadBytes * 1.15;
}
