package ai.offgridmobile.localdream

import java.util.Locale

/**
 * Parse sd-cli --list-devices without relying on incidental Vulkan log lines.
 * The upstream CLI outputs one device per line as "name<TAB>description".
 */
internal object AtlasVulkanProbe {
    data class Device(val name: String, val description: String)

    /** GPU device of the given API ("vulkan" or "opencl"); ggml names OpenCL "GPUOpenCL". */
    fun device(output: String, api: String = "vulkan"): Device? {
        val pattern = if (api == "opencl") Regex("""(gpu)?opencl[0-9]*""", RegexOption.IGNORE_CASE)
            else Regex("""vulkan[0-9]+""", RegexOption.IGNORE_CASE)
        for (line in output.lineSequence()) {
            val tab = line.indexOf('\t')
            if (tab < 1) continue
            val name = line.substring(0, tab).trim()
            if (!pattern.matches(name)) continue
            return Device(name.lowercase(Locale.US), line.substring(tab + 1).trim().take(160))
        }
        return null
    }

    /** Keep enough native output to distinguish a missing loader from driver failure. */
    fun summary(output: String, exitCode: Int, timedOut: Boolean): String {
        val cleaned = output.replace(Regex("""\x1b\[[0-9;]*m"""), "")
            .replace(Regex("""[\r\n\t]+"""), " | ")
            .trim().takeLast(650)
        val status = when {
            timedOut -> "probe timed out"
            exitCode != 0 -> "probe exit $exitCode"
            else -> "probe completed"
        }
        return if (cleaned.isEmpty()) "$status; no device details"
        else "$status; $cleaned"
    }
}
