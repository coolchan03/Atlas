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
        // Within half a second of where the speech begins (it may start in the pause just before it).
        assertEquals(true, start in 1150..1250)
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

    /** 16 kHz test audio: speech-like bursts (a 150 Hz tone with a syllable-rate envelope) with pauses, over steady background noise. */
    private fun audio(seconds: Int, noise: Float, speech: (Int) -> Boolean, amp: Float = 0.3f, seed: Long = 7): FloatArray {
        val r = 16000
        val rnd = java.util.Random(seed)
        return FloatArray(seconds * r) { i ->
            val t = i.toDouble() / r
            val voiced = speech(i / r)
            val env = if (voiced) 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t) else 0.0
            val tone = if (voiced) amp * env * Math.sin(2 * Math.PI * 150 * t) else 0.0
            (tone + noise * (rnd.nextFloat() * 2 - 1)).toFloat()
        }
    }

    @Test fun prefersACleanStretchOverANoisyOne() {
        // Speech everywhere, but seconds 0-14 sit on loud background noise and 16-30 are clean.
        val r = 16000
        val rnd = java.util.Random(3)
        val samples = audio(30, 0.0f, { true })
        for (i in 0 until 14 * r) samples[i] += 0.12f * (rnd.nextFloat() * 2 - 1)
        for (i in 14 * r until 30 * r) samples[i] += 0.002f * (rnd.nextFloat() * 2 - 1)
        val start = VoiceReferenceCoach.bestWindowStart(samples, r, 12)
        assertEquals(true, start >= 14 * r)
    }

    @Test fun prefersContinuousSpeechOverMostlySilence() {
        // Seconds 0-14: one word every four seconds. Seconds 14-30: steady talking.
        val samples = audio(30, 0.002f, { sec -> if (sec < 14) sec % 4 == 0 else true })
        val start = VoiceReferenceCoach.bestWindowStart(samples, 16000, 12)
        assertEquals(true, start >= 11 * 16000) // none of the sparse words at 0, 4 and 8 s
    }

    @Test fun startsAndEndsInAPauseNotMidWord() {
        // Talking from 3 s to 27 s with a pause at every whole 5 s mark (second 5, 10, 15, 20, 25).
        val samples = audio(30, 0.002f, { sec -> sec in 3 until 27 && sec % 5 != 0 })
        val r = 16000
        val start = VoiceReferenceCoach.bestWindowStart(samples, r, 12)
        val frame = r / 50
        fun rms(from: Int): Double = Math.sqrt((from until from + frame).sumOf { (samples[it] * samples[it]).toDouble() } / frame)
        assertEquals(true, rms(start) < 0.02)
        assertEquals(true, rms(start + 12 * r - frame) < 0.02)
    }

    @Test fun neverReturnsAWindowThatRunsPastTheEnd() {
        for (len in listOf(13, 17, 29)) {
            val samples = audio(len, 0.01f, { true })
            val start = VoiceReferenceCoach.bestWindowStart(samples, 16000, 12)
            assertEquals(true, start >= 0 && start + 12 * 16000 <= samples.size)
        }
    }

    @Test fun silenceDoesNotCrash() {
        val start = VoiceReferenceCoach.bestWindowStart(FloatArray(30 * 16000), 16000, 12)
        assertEquals(true, start >= 0)
    }
}
