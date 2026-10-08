package ai.offgridmobile.localdream

import android.content.Context
import java.io.File
import java.io.IOException
import java.util.zip.ZipInputStream

/** Stream model ZIP entries to disk; never buffer the whole multi-GB archive in memory. */
internal object AtlasZipExtractor {
    data class Result(val files: Int, val bytes: Long)

    fun extract(ctx: Context, zipPath: String, modelDir: String,
                onProgress: (Int, Long) -> Unit): Result {
        val library = File(ctx.filesDir, "image_models").canonicalFile
        val archive = File(zipPath).canonicalFile
        val outputDir = File(modelDir).canonicalFile
        val rootPrefix = library.path + File.separator
        if (!archive.path.startsWith(rootPrefix) || !outputDir.path.startsWith(rootPrefix)) {
            throw IOException("ZIP path outside Atlas image model library")
        }
        if (!archive.isFile || archive.length() == 0L || !archive.name.endsWith(".zip", true)) {
            throw IOException("Downloaded image ZIP is missing or empty")
        }
        if (!outputDir.exists() && !outputDir.mkdirs()) throw IOException("Cannot create model folder")
        val buffer = ByteArray(256 * 1024)
        var fileCount = 0
        var totalBytes = 0L

        ZipInputStream(archive.inputStream().buffered(256 * 1024)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val entryName = entry.name.replace('\\', '/')
                if (entryName.startsWith("/") || entryName.isBlank() ||
                    entryName.split('/').any { it == ".." || it == "." }) {
                    throw IOException("Invalid path inside model ZIP: $entryName")
                }
                val output = File(outputDir, entryName).canonicalFile
                if (!output.path.startsWith(outputDir.path + File.separator)) {
                    throw IOException("Unsafe ZIP entry outside model directory")
                }
                if (entry.isDirectory) {
                    if (!output.isDirectory && !output.mkdirs()) {
                        throw IOException("Cannot create directory in image ZIP: $entryName")
                    }
                } else {
                    if (!output.parentFile.isDirectory && !output.parentFile.mkdirs()) {
                        throw IOException("Cannot create parent folder for: $entryName")
                    }
                    val partial = File(output.parentFile, output.name + ".partial")
                    var entryBytes = 0L
                    try {
                        partial.outputStream().buffered(256 * 1024).use { dest ->
                            while (true) {
                                val n = zip.read(buffer)
                                if (n == -1) break
                                if (n == 0) continue
                                dest.write(buffer, 0, n)
                                entryBytes += n
                            }
                        }
                        if (entry.size >= 0 && entryBytes != entry.size) {
                            throw IOException("Truncated ZIP entry $entryName")
                        }
                        if (output.exists() && !output.delete()) throw IOException("Cannot replace $entryName")
                        if (!partial.renameTo(output)) throw IOException("Cannot finish extracting $entryName")
                    } finally {
                        if (partial.exists()) partial.delete()
                    }
                    totalBytes += entryBytes
                    fileCount++
                    onProgress(fileCount, totalBytes)
                }
                zip.closeEntry()
            }
        }
        if (fileCount == 0 || totalBytes <= 0) throw IOException("Model ZIP did not contain any non-empty files")
        return Result(fileCount, totalBytes)
    }
}
