package ai.offgridmobile.localdream

import android.content.Context
import android.graphics.BitmapFactory
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.ArrayDeque
import java.util.UUID

/** Original safetensors and GGUF image weights executed by stable-diffusion.cpp. */
internal class AtlasNativeDiffusion(private val context: Context) {
    companion object { const val EXECUTABLE = "libatlas_sdcli.so" }
    @Volatile private var running: Process? = null
    fun available(): Boolean = File(context.applicationInfo.nativeLibraryDir, EXECUTABLE).isFile
    fun cancel() { running?.destroyForcibly() }

    fun generate(dirPath: String, params: ReadableMap, cancelled: () -> Boolean,
                 progress: (Int, Int) -> Unit): WritableMap {
        val dir = File(dirPath).canonicalFile
        val library = File(context.filesDir, "image_models").canonicalFile
        if (!dir.path.startsWith(library.path + File.separator)) throw IOException("Unsafe image model path")
        val manifestFile = File(dir, "atlas-image.json")
        if (!manifestFile.isFile) throw IOException("Not a directly imported image model")
        val manifest = JSONObject(manifestFile.readText())
        val primary = File(dir, manifest.getString("primary")).canonicalFile
        if (primary.parentFile != dir || !primary.isFile) throw IOException("Image weights are missing")
        val family = manifest.optString("family", "unknown")
        val variant = manifest.optString("variant", "base")
        if (!AtlasImageArchitecture.supported(family)) {
            throw IOException("Unsupported image architecture: " + family + ". Import a supported checkpoint.")
        }
        val executable = File(context.applicationInfo.nativeLibraryDir, EXECUTABLE)
        if (!executable.isFile) throw IOException("Native image runtime is missing from this APK")

        val width = (if (params.hasKey("width")) params.getInt("width") else 512).coerceIn(256, 1024)
        val height = (if (params.hasKey("height")) params.getInt("height") else 512).coerceIn(256, 1024)
        val steps = (if (params.hasKey("steps")) params.getInt("steps") else 20).coerceIn(1, 60)
        val seed = if (params.hasKey("seed")) params.getDouble("seed").toLong() else 42L
        val scale = if (params.hasKey("guidanceScale")) params.getDouble("guidanceScale") else 7.0
        var prompt = params.getString("prompt")?.trim() ?: ""
        if (prompt.isBlank()) throw IOException("A prompt is required")
        val id = UUID.randomUUID().toString()
        val output = File(File(context.filesDir, "generated_images").apply { mkdirs() }, "$id.png")
        val cmd = mutableListOf(executable.absolutePath)
        if (family in setOf("flux", "z_image", "anima", "chroma"))
            cmd.addAll(listOf("--diffusion-model", primary.absolutePath))
        else cmd.addAll(listOf("-m", primary.absolutePath))
        val attachments = mutableMapOf<String, File>()
        val support = manifest.optJSONArray("support")
        val loraDir = File(dir, "support/lora")
        var hasLora = false
        if (support != null) for (i in 0 until support.length()) {
            val item = support.getJSONObject(i)
            if (!item.optBoolean("enabled", true)) continue
            val kind = item.getString("kind")
            val path = File(item.getString("path")).canonicalFile
            if (!path.path.startsWith(File(dir, "support").canonicalPath + File.separator) ||
                !path.isFile) throw IOException("Missing or unsafe attached $kind file")
            if (kind == "lora") {
                if (params.hasKey("skipLoRA") && params.getBoolean("skipLoRA")) continue
                hasLora = true
                val name = path.name.substringBeforeLast('.')
                if (!name.matches(Regex("[a-zA-Z0-9_.-]+"))) throw IOException("Unsafe LoRA filename")
                val strength = item.optDouble("strength", 0.75).coerceIn(-2.0, 2.0)
                prompt += "<lora:$name:$strength>"
            } else attachments[kind] = path
        }
        val missing = AtlasImageArchitecture.missing(family, attachments.keys)
        if (missing.isNotEmpty()) {
            throw IOException(family.uppercase() + " is missing required components: " +
                missing.joinToString(", ") + ". Attach them in My models before generating.")
        }
        for ((type, flag) in listOf("vae" to "--vae", "clip_l" to "--clip_l",
                "t5xxl" to "--t5xxl", "llm" to "--llm")) {
            attachments[type]?.let { cmd.addAll(listOf(flag, it.absolutePath)) }
        }
        if (hasLora) cmd.addAll(listOf("--lora-model-dir", loraDir.absolutePath))
        cmd.addAll(listOf("-p", prompt, "-o", output.absolutePath,
            "-W", width.toString(), "-H", height.toString(),
            "--steps", steps.toString(), "-s", seed.toString(),
            "--cfg-scale", AtlasImageArchitecture.cfg(family, variant, scale).toString(),
            "--vae-tiling", "--clip-on-cpu"))
        // Architecture-specific parameters from stable-diffusion.cpp documentation.
        // Flash attention and CPU offloading reduce mobile memory pressure.
        if (family in setOf("z_image", "anima", "chroma")) {
            cmd.addAll(listOf("--sampling-method", "euler", "--offload-to-cpu", "--diffusion-fa"))
        }
        if (family == "chroma") cmd.addAll(listOf("--model-args", "chroma_use_dit_mask=false"))
        if (params.hasKey("negativePrompt") && family != "flux") {
            params.getString("negativePrompt")?.takeIf { it.isNotEmpty() }?.let {
                cmd.addAll(listOf("-n", it))
            }
        }
        val proc = ProcessBuilder(cmd).apply {
            directory(executable.parentFile)
            redirectErrorStream(true)
            environment()["LD_LIBRARY_PATH"] =
                listOf(executable.parent, "/system/lib64", "/vendor/lib64").joinToString(":")
        }.start()
        running = proc
        val tail = ArrayDeque<String>()
        try {
            proc.inputStream.bufferedReader().useLines { lines ->
                lines.forEach { line ->
                    if (tail.size >= 15) tail.removeFirst()
                    tail.addLast(line.take(300))
                    val stepMatch = Regex("(\\d+)\\s*/\\s*(\\d+)").find(line)
                    if (stepMatch != null) {
                        val step = stepMatch.groupValues[1].toIntOrNull() ?: 0
                        val total = stepMatch.groupValues[2].toIntOrNull() ?: steps
                        if (total in 1..100 && step in 0..total) progress(step, total)
                    }
                }
            }
            val code = proc.waitFor()
            if (cancelled()) throw IOException("Generation cancelled")
            if (code != 0 || !output.isFile || output.length() == 0L) {
                if (output.exists()) output.delete()
                throw IOException("Native image engine failed (exit $code). " + tail.joinToString(" | ").takeLast(900))
            }
            if (!params.hasKey("skipUpscaler") || !params.getBoolean("skipUpscaler")) {
                attachments["upscaler"]?.let { upscale(executable, it, output, cancelled) }
            }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(output.absolutePath, bounds)
            return Arguments.createMap().apply {
                putString("id", id)
                putString("imagePath", output.absolutePath)
                putInt("width", bounds.outWidth.takeIf { it > 0 } ?: width)
                putInt("height", bounds.outHeight.takeIf { it > 0 } ?: height)
                putDouble("seed", seed.toDouble())
            }
        } finally {
            if (running === proc) running = null
            if (proc.isAlive) proc.destroyForcibly()
        }
    }

    private fun upscale(executable: File, upscaler: File, original: File, cancelled: () -> Boolean) {
        val result = File(original.parentFile, original.nameWithoutExtension + ".upscaled.png")
        val args = listOf(executable.absolutePath, "-M", "upscale", "-i", original.absolutePath,
            "--upscale-model", upscaler.absolutePath, "-o", result.absolutePath)
        val process = ProcessBuilder(args).apply {
            directory(executable.parentFile)
            redirectErrorStream(true)
            environment()["LD_LIBRARY_PATH"] =
                listOf(executable.parent, "/system/lib64", "/vendor/lib64").joinToString(":")
        }.start()
        running = process
        try {
            val log = process.inputStream.bufferedReader().use { it.readText().takeLast(800) }
            val code = process.waitFor()
            if (cancelled()) throw IOException("Image upscaling cancelled")
            if (code != 0 || !result.isFile || result.length() <= 0L) {
                throw IOException("Image upscaling failed (exit $code). $log")
            }
            if (!original.delete() || !result.renameTo(original)) {
                throw IOException("Cannot save upscaled image")
            }
        } finally {
            if (running === process) running = null
            if (process.isAlive) process.destroyForcibly()
            if (result.exists()) result.delete()
        }
    }
}
