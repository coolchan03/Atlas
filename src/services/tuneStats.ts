/**
 * Robust statistics for the speed test. One timing of a phone is noisy (a background app, a thermal dip, a GPU compiling its kernels on the
 * first reply), so a single run can pick a slower setting. Medians with obvious outliers removed, and a rule for when a gap is real.
 * Pure, so it is tested without a device.
 */
export const median = (values: number[]): number => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Drops obvious outliers: values further from the median than three scaled median-absolute-deviations (and at least 25% of the median, so a
 * tightly clustered set never throws out a value just for being the farthest). With fewer than three values nothing can be called an outlier.
 */
export function rejectOutliers(values: number[]): number[] {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 3) return clean;
  const m = median(clean);
  const mad = median(clean.map((v) => Math.abs(v - m))) * 1.4826;
  const limit = Math.max(3 * mad, 0.25 * Math.abs(m));
  const kept = clean.filter((v) => Math.abs(v - m) <= limit);
  return kept.length ? kept : clean;
}

/** The value a set of repeated timings stands for: the median after outliers are removed. */
export const robustValue = (values: number[]): number => median(rejectOutliers(values));

/** How much repeated timings disagree, as a share of their median (0 when there is one value). */
export function relativeSpread(values: number[]): number {
  const kept = rejectOutliers(values);
  if (kept.length < 2) return 0;
  const m = median(kept);
  return m > 0 ? (Math.max(...kept) - Math.min(...kept)) / m : 0;
}

/** Two timings that disagree this much are not enough to decide anything: a third is taken. */
export const NEEDS_THIRD_RUN = 0.2;

/** A gain smaller than this on one timing might be noise: it is checked again before it changes anything. */
export const CONFIRM_BELOW_GAIN = 1.3;

/**
 * Two options are a tie when the slower is within the larger of 5% and the noise seen in the faster one (never more than 15%), so a setting
 * is not preferred over another by less than the timings can tell apart.
 */
export function tieBand(topSpread: number): number {
  return Math.min(0.15, Math.max(0.05, topSpread));
}
