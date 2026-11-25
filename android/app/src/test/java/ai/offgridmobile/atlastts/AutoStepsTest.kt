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
    fun stepsDownAfterTwoSlowInARowAndAFastOneResetsTheCount() {
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

    @Test
    fun stepsBackUpAfterAWhileOfFastGenerationsWhenTheBetterLevelWouldStillKeepUp() {
        val a = AutoSteps(warmUp = 0)
        a.record(3000, 2.0); a.record(3000, 2.0)   // slow (the chat model was working): down to 5
        a.beginUtterance()
        assertEquals(5, a.steps)
        repeat(5) { a.record(300, 2.0) }            // fast, but not for long enough yet
        a.beginUtterance()
        assertEquals(5, a.steps)
        a.record(300, 2.0)                          // the sixth in a row: 8 steps would take about 0.24 of the speech time, so go back up
        a.beginUtterance()
        assertEquals(8, a.steps)
    }

    @Test
    fun doesNotStepUpWhenTheBetterLevelWouldBeTooSlow() {
        val a = AutoSteps(warmUp = 0)
        a.record(3000, 2.0); a.record(3000, 2.0)   // down to 5
        a.beginUtterance()
        repeat(12) { a.record(1000, 2.0) }          // 0.5 of the speech time at 5 steps: 8 steps would be about 0.8, too slow
        a.beginUtterance()
        assertEquals(5, a.steps)
    }

    @Test
    fun aRecoveryNeverStartsInTheMiddleOfAnUtterance() {
        val a = AutoSteps(warmUp = 0)
        a.record(3000, 2.0); a.record(3000, 2.0)
        a.beginUtterance()
        repeat(6) { a.record(300, 2.0) }
        assertEquals(5, a.steps) // the decision is made, but it applies only from the next utterance
        a.beginUtterance()
        assertEquals(8, a.steps)
    }
}
