package ai.offgridmobile.atlastts

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Conservative, local-only preparation of authorized reference speech.
 * It cannot remove music/reverb or infer whether a sample really belongs to someone.
 * The original WAV is never changed: improvements are written as a new private file.
 */
object VoiceReferenceCoach {
    data class Report(
        val seconds: Double,
        val peak: Double,
        val rmsDb: Double,
        val noiseFloorDb: Double,
        val signalNoiseDb: Double,
        val clippedPercent: Double,
        val quietPercent: Double,
        val trimStartSeconds: Double,
        val trimEndSeconds: Double,
        val rating: String,
        val advice: List<String>,
    )

    /** frame size is 20ms and analysis is bounded by the WAV parser's 8MB cap. */
    fun analyze(ref: VoiceCloneWav.Reference): Report {
        val values = ref.samples
        require(values.isNotEmpty() && ref.sampleRate > 0)
        val frameSize = max(1, ref.sampleRate / 50)
        val frames = ArrayList<Double>()
        var mean = 0.0
        var peak = 0.0
        var clipped = 0
        var total = 0.0
        for (v in values) {
            val x = v.toDouble()
            mean += x
            total += x * x
            peak = max(peak, abs(x))
            if (abs(x) >= 0.995) clipped++
        }
        mean /= values.size
        val rms = sqrt(max(0.0, total / values.size - mean * mean))
        for (start in values.indices step frameSize) {
            val end = min(values.size, start + frameSize)
            var energy = 0.0
            for (i in start until end) {
                val v = values[i].toDouble() - mean
                energy += v * v
            }
            frames.add(sqrt(energy / (end - start)))
        }
        val sorted = frames.sorted()
        val noise = sorted[max(0, (sorted.size * 0.15).toInt().coerceAtMost(sorted.size - 1))]
        val activeThreshold = max(0.006, rms * 0.2)
        val first = frames.indexOfFirst { it >= activeThreshold }.let { if (it == -1) 0 else it }
        val last = frames.indexOfLast { it >= activeThreshold }.let { if (it == -1) frames.size - 1 else it }
        val quiet = frames.count { it < activeThreshold }.toDouble() / frames.size
        val seconds = values.size.toDouble() / ref.sampleRate
        // Preserve a 150ms margin on each side; only remove audible silence if meaningful.
        val start = max(0.0, first * frameSize.toDouble() / ref.sampleRate - 0.15)
        val end = min(seconds, (last + 1) * frameSize.toDouble() / ref.sampleRate + 0.15)
        val snr = (20 * log10(max(rms, 0.000001) / max(noise, 0.000001))).coerceIn(0.0, 60.0)
        val rmsDb = 20 * log10(max(rms, 0.000001))
        val noiseDb = 20 * log10(max(noise, 0.000001))
        val clippedPercent = 100.0 * clipped / values.size
        val advice = ArrayList<String>()
        if (seconds < 5) advice.add("Speak for 5–12 seconds for a more stable voice clone.")
        if (seconds > 15) advice.add("A short, steady voice sample usually works better than a long recording.")
        if (clippedPercent > 0.1 || peak > 0.985) advice.add("Your microphone may be too loud. Move a little farther away and record again.")
        if (rmsDb < -32) advice.add("Speech is quiet. Speak closer to the mic in a quiet room; avoid aggressive amplification.")
        if (snr < 12.0) advice.add("Background noise may affect the clone. Record without music, TV or fans.")
        if (quiet > 0.4) advice.add("The sample contains long pauses; trim the beginning and end.")
        if (advice.isEmpty()) advice.add("Good starting sample. Listen to the generated preview before using it.")
        val rating = if (clippedPercent > 0.5 || snr < 8.0 || rmsDb < -40) "needs-recording"
            else if (advice.size > 1) "fair" else "good"
        return Report(seconds, peak, rmsDb, noiseDb, snr, clippedPercent, quiet * 100, start, end, rating, advice)
    }

    /** Trim edge pauses, remove DC offset, and normalize by at most 6 dB without clipping. */
    fun improve(original: VoiceCloneWav.Reference): VoiceCloneWav.Reference {
        val report = analyze(original)
        val rate = original.sampleRate
        val src = original.samples
        var from = (report.trimStartSeconds * rate).toInt().coerceIn(0, src.size - 1)
        var end = (report.trimEndSeconds * rate).toInt().coerceIn(from + 1, src.size)
        // Trimming must never produce a reference too short for the Pocket engine.
        if ((end - from).toDouble() / rate < 3.0) { from = 0; end = src.size }
        val count = end - from
        val dst = FloatArray(count)
        var mean = 0.0
        for (i in from until end) mean += src[i]
        mean /= count
        var peak = 0.0
        var energy = 0.0
        for (i in 0 until count) {
            val centered = src[from + i].toDouble() - mean
            peak = max(peak, abs(centered))
            energy += centered * centered
            dst[i] = centered.toFloat()
        }
        val rms = sqrt(energy / count)
        val byRms = if (rms > 0.000001) 0.11 / rms else 1.0
        val byPeak = if (peak > 0.000001) 0.88 / peak else 1.0
        val gain = min(2.0, min(byPeak, byRms)).coerceAtLeast(0.01)
        for (i in dst.indices) {
            val edge = min(1.0, min(i.toDouble(), (dst.size - i - 1).toDouble()) / max(1, rate / 100))
            dst[i] = (dst[i] * gain * edge).toFloat().coerceIn(-0.89f, 0.89f)
        }
        return VoiceCloneWav.Reference(dst, rate)
    }

    fun encodeWav(reference: VoiceCloneWav.Reference): ByteArray {
        val samples = reference.samples
        val bytes = ByteBuffer.allocate(44 + samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        bytes.put("RIFF".toByteArray(Charsets.US_ASCII))
        bytes.putInt(36 + samples.size * 2)
        bytes.put("WAVEfmt ".toByteArray(Charsets.US_ASCII))
        bytes.putInt(16) // PCM format chunk
        bytes.putShort(1); bytes.putShort(1)
        bytes.putInt(reference.sampleRate)
        bytes.putInt(reference.sampleRate * 2)
        bytes.putShort(2); bytes.putShort(16)
        bytes.put("data".toByteArray(Charsets.US_ASCII))
        bytes.putInt(samples.size * 2)
        for (value in samples) bytes.putShort((value.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
        return bytes.array()
    }
}
