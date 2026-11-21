package ai.offgridmobile.localdream

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class AtlasImageCheckpointHeaderTest {
    private fun temp(extension: String, bytes: ByteArray): File =
        File.createTempFile("atlas-image-checkpoint-", ".$extension").apply {
            writeBytes(bytes)
            deleteOnExit()
        }

    private fun leLong(number: Long): ByteArray =
        ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(number).array()

    private fun expectInvalid(file: File) {
        try {
            AtlasImageCheckpointHeader.validate(file)
            throw AssertionError("Invalid checkpoint unexpectedly accepted")
        } catch (expected: IOException) {
            assertTrue(expected.message!!.isNotBlank())
        } finally {
            file.delete()
        }
    }

    @Test fun acceptsGgufMagicAndVersion3() {
        val file = temp("gguf", byteArrayOf(71, 71, 85, 70, 3, 0, 0, 0))
        AtlasImageCheckpointHeader.validate(file)
        file.delete()
    }

    @Test fun rejectsIncorrectGgufMagic() {
        expectInvalid(temp("gguf", byteArrayOf(0, 0, 0, 0, 3, 0, 0, 0)))
    }

    @Test fun acceptsSafetensorsWithJsonHeader() {
        val file = temp("safetensors", leLong(2) + "{}".toByteArray())
        AtlasImageCheckpointHeader.validate(file)
        file.delete()
    }

    @Test fun rejectsTruncatedSafetensorsHeader() {
        expectInvalid(temp("safetensors", leLong(100) + "{}".toByteArray()))
    }

    @Test fun rejectsUnsupportedExtensions() {
        expectInvalid(temp("pth", byteArrayOf(1, 2, 3, 4)))
    }
}
