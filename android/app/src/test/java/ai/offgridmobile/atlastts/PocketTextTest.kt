package ai.offgridmobile.atlastts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PocketTextTest {
    @Test
    fun aLongPassageBecomesShortPiecesThatEachStartWithACapitalAndEndWithPunctuation() {
        val text = "the quick brown fox jumps over the lazy dog, and then it keeps running across the field while the farmer watches from the gate, " +
            "wondering why anything would run that fast on a cold morning. Next comes another sentence that is also fairly long and has several parts, so it must be cut as well"
        val pieces = PocketText.prepare(text)
        assertTrue(pieces.size >= 3)
        for (p in pieces) {
            assertTrue(p.trim().length <= PocketText.MAX_CHARS)
            assertTrue(p.trim().first().isUpperCase())
            assertTrue(p.last() in ".!?,;:")
        }
    }

    @Test
    fun aVeryShortPieceGetsPaddingAndAFullStop() {
        assertEquals(listOf("        Yes."), PocketText.prepare("yes"))
    }

    @Test
    fun aLongRunWithNoPunctuationIsCutAtWordBoundaries() {
        val pieces = PocketText.prepare("word ".repeat(120))
        assertTrue(pieces.size >= 3)
        assertTrue(pieces.all { it.trim().length <= PocketText.MAX_CHARS })
    }

    @Test
    fun textWithNothingToSayGivesNoPieces() {
        assertTrue(PocketText.prepare("  ... --- ").isEmpty())
    }
}
