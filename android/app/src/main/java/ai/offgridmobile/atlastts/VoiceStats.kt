package ai.offgridmobile.atlastts

import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/**
 * What a piece of speech audio is made of, in numbers: used by the voice lab to compare a cloning voice's output at different
 * quality steps, and to check a reference recording. Pure, so it is tested without a phone.
 */
object VoiceStats {
    data class Stats(
        val samples: Int, val seconds: Double, val peak: Double, val rms: Double, val clippedPercent: Double,
        /** Silence before the first sound and after the last, in milliseconds. */
        val leadSilenceMs: Int, val trailSilenceMs: Int,
        /** The longest quiet stretch between the first and last sound: a long one in the middle of a short phrase is a stall. */
        val longestGapMs: Int,
        /** Separate bursts of sound, divided by pauses of 60 ms or more. A short phrase with far more bursts than syllables is stuttering. */
        val bursts: Int,
        /** Level of the quietest tenth of the recording, in dB below full scale: high means noise or hiss. */
        val noiseFloorDb: Double,
    )

    private const val WINDOW_MS = 20
    private const val GAP_MS = 60

    fun analyze(samples: FloatArray, rate: Int): Stats {
        if (samples.isEmpty() || rate <= 0) return Stats(0, 0.0, 0.0, 0.0, 0.0, 0, 0, 0, 0, -120.0)
        var peak = 0.0; var sumSq = 0.0; var clipped = 0
        for (s in samples) {
            val a = abs(s.toDouble())
            if (a > peak) peak = a
            if (a >= 0.999) clipped += 1
            sumSq += a * a
        }
        val window = max(1, rate * WINDOW_MS / 1000)
        val levels = ArrayList<Double>()
        var i = 0
        while (i < samples.size) {
            val end = minOf(samples.size, i + window)
            var w = 0.0
            for (j in i until end) { val v = samples[j].toDouble(); w += v * v }
            levels.add(sqrt(w / (end - i)))
            i = end
        }
        val sorted = levels.sorted()
        val floor = sorted[(sorted.size * 0.1).toInt().coerceIn(0, sorted.size - 1)]
        val top = sorted[sorted.size - 1]
        val threshold = max(top * 0.05, 0.002)
        val active = levels.map { it > threshold }
        val first = active.indexOf(true)
        val last = active.lastIndexOf(true)
        var gap = 0; var run = 0; var bursts = 0; var inBurst = false; var quiet = 0
        if (first >= 0) {
            for (k in first..last) {
                if (active[k]) {
                    if (!inBurst) { bursts += 1; inBurst = true }
                    gap = max(gap, run); run = 0; quiet = 0
                } else {
                    run += 1; quiet += 1
                    if (quiet * WINDOW_MS >= GAP_MS) inBurst = false
                }
            }
        }
        // A burst that restarts after a short dip (under 60 ms) stays one burst: `inBurst` is only cleared after a full pause.
        val lead = if (first < 0) levels.size * WINDOW_MS else first * WINDOW_MS
        val trail = if (last < 0) 0 else (levels.size - 1 - last) * WINDOW_MS
        return Stats(
            samples = samples.size, seconds = samples.size.toDouble() / rate, peak = peak, rms = sqrt(sumSq / samples.size),
            clippedPercent = clipped * 100.0 / samples.size, leadSilenceMs = lead, trailSilenceMs = trail, longestGapMs = gap * WINDOW_MS,
            bursts = if (first < 0) 0 else bursts, noiseFloorDb = 20 * log10(max(floor, 1e-6)),
        )
    }
}
