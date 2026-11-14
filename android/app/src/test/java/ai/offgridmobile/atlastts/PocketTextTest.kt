package ai.offgridmobile.atlastts

import org.junit.Assert.assertEquals
import org.junit.Test

class PocketTextTest {
    @Test
    fun aPhraseWithNoEndingGetsAFullStop() {
        assertEquals("Hey man how is it going.", PocketText.prepare("Hey man how is it going"))
        assertEquals("        Hi there.", PocketText.prepare("hi there"))
    }

    @Test
    fun aLongSentenceIsNotCutOrPadded() {
        val text = "the quick brown fox jumps over the lazy dog, and then it keeps running across the field while the farmer watches from the gate"
        assertEquals("The quick brown fox jumps over the lazy dog, and then it keeps running across the field while the farmer watches from the gate.", PocketText.prepare(text))
    }

    @Test
    fun existingPunctuationIsKept() {
        assertEquals("How are you today? Fine, thanks.", PocketText.prepare("How are you today?  Fine, thanks."))
        assertEquals("        Wow!", PocketText.prepare("wow!"))
    }

    @Test
    fun aTrailingCommaBecomesAFullStop() {
        assertEquals("Well, this is what I think about it all.", PocketText.prepare("Well, this is what I think about it all,"))
    }

    @Test
    fun textWithNothingToSayIsLeftAlone() {
        assertEquals("  ... ", PocketText.prepare("  ... "))
    }
}
