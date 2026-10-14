package ai.offgridmobile.localdream

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * A deliberately small, versioned configuration contract for stable-diffusion.cpp.
 * Arbitrary Diffusers/tokenizer JSON cannot be interpreted by sd.cpp and must not
 * silently change the native engine or be reported as a supported pipeline.
 */
internal object AtlasNativeImageConfig {
    const val FILE_NAME = "atlas-runtime.json"
    const val SCHEMA = "atlas-native-image/v1"

    internal data class RuntimeOptions(val samplingMethod: String?, val schedule: String?)

    private val samplers = setOf("euler", "euler_a", "heun", "dpm2", "dpm++2s_a",
        "dpm++2m", "dpm++2mv2", "lcm")
    private val schedules = setOf("discrete", "karras", "ays")
    private val allowedKeys = setOf("schema", "sampling_method", "schedule")

    /** Called during file import, before a malformed config can enter the manifest. */
    fun validateForAttachment(fileName: String, json: JSONObject) {
        if (fileName.equals(FILE_NAME, ignoreCase = true)) parse(json)
    }

    fun parse(json: JSONObject): RuntimeOptions {
        if (json.optString("schema") != SCHEMA) {
            throw IOException("$FILE_NAME requires schema \"$SCHEMA\"")
        }
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (key !in allowedKeys) {
                throw IOException("$FILE_NAME contains unsupported field '$key'. " +
                    "Only sampling_method and schedule are available in this native engine.")
            }
        }
        val method = if (json.has("sampling_method")) {
            val value = json.optString("sampling_method")
            if (value !in samplers) {
                throw IOException("Unsupported native sampling_method '$value'; choose one of " +
                    samplers.sorted().joinToString(", "))
            }
            value
        } else null
        val schedule = if (json.has("schedule")) {
            val value = json.optString("schedule")
            if (value !in schedules) {
                throw IOException("Unsupported native schedule '$value'; choose discrete, karras or ays.")
            }
            value
        } else null
        if (method == null && schedule == null) {
            throw IOException("$FILE_NAME must contain sampling_method or schedule.")
        }
        return RuntimeOptions(method, schedule)
    }

    /**
     * Only the opt-in Atlas schema affects CLI options. Generic .json attachments
     * are metadata; this prevents bogus architecture/tokenizer support claims.
     */
    fun resolve(modelDir: File, support: JSONArray?): RuntimeOptions? {
        if (support == null) return null
        val root = File(modelDir, "support").canonicalFile
        var result: RuntimeOptions? = null
        for (i in 0 until support.length()) {
            val item = support.optJSONObject(i) ?: continue
            if (item.optString("kind") != "config" ||
                !item.optBoolean("enabled", true) ||
                !item.optString("name").equals(FILE_NAME, ignoreCase = true)) continue
            if (result != null) throw IOException("Only one enabled $FILE_NAME can be attached.")
            val attached = File(item.optString("path")).canonicalFile
            if (!attached.path.startsWith(root.path + File.separator) || !attached.isFile) {
                throw IOException("Missing or unsafe $FILE_NAME attachment.")
            }
            if (attached.length() > 32L * 1024L * 1024L) {
                throw IOException("$FILE_NAME exceeds the 32 MB limit.")
            }
            val json = try { JSONObject(attached.readText()) }
                catch (e: Exception) { throw IOException("Invalid $FILE_NAME: " + (e.message ?: "parse failed")) }
            result = parse(json)
        }
        return result
    }

    /** AYS sigma tables exist only for SD 1.x and SDXL; on other families sd.cpp returns
     *  all-zero sigmas and silently renders a blank image. */
    private val aysFamilies = setOf("sd15", "sdxl")

    /** Append only CLI values that were checked against the versioned allowlist. */
    fun addArguments(command: MutableList<String>, options: RuntimeOptions?, family: String) {
        if (options?.schedule == "ays" && family !in aysFamilies) {
            throw IOException("The \"ays\" schedule only works with SD 1.x and SDXL models. " +
                "Use discrete or karras in $FILE_NAME for this model.")
        }
        val method = options?.samplingMethod ?: if (family in setOf("z_image", "anima", "chroma")) "euler" else null
        if (method != null) command.addAll(listOf("--sampling-method", method))
        options?.schedule?.let { command.addAll(listOf("--scheduler", it)) }
    }
}
