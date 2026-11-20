package ai.offgridmobile.atlastts

import org.junit.Assert.assertEquals
import org.junit.Test

class AutoStepsTest {
    @Test
    fun startsAtTheBestQualityAndStaysThereOnAFastPhone() {
        val a = AutoSteps()
        repeat(10) { a.record(500, 2.5) }
        a.beginUtterance()
        assertEquals(8, a.steps)
    }

    @Test
    fun aDecisionOnlyAppliesAtTheNextUtteranceNeverInTheMiddleOfOne() {
        val a = AutoSteps(warmUp = 0)
        a.beginUtterance()
        a.record(3000, 2.0); a.record(3000, 2.0)
        assertEquals(8, a.steps) // still the same utterance
        a.beginUtterance()
        assertEquals(5, a.steps)
    }

    @Test
    fun theFirstGenerationIsWarmUpAndIgnored() {
        val a = AutoSteps()
        a.record(9000, 2.0); a.record(3000, 2.0)    // warm-up ignored; one slow does not count
        a.beginUtterance()
        assertEquals(8, a.steps)
    }

    @Test
    fun stepsDownOnlyAfterTwoSlowInARowAndOnlyDown() {
        val a = AutoSteps(warmUp = 0)
        a.record(3000, 2.0); a.record(3000, 2.0)   // down to 5
        a.record(300, 2.0)                          // fast: resets the count, never steps back up
        a.record(3000, 2.0); a.record(3000, 2.0)   // down to 3
        a.beginUtterance()
        assertEquals(3, a.steps)
        a.record(100, 2.0); a.record(100, 2.0)
        a.beginUtterance()
        assertEquals(3, a.steps)
    }

    @Test
    fun aSingleSlowOneOrAVeryShortPieceDoesNotCount() {
        val a = AutoSteps(warmUp = 0)
        a.record(3000, 2.0); a.record(100, 2.0); a.record(3000, 2.0)
        a.beginUtterance()
        assertEquals(8, a.steps)
        repeat(5) { a.record(4000, 0.3) }
        a.beginUtterance()
        assertEquals(8, a.steps)
    }
}
