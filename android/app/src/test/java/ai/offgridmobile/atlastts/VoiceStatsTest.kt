package ai.offgridmobile.atlastts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class VoiceStatsTest {
    private val rate = 16000
    private fun tone(ms: Int, level: Float = 0.5f) = FloatArray(rate * ms / 1000) { level * sin(2 * PI * 220 * it / rate).toFloat() }
    private fun silence(ms: Int) = FloatArray(rate * ms / 1000)

    @Test
    fun countsBurstsLeadingAndTrailingSilenceAndTheLongestGap() {
        val s = VoiceStats.analyze(silence(200) + tone(300) + silence(100) + tone(300) + silence(400) + tone(200) + silence(500), rate)
        assertEquals(3, s.bursts)
        assertTrue(s.leadSilenceMs in 180..220)
        assertTrue(s.trailSilenceMs in 480..520)
        assertTrue(s.longestGapMs in 380..420)
        assertEquals(2.0, s.seconds, 0.01)
    }

    @Test
    fun aShortDipInsideAWordIsNotACountedGap() {
        val s = VoiceStats.analyze(tone(300) + silence(40) + tone(300), rate)
        assertEquals(1, s.bursts)
    }

    @Test
    fun reportsClippingAndLevel() {
        val loud = FloatArray(1000) { 1.0f }
        val s = VoiceStats.analyze(loud, rate)
        assertEquals(100.0, s.clippedPercent, 0.01)
        assertEquals(1.0, s.peak, 0.001)
        val quiet = VoiceStats.analyze(tone(500, 0.1f), rate)
        assertEquals(0.0, quiet.clippedPercent, 0.0)
        assertTrue(quiet.rms < 0.1)
    }

    @Test
    fun emptyAudioIsAllZeros() {
        val s = VoiceStats.analyze(FloatArray(0), rate)
        assertEquals(0, s.samples)
        assertEquals(0, s.bursts)
    }

    @Test
    fun wavFilesRoundTrip() {
        val samples = tone(100)
        val back = WavFile.decode(WavFile.encode(samples, rate))
        assertEquals(rate, back.rate)
        assertEquals(samples.size, back.samples.size)
        assertEquals(samples[50].toDouble(), back.samples[50].toDouble(), 0.001)
    }
}
