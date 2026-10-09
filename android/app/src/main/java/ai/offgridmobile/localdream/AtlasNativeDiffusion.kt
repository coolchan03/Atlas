package ai.offgridmobile.localdream

import android.content.Context
import android.graphics.BitmapFactory
import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.ArrayDeque
import java.util.UUID

/** Original safetensors and GGUF image weights executed by stable-diffusion.cpp. */
internal class AtlasNativeDiffusion(private val context: Context) {
    companion object { const val EXECUTABLE = "libatlas_sdcli.so" }
    @Volatile private var running: Process? = null
    @Volatile private var startedMs = 0L
    @Volatile private var lastOutputMs = 0L
    @Volatile private var lastStepMs = 0L
    @Volatile private var reportedStep = 0
    @Volatile private var requestedSteps = 0
    @Volatile private var phase = "Idle"
    @Volatile private var computeBackend = "not selected"
    @Volatile private var deviceLabel = "not probed"
    @Volatile private var vulkanSupported: Boolean? = null

    private fun detectVulkan(cli: File, cancelled: () -> Boolean): Boolean {
        val cached = vulkanSupported
        if (cached != null) return cached
        if (cancelled()) return false
        val proc = try {
            ProcessBuilder(cli.absolutePath, "--list-devices").apply {
                directory(cli.parentFile)
                redirectErrorStream(true)
                environment()["LD_LIBRARY_PATH"] =
                    listOf(cli.parent, "/system/lib64", "/vendor/lib64").joinToString(":")
            }.start()
        } catch (_: Exception) {
            vulkanSupported = false
            deviceLabel = "Vulkan probe unavailable"
            return false
        }
        running = proc
        return try {
            if (!proc.waitFor(12, TimeUnit.SECONDS) || cancelled()) {
                proc.destroyForcibly()
                deviceLabel = "Vulkan detection timed out or was cancelled"
                false
            } else {
                val output = proc.inputStream.bufferedReader().use { it.readText().take(3000) }
                val found = proc.exitValue() == 0 && Regex("""vulkan0""", RegexOption.IGNORE_CASE).containsMatchIn(output)
                deviceLabel = if (found) "Vulkan GPU detected" else "No usable Vulkan device reported"
                vulkanSupported = found
                found
            }
        } catch (_: Exception) {
            proc.destroyForcibly()
            deviceLabel = "GPU detection failed"
            false
        } finally {
            if (running === proc) running = null
            if (proc.isAlive) proc.destroyForcibly()
        }
    }

    /** Android SDK Process lacks pid(); read it optionally for status diagnostics. */
    private fun childPid(process: Process): Long? = try {
        (process.javaClass.getMethod("pid").invoke(process) as? Number)?.toLong()?.takeIf { it > 0L }
    } catch (_: Exception) { null }

    /** Lightweight native status; unlike a spinning UI, also reports child CPU ticks. */
    fun status(): WritableMap {
        val now = SystemClock.elapsedRealtime()
        val process = running
        val alive = process?.isAlive == true
        val ticks = try {
            if (alive && process != null) {
                childPid(process)?.let { pid -> AtlasImageProgress.cpuTicks(File("/proc/$pid/stat").readText()) }
            } else null
        } catch (_: Exception) { null }
        return Arguments.createMap().apply {
            putBoolean("running", alive)
            putString("stage", phase)
            putString("computeBackend", computeBackend)
            putString("deviceLabel", deviceLabel)
            putInt("step", reportedStep)
            putInt("totalSteps", requestedSteps)
            putDouble("elapsedSeconds", if (startedMs > 0) (now - startedMs) / 1000.0 else 0.0)
            putDouble("secondsSinceStep", if (lastStepMs > 0) (now - lastStepMs) / 1000.0 else -1.0)
            putDouble("secondsSinceLog", if (lastOutputMs > 0) (now - lastOutputMs) / 1000.0 else -1.0)
            putDouble("cpuTicks", ticks?.toDouble() ?: -1.0)
        }
    }

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

