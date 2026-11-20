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
        val a = AutoSteps()
        a.beginUtterance()
        a.record(3000, 2.0); a.record(3000, 2.0)
        assertEquals(8, a.steps) // still the same utterance
        a.beginUtterance()
        assertEquals(5, a.steps)
    }

    @Test
    fun stepsDownOnlyAfterTwoSlowInARowAndOnlyDownThenSettles() {
        val a = AutoSteps(settleAfter = 6)
        a.record(3000, 2.0); a.record(3000, 2.0)   // 1, 2: down to 5
        a.record(300, 2.0)                          // 3: fast, resets the count
        a.record(3000, 2.0); a.record(3000, 2.0)   // 4, 5: down to 3
        a.beginUtterance()
        assertEquals(3, a.steps)
        a.record(5000, 2.0)                         // 6: the last one it listens to
        a.record(5000, 2.0); a.record(5000, 2.0)   // settled: ignored
        a.beginUtterance()
        assertEquals(3, a.steps)
    }

    @Test
    fun aSingleSlowOneOrAVeryShortPieceDoesNotCount() {
        val a = AutoSteps()
        a.record(3000, 2.0); a.record(100, 2.0); a.record(3000, 2.0)
        a.beginUtterance()
        assertEquals(8, a.steps)
        repeat(5) { a.record(4000, 0.3) }
        a.beginUtterance()
        assertEquals(8, a.steps)
    }
}
