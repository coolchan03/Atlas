package ai.offgridmobile.atlastts

import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class VoiceCloneWavTest {
    private fun wav(seconds: Int = 6, silent: Boolean = false): ByteArray {
        val count = seconds * 16000
        val b = ByteBuffer.allocate(44 + count * 2).order(ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()); b.putInt(b.capacity() - 8); b.put("WAVE".toByteArray())
        b.put("fmt ".toByteArray()); b.putInt(16); b.putShort(1); b.putShort(1)
        b.putInt(16000); b.putInt(32000); b.putShort(2); b.putShort(16)
        b.put("data".toByteArray()); b.putInt(count * 2)
        repeat(count) { b.putShort(if (silent) 0 else if (it % 2 == 0) 2500 else -2500) }
        return b.array()
    }

    @Test fun acceptsSixSecondMonoPcmReference() {
        val r = VoiceCloneWav.decode(wav())
        assertEquals(16000, r.sampleRate)
        assertEquals(6.0, r.seconds, 0.001)
        assertTrue(r.samples[0] > 0)
    }

    @Test fun rejectsSilence() {
        assertThrows(IllegalArgumentException::class.java) { VoiceCloneWav.decode(wav(silent = true)) }
    }

    @Test fun rejectsConstantDcOffset() {
        val bytes = wav()
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until (bytes.size - 44) / 2) b.putShort(44 + i * 2, 5000)
        assertThrows(IllegalArgumentException::class.java) { VoiceCloneWav.decode(bytes) }
    }

    @Test fun rejectsTooShort() {
        assertThrows(IllegalArgumentException::class.java) { VoiceCloneWav.decode(wav(seconds = 2)) }
    }

    @Test fun rejectsTruncatedChunk() {
        assertThrows(IllegalArgumentException::class.java) { VoiceCloneWav.decode(wav().copyOfRange(0, 128)) }
    }
}
