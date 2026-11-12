package ai.offgridmobile.atlastts

import org.junit.Assert.assertEquals
import org.junit.Test

class VoiceReferenceCoachTest {
    private val rate = 100

    /** Thirty seconds of near silence with loud speech-like sound only in seconds [from, to). */
    private fun recording(from: Int, to: Int): FloatArray = FloatArray(30 * rate) { i ->
        val second = i / rate
        if (second in from until to) (if (i % 2 == 0) 0.4f else -0.4f) else 0.001f
    }

    @Test fun picksTheWindowWithTheSpeech() {
        val start = VoiceReferenceCoach.bestWindowStart(recording(12, 17), rate, 5)
        assertEquals(12 * rate, start)
    }

    @Test fun keepsAShortRecordingWhole() {
        assertEquals(0, VoiceReferenceCoach.bestWindowStart(FloatArray(4 * rate) { 0.3f }, rate, 5))
    }

    @Test fun avoidsAClippedStretch() {
        val samples = FloatArray(30 * rate) { i -> if (i % 2 == 0) 0.4f else -0.4f }
        for (i in 0 until 5 * rate) samples[i] = if (i % 2 == 0) 1.0f else -1.0f
        val start = VoiceReferenceCoach.bestWindowStart(samples, rate, 5)
        assertEquals(true, start >= 5 * rate)
    }
}
