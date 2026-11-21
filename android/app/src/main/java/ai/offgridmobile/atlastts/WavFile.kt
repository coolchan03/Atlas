package ai.offgridmobile.atlastts

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** 16-bit mono WAV files: written for the voice lab, read back to play through the same output as the voice. Pure. */
object WavFile {
    fun encode(samples: FloatArray, rate: Int): ByteArray {
        val data = samples.size * 2
        val b = ByteBuffer.allocate(44 + data).order(ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()); b.putInt(36 + data); b.put("WAVE".toByteArray())
        b.put("fmt ".toByteArray()); b.putInt(16); b.putShort(1); b.putShort(1); b.putInt(rate); b.putInt(rate * 2); b.putShort(2); b.putShort(16)
        b.put("data".toByteArray()); b.putInt(data)
        for (s in samples) b.putShort((s.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
        return b.array()
    }

    class Decoded(val samples: FloatArray, val rate: Int)

    /** Reads what [encode] writes. Anything else (not 16-bit mono PCM) is refused with a message. */
    fun decode(bytes: ByteArray): Decoded {
        require(bytes.size > 44 && String(bytes, 0, 4) == "RIFF" && String(bytes, 8, 4) == "WAVE") { "Not a WAV file" }
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        require(b.getShort(20).toInt() == 1 && b.getShort(22).toInt() == 1 && b.getShort(34).toInt() == 16) { "Only 16-bit mono WAV files can be played here" }
        val rate = b.getInt(24)
        val count = (bytes.size - 44) / 2
        val out = FloatArray(count) { b.getShort(44 + it * 2) / 32768f }
        return Decoded(out, rate)
    }
}
