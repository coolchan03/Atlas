package ai.offgridmobile.localdream

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class AtlasImageGpuPrecisionTest {
    @get:Rule val temporary = TemporaryFolder()

    private fun checkpoint(name: String, header: String): File {
        val file = temporary.newFile(name)
        val bytes = header.toByteArray(Charsets.UTF_8)
        val prefix = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            .putLong(bytes.size.toLong()).array()
        file.writeBytes(prefix + bytes + ByteArray(64))
        return file
    }

    @Test fun flagsBf16SafetensorsForFp16GpuLoading() {
        val model = checkpoint("anima-aesthetic-v1.1.safetensors",
            """{"transformer.layer.weight":{"dtype":"BF16","shape":[4,4],"data_offsets":[0,32]}}""")
        assertTrue(AtlasImageGpuPrecision.requiresFloat16Override(model))
        assertTrue(
            AtlasImageGpuPrecision.overrideArguments(model, true) ==
                listOf("--type", "f16"))
        assertTrue(AtlasImageGpuPrecision.overrideArguments(model, false).isEmpty())
    }

    @Test fun acceptsWhitespaceAndMixedDtypes() {
        val file = checkpoint("diffusion.safetensors",
            """{"foo":{"dtype":"F16"},"bar":{"dtype" : "BF16"}}""")
        assertTrue(AtlasImageGpuPrecision.requiresFloat16Override(file))
    }

    @Test fun leavesFp16AndQuantizedGgufAlone() {
        val f16 = checkpoint("anima-f16.safetensors", """{"layer":{"dtype":"F16"}}""")
        val gguf = checkpoint("anima-Q4_K_M.gguf", """{"layer":{"dtype":"BF16"}}""")
        assertFalse(AtlasImageGpuPrecision.requiresFloat16Override(f16))
        assertFalse(AtlasImageGpuPrecision.requiresFloat16Override(gguf))
        assertTrue(AtlasImageGpuPrecision.overrideArguments(gguf, true).isEmpty())
        assertTrue(AtlasImageGpuPrecision.overrideArguments(f16, true).isEmpty())
    }

    @Test fun ignoresBadAndTruncatedHeaders() {
        val truncated = temporary.newFile("truncated.safetensors")
        truncated.writeBytes(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            .putLong(123_456_789L).array())
        assertFalse(AtlasImageGpuPrecision.requiresFloat16Override(truncated))
        assertFalse(AtlasImageGpuPrecision.requiresFloat16Override(temporary.newFile("empty.safetensors")))
    }
}
