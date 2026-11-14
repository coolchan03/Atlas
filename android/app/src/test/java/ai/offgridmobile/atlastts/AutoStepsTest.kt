package ai.offgridmobile.atlastts

import org.junit.Assert.assertEquals
import org.junit.Test

class AutoStepsTest {
    @Test
    fun startsAtTheBestQualityAndStaysThereOnAFastPhone() {
        val a = AutoSteps()
        repeat(10) { a.record(500, 2.5) }
        assertEquals(8, a.steps)
    }

    @Test
    fun stepsDownAfterTwoSlowGenerationsInARowAndOnlyDown() {
        val a = AutoSteps()
        a.record(3000, 2.0)
        assertEquals(8, a.steps)
        a.record(3000, 2.0)
        assertEquals(5, a.steps)
        a.record(300, 2.0)
        assertEquals(5, a.steps)
        a.record(3000, 2.0); a.record(3000, 2.0)
        assertEquals(3, a.steps)
        repeat(6) { a.record(5000, 2.0) }
        assertEquals(2, a.steps)
    }

    @Test
    fun aSingleSlowOneOrAVeryShortPieceDoesNotCount() {
        val a = AutoSteps()
        a.record(3000, 2.0); a.record(100, 2.0); a.record(3000, 2.0)
        assertEquals(8, a.steps)
        repeat(5) { a.record(4000, 0.3) }
        assertEquals(8, a.steps)
    }
}
