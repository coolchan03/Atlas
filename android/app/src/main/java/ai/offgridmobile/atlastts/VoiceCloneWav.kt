package ai.offgridmobile.atlastts

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Decode a bounded RIFF/WAVE PCM16 mono reference recording, without a codec or network service.
 * The recorder already writes mono 16kHz WAV. We deliberately reject ambiguous / compressed input.
 */
object VoiceCloneWav {
    const val MAX_BYTES = 8 * 1024 * 1024
    data class Reference(val samples: FloatArray, val sampleRate: Int) {
        val seconds: Double get() = samples.size.toDouble() / sampleRate
    }

    fun decode(bytes: ByteArray): Reference {
        require(bytes.size in 44..MAX_BYTES) { "Reference must be a WAV file smaller than 8 MB" }
        require(String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" &&
            String(bytes, 8, 4, Charsets.US_ASCII) == "WAVE") { "Use an uncompressed WAV recording" }
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        val declared = buf.getInt(4).toLong() and 0xffffffffL
        require(declared >= 36L && declared + 8L <= bytes.size.toLong()) { "Invalid WAV length" }
        val riffEnd = (declared + 8L).toInt()
        var position = 12
        var audioFormat = -1
        var channels = -1
        var sampleRate = -1
        var bitDepth = -1
        var dataOffset = -1
        var dataSize = -1
        while (position + 8 <= riffEnd) {
            val tag = String(bytes, position, 4, Charsets.US_ASCII)
            val size = buf.getInt(position + 4).toLong() and 0xffffffffL
            val start = position + 8L
            require(start + size <= riffEnd.toLong()) { "WAV chunk is truncated" }
            when (tag) {
                "fmt " -> {
                    require(size >= 16) { "Invalid WAV format chunk" }
                    audioFormat = buf.getShort(start.toInt()).toInt() and 0xffff
                    channels = buf.getShort(start.toInt() + 2).toInt() and 0xffff
                    sampleRate = buf.getInt(start.toInt() + 4)
                    bitDepth = buf.getShort(start.toInt() + 14).toInt() and 0xffff
                }
                "data" -> { dataOffset = start.toInt(); dataSize = size.toInt() }
            }
            position = (start + size + (size and 1L)).toInt()
        }
        require(audioFormat == 1 && channels == 1 && bitDepth == 16) {
            "Voice cloning needs mono, 16-bit PCM WAV audio (no MP3/M4A)"
        }
        require(sampleRate in 8000..48000) { "WAV sample rate must be 8–48 kHz" }
        require(dataOffset >= 0 && dataSize > 0 && dataSize % 2 == 0) { "WAV has no valid audio samples" }
        val n = dataSize / 2
        require(n.toDouble() / sampleRate in 3.0..30.0) { "Record between 3 and 30 seconds (5–15 recommended)" }
        val floats = FloatArray(n) { index -> buf.getShort(dataOffset + index * 2) / 32768f }
        // Silence and clipped audio make unreliable clones; fail clearly, rather than saving an unusable reference.
        var energy = 0.0
        var mean = 0.0
        var clipped = 0
        for (v in floats) {
            mean += v
            energy += v * v
            if (kotlin.math.abs(v) >= 0.999f) clipped++
        }
        mean /= n
        // A constant DC signal is not speech even though its RMS is nonzero.
        val variance = energy / n - mean * mean
        require(variance >= 0.000001) { "Recording is too quiet or has no speech; try a quieter room" }
        require(clipped < n * 0.02) { "Recording is heavily clipped; lower the recording volume" }
        return Reference(floats, sampleRate)
    }
}
