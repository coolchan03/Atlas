package ai.offgridmobile.localdream

import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Reject damaged or mislabeled checkpoints before native model loading. */
internal object AtlasImageCheckpointHeader {
    fun validate(file: File) {
        if (!file.isFile) throw IOException("Image checkpoint file does not exist")
        val length = file.length()
        RandomAccessFile(file, "r").use { raf ->
            when (file.extension.lowercase()) {
                "gguf" -> {
                    if (length < 8L) throw IOException("Truncated GGUF image checkpoint")
                    val magic = ByteArray(4)
                    raf.readFully(magic)
                    if (!magic.contentEquals(byteArrayOf(0x47, 0x47, 0x55, 0x46)))
                        throw IOException("Invalid GGUF checkpoint header. Reimport the original GGUF file.")
                    val versionBytes = ByteArray(4)
                    raf.readFully(versionBytes)
                    val version = ByteBuffer.wrap(versionBytes).order(ByteOrder.LITTLE_ENDIAN).int
                    if (version !in 2..3) throw IOException("Unsupported GGUF checkpoint version $version")
                }
                "safetensors" -> {
                    if (length < 10L) throw IOException("Truncated safetensors image checkpoint")
                    val headerBytes = ByteArray(8)
                    raf.readFully(headerBytes)
                    val headerLength = ByteBuffer.wrap(headerBytes).order(ByteOrder.LITTLE_ENDIAN).long
                    if (headerLength < 2L || headerLength > 16L * 1024 * 1024 ||
                        headerLength > length - 8L) {
                        throw IOException("Invalid safetensors header length. Reimport the model.")
                    }
                    if (raf.read() != '{'.code)
                        throw IOException("Invalid safetensors JSON header. Reimport the model.")
                }
                else -> throw IOException("Unsupported image checkpoint extension: " + file.extension)
            }
        }
    }
}