        // imageUseOpenCL remains the existing settings key for compatibility,
        // but maps to Vulkan for directly imported diffusion models.
        val preferGpu = !params.hasKey("useOpenCL") || params.getBoolean("useOpenCL")
        phase = if (preferGpu) "Checking Vulkan GPU" else "CPU selected manually"
        val gpuAvailable = preferGpu && detectVulkan(executable, cancelled)
        if (cancelled()) throw IOException("Generation cancelled")
        computeBackend = if (gpuAvailable) "Vulkan GPU (diffusion)" else "CPU"
        if (!preferGpu) deviceLabel = "GPU disabled in settings"

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
        // Explicit execution assignment: quantized transformer diffusion
        // runs on Vulkan, while Qwen/T5 encoders and VAE stay on CPU to reduce
        // transient GPU allocations. Respect the available-device probe.
        if (gpuAvailable) {
            cmd.addAll(listOf("--backend", "diffusion=vulkan0,te=cpu,vae=cpu",
                "--auto-fit", "on", "--max-vram", "vulkan0=4"))
        } else {
            cmd.addAll(listOf("--backend", "cpu"))
        }
        cmd.addAll(listOf("-p", prompt, "-o", output.absolutePath,
            "-W", width.toString(), "-H", height.toString(),
            "--steps", steps.toString(), "-s", seed.toString(),
            "--cfg-scale", AtlasImageArchitecture.cfg(family, variant, scale).toString(),
            "--vae-tiling", "--clip-on-cpu"))
        // sdcpp defaults to every physical core. Four threads is more thermal-
        // friendly on a phone; expose it in Atlas settings for native checkpoints.
        val threads = (if (params.hasKey("threads")) params.getInt("threads") else 4).coerceIn(1, 8)
        cmd.addAll(listOf("--threads", threads.toString(), "--log-level", "verbose"))
        // On Vulkan, auto-fit manages residency: do NOT force
        // --offload-to-cpu, which would disable auto-fit and over-stage weights.
        if (family in setOf("z_image", "anima", "chroma")) {
            cmd.addAll(listOf("--sampling-method", "euler", "--diffusion-fa"))
            if (!gpuAvailable) cmd.add("--offload-to-cpu")
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
        val startTime = SystemClock.elapsedRealtime()
        startedMs = startTime
        lastOutputMs = startTime
        lastStepMs = 0L
        reportedStep = 0
        requestedSteps = steps
        phase = "Starting " + computeBackend
        running = proc
        val tail = ArrayDeque<String>()
        try {
            // CLI terminal progress bars are carriage-return-delimited rather
            // than newline-delimited. BufferedReader.readLine() would hide all
            // intermediate steps, presenting a false "stuck on 1/x" state.
            fun acceptFrame(line: String) {
                lastOutputMs = SystemClock.elapsedRealtime()
                if (tail.size >= 15) tail.removeFirst()
                tail.addLast(line.take(300))
                AtlasImageProgress.stage(line)?.let { phase = it }
                val step = AtlasImageProgress.parseStep(line, steps)
                if (step != null && step > reportedStep) {
                    lastStepMs = lastOutputMs
                    reportedStep = step
                    phase = "Running diffusion"
                    progress(step, steps)
                }
            }
            proc.inputStream.bufferedReader().use { reader ->
                val frame = StringBuilder()
                while (true) {
                    val next = reader.read()
                    if (next < 0) {
                        if (frame.isNotEmpty()) acceptFrame(frame.toString())
                        break
                    }
                    when (next.toChar()) {
                        '\r', '\n' -> {
                            if (frame.isNotEmpty()) {
                                acceptFrame(frame.toString())
                                frame.setLength(0)
                            }
                        }
                        else -> if (frame.length < 4096) frame.append(next.toChar())
                    }
                }
            }
            val code = proc.waitFor()
            if (cancelled()) throw IOException("Generation cancelled")
            if (code != 0 || !output.isFile || output.length() == 0L) {
                if (output.exists()) output.delete()
                val hint = if (gpuAvailable)
                    "Vulkan execution failed. Try a smaller quantized Anima checkpoint, reduce resolution, or disable GPU Acceleration to try CPU. "
                    else "CPU image generation failed. "
                throw IOException(hint + "Native engine exit " + code + ": " + tail.joinToString(" | ").takeLast(900))
            }
            phase = "Finalizing image"
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
            phase = if (cancelled()) "Cancelled" else "Finished"
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
