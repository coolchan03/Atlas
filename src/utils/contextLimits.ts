export const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Max safe context length based on device RAM to prevent OOM on low-RAM devices. */
export function getMaxContextForDevice(totalMemoryBytes: number): number {
  const gb = totalMemoryBytes / BYTES_PER_GB;
  if (gb <= 6) return 2048;
  if (gb <= 8) return 4096;
  if (gb <= 11) return 8192;
  return 16384;
}
