package ai.offgridmobile.atlasdevice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShareTextTest {
    @Test fun takesSharedText() {
        assertEquals("https://example.com/a", ShareText.from(ShareText.ACTION_SEND, "text/plain", " https://example.com/a \n", null))
    }

    @Test fun takesSelectedText() {
        assertEquals("selected words", ShareText.from(ShareText.ACTION_PROCESS_TEXT, "text/plain", null, "selected words"))
    }

    @Test fun ignoresOtherActionsTypesAndEmptyText() {
        assertNull(ShareText.from("android.intent.action.MAIN", "text/plain", "x", "y"))
        assertNull(ShareText.from(ShareText.ACTION_SEND, "image/png", "x", null))
        assertNull(ShareText.from(ShareText.ACTION_SEND, "text/plain", "   ", null))
        assertNull(ShareText.from(ShareText.ACTION_SEND, "text/plain", null, null))
        assertNull(ShareText.from(ShareText.ACTION_PROCESS_TEXT, "text/plain", "ignored", null))
    }

    @Test fun takesSharedFilesOfKindsAtlasCanOpen() {
        assertEquals("content://a/1", ShareText.fileUri(ShareText.ACTION_SEND, "application/pdf", "content://a/1"))
        assertEquals("content://a/2", ShareText.fileUri(ShareText.ACTION_SEND, "image/jpeg", "content://a/2"))
        assertEquals("content://a/3", ShareText.fileUri(ShareText.ACTION_SEND, "IMAGE/PNG", "content://a/3"))
        assertEquals("content://a/4", ShareText.fileUri(ShareText.ACTION_SEND, "text/plain", "content://a/4"))
    }

    @Test fun ignoresFilesOfOtherKindsAndShareWithoutAStream() {
        assertNull(ShareText.fileUri(ShareText.ACTION_SEND, "video/mp4", "content://a/5"))
        assertNull(ShareText.fileUri(ShareText.ACTION_SEND, "application/pdf", null))
        assertNull(ShareText.fileUri(ShareText.ACTION_SEND, "application/pdf", " "))
        assertNull(ShareText.fileUri(ShareText.ACTION_SEND, null, "content://a/6"))
        assertNull(ShareText.fileUri("android.intent.action.MAIN", "application/pdf", "content://a/7"))
    }

    @Test fun cutsVeryLongText() {
        val text = ShareText.from(ShareText.ACTION_SEND, "text/plain", "a".repeat(ShareText.MAX_CHARS + 500), null)!!
        assertEquals(ShareText.MAX_CHARS, text.length)
    }
}
