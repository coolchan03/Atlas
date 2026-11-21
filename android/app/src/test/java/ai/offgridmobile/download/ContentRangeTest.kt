package ai.offgridmobile.download

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentRangeTest {
    @Test fun acceptsRangeStartingAtExistingOffset() {
        assertTrue(WorkerDownload.contentRangeStartsAt("bytes 100-999/1000", 100))
        assertTrue(WorkerDownload.contentRangeStartsAt("bytes 100-999/*", 100))
    }

    @Test fun rejectsMismatchedMissingOrMalformedRange() {
        assertFalse(WorkerDownload.contentRangeStartsAt("bytes 0-999/1000", 100))
        assertFalse(WorkerDownload.contentRangeStartsAt("bytes 100-50/1000", 100))
        assertFalse(WorkerDownload.contentRangeStartsAt("garbage", 100))
        assertFalse(WorkerDownload.contentRangeStartsAt(null, 100))
    }
}
