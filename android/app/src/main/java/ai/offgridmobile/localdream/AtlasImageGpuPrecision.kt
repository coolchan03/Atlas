package ai.offgridmobile.localdream

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.util.Locale

/**
 * sd.cpp can convert BF16 safetensors to F16 while loading (--type f16).
 *
 * Some Android Adreno Vulkan drivers fail to compile the BF16 matvec pipeline:
 *   mul_mat_vec_bf16_f32_f32: vk::Device::createComputePipeline ErrorUnknown
 *
 * Only request the conversion when the diffusion checkpoint actually contains
 * BF16 tensors. Leave quantized GGUF checkpoints untouched.
 */
internal object AtlasImageGpuPrecision {
    private const val MAX_HEADER_BYTES = 8 * 1024 * 1024
    private val bf16Dtype = Regex("\"dtype\"\\s*:\\s*\"BF16\"")

    fun overrideArguments(weights: File, vulkanRequested: Boolean): List<String> =
        if (vulkanRequested && requiresFloat16Override(weights)) listOf("--type", "f16")
        else emptyList()

    fun requiresFloat16Override(weights: File): Boolean {
        if (weights.extension.lowercase(Locale.US) != "safetensors") return false
        return try {
            RandomAccessFile(weights, "r").use { input ->
                if (input.length() <= 8) return false
                val headerSizeBytes = ByteArray(8)
                input.readFully(headerSizeBytes)
                val length = ByteBuffer.wrap(headerSizeBytes)
                    .order(ByteOrder.LITTLE_ENDIAN).long
                if (length <= 0 || length > MAX_HEADER_BYTES ||
                    length > input.length() - 8) return false
                val header = ByteArray(length.toInt())
                input.readFully(header)
                bf16Dtype.containsMatchIn(String(header, StandardCharsets.UTF_8))
            }
        } catch (_: Exception) {
            // Unreadable headers are handled by the downstream native loader.
            false
        }
    }
}
