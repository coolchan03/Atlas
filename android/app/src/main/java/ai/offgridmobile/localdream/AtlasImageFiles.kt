package ai.offgridmobile.localdream

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.DataInputStream
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Streamed, non-converting import for SDXL, SD1.x and FLUX image weights. */
internal object AtlasImageFiles {
    private val kinds = setOf("lora", "vae", "clip_l", "t5xxl", "upscaler")
    fun inspect(ctx: Context, uriText: String, fileName: String): JSONObject {
        val lower = fileName.lowercase()
        val result = JSONObject().put("kind", "unknown").put("family", "unknown")
        val uri = Uri.parse(if (uriText.startsWith("/")) "file://$uriText" else uriText)
        ctx.contentResolver.openInputStream(uri)?.use { input ->
            val first = ByteArray(8)
            try { DataInputStream(input).readFully(first) }
            catch (_: Exception) { throw IOException("File header is incomplete") }
            if (lower.endsWith(".gguf")) {
                if (!first.copyOfRange(0, 4).contentEquals("GGUF".toByteArray())) {
                    throw IOException("Invalid GGUF header")
                }
                // Read the general.architecture *value* rather than looking for "flux" anywhere
                // in the vocabulary, which would misclassify some language GGUFs as image models.
                val peek = ByteArray(262144)
                val count = input.read(peek).coerceAtLeast(0)
                val key = "general.architecture".toByteArray()
                val index = (0..(count - key.size)).firstOrNull { start ->
                    key.indices.all { peek[start + it] == key[it] }
                } ?: -1
                var arch = ""
                if (index >= 0 && index + key.size + 12 <= count) {
                    val pos = index + key.size
                    val valueType = ByteBuffer.wrap(peek, pos, 4).order(ByteOrder.LITTLE_ENDIAN).int
                    val valueLength = ByteBuffer.wrap(peek, pos + 4, 8).order(ByteOrder.LITTLE_ENDIAN).long
                    if (valueType == 8 && valueLength >= 1L && valueLength <= 64L &&
                        pos + 12 + valueLength <= count) {
                        arch = String(peek, pos + 12, valueLength.toInt(), Charsets.UTF_8).lowercase()
                    }
                }
                val flux = arch == "flux"
                val sdxl = arch == "sdxl" || arch == "stable-diffusion-xl"
                val sd = arch == "sd" || arch == "stable-diffusion"
                result.put("kind", if (flux || sdxl || sd) "image" else "unknown")
                result.put("family", if (flux) "flux" else if (sdxl) "sdxl" else if (sd) "sd15" else "unknown")
            } else if (lower.endsWith(".safetensors") || lower.endsWith(".safetensor")) {
                val length = ByteBuffer.wrap(first).order(ByteOrder.LITTLE_ENDIAN).long
                if (length <= 2 || length > 24L * 1024L * 1024L) {
                    throw IOException("Invalid safetensors header size; model may be incomplete")
                }
                val headerBytes = ByteArray(length.toInt())
                var done = 0
                while (done < headerBytes.size) {
                    val n = input.read(headerBytes, done, headerBytes.size - done)
                    if (n < 0) throw IOException("Truncated safetensors header")
                    done += n
                }
                val headerText = String(headerBytes, Charsets.UTF_8)
                val json = JSONObject(headerText)
                var finalTensorOffset = 0L
                val entries = json.keys()
                while (entries.hasNext()) {
                    val entry = json.optJSONObject(entries.next()) ?: continue
                    val offsets = entry.optJSONArray("data_offsets") ?: continue
                    if (offsets.length() == 2) {
                        finalTensorOffset = maxOf(finalTensorOffset, offsets.optLong(1, 0L))
                    }
                }
                if (finalTensorOffset > 0) result.put("expectedSize", 8L + length + finalTensorOffset)
                val header = headerText.lowercase()
                val lora = header.contains("lora_up") || header.contains("lora_down") ||
                    header.contains("lora_a.weight") || header.contains("lora_b.weight") ||
                    header.contains("lora_unet") || header.contains("lycoris")
                val flux = header.contains("double_blocks.") && header.contains("single_blocks.")
                val sdxl = header.contains("conditioner.embedders.1.") ||
                    header.contains("text_encoder_2.") || header.contains("clip_g.")
                val sd = header.contains("model.diffusion_model.") ||
                    header.contains("diffusion_model.") || header.contains("unet.")
                result.put("kind", if (lora) "lora" else if (flux || sdxl || sd) "image" else "unknown")
                result.put("family", if (flux) "flux" else if (sdxl) "sdxl" else if (sd) "sd15" else "unknown")
            } else throw IOException("Unsupported image weight extension")
        } ?: throw IOException("Cannot read selected file")
        return result
    }

    private fun privateDir(ctx: Context, dir: String): File {
        val root = File(ctx.filesDir, "image_models").canonicalFile
        val target = File(dir).canonicalFile
        if (!target.path.startsWith(root.path + File.separator)) {
            throw IOException("Import destination is outside the image model library")
        }
        target.mkdirs()
        return target
    }

    fun copy(ctx: Context, uriText: String, out: File, progress: (Double) -> Unit): Long {
        val uri = Uri.parse(if (uriText.startsWith("/")) "file://$uriText" else uriText)
        val size = try { ctx.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L }
            catch (_: Exception) { -1L }
        if (size > 0 && out.parentFile!!.usableSpace < size + 128L * 1024 * 1024) {
            throw IOException("Not enough free phone storage to import this model without conversion")
        }
        val temp = File(out.parentFile, out.name + ".partial")
        try {
            var copied = 0L
            (ctx.contentResolver.openInputStream(uri) ?: throw IOException("Cannot open selected file")).use { input ->
                temp.outputStream().buffered().use { output ->
                    val buf = ByteArray(1024 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        copied += n
                        if (size > 0) progress(copied.toDouble() / size)
                    }
                }
            }
            if (copied == 0L || (size > 0 && copied != size)) throw IOException("Model copy was incomplete")
            if (out.exists()) out.delete()
            if (!temp.renameTo(out)) throw IOException("Could not finalize model import")
            return copied
        } finally {
            if (temp.exists()) temp.delete()
        }
    }

    fun importPrimary(ctx: Context, uri: String, dir: String, name: String,
                      progress: (Double) -> Unit): JSONObject {
        val info = inspect(ctx, uri, name)
        if (info.getString("kind") == "lora") {
            throw IOException("This file is a LoRA. Attach it to an image model instead of importing it as a checkpoint.")
        }
        val folder = privateDir(ctx, dir)
        val ext = if (name.lowercase().endsWith(".gguf")) "gguf" else "safetensors"
        val target = File(folder, "model.$ext")
        val size = copy(ctx, uri, target, progress)
        val expected = info.optLong("expectedSize", -1L)
        if (expected > 0L && size != expected) {
            target.delete()
            throw IOException("Incomplete safetensors checkpoint: expected $expected bytes but copied $size. Redownload the full file.")
        }
        val manifest = JSONObject().put("family", info.getString("family"))
            .put("primary", target.name).put("support", JSONArray())
        File(folder, "atlas-image.json").writeText(manifest.toString())
        File(folder, "_ready").writeText("")
        return JSONObject().put("modelDir", folder.absolutePath).put("size", size)
            .put("family", info.getString("family")).put("kind", info.getString("kind"))
    }

    fun modify(ctx: Context, dir: String, kind: String, name: String,
               delete: Boolean, enabled: Boolean, strength: Double): JSONObject {
        val folder = privateDir(ctx, dir)
        val file = File(folder, "atlas-image.json")
        if (!file.isFile) throw IOException("Image support manifest not found")
        val manifest = JSONObject(file.readText())
        val source = manifest.optJSONArray("support") ?: JSONArray()
        val next = JSONArray()
        var matched = false
        for (i in 0 until source.length()) {
            val item = source.getJSONObject(i)
            if (item.optString("kind") == kind && item.optString("name") == name) {
                matched = true
                val attached = File(item.getString("path")).canonicalFile
                val supportRoot = File(folder, "support").canonicalFile
                if (!attached.path.startsWith(supportRoot.path + File.separator)) {
                    throw IOException("Support path outside image library")
                }
                if (delete) {
                    if (attached.exists() && !attached.delete()) throw IOException("Cannot remove support file")
                    continue
                }
                item.put("enabled", enabled)
                item.put("strength", strength.coerceIn(-2.0, 2.0))
            }
            next.put(item)
        }
        if (!matched) throw IOException("Support file not found")
        manifest.put("support", next)
        file.writeText(manifest.toString())
        return manifest
    }

    fun attach(ctx: Context, uri: String, dir: String, name: String, kind: String,
               strength: Double, progress: (Double) -> Unit): JSONObject {
        if (kind !in kinds) throw IOException("Unknown image support file type")
        val suffix = name.substringAfterLast('.', "").lowercase()
        val permitted = if (kind == "upscaler") setOf("pth", "pt", "safetensors", "gguf")
            else if (kind == "clip_l" || kind == "t5xxl") setOf("safetensors", "gguf")
            else setOf("safetensors")
        if (suffix !in permitted) throw IOException(".$suffix is not a supported $kind file type")
        val folder = privateDir(ctx, dir)
        val file = File(folder, "atlas-image.json")
        if (!file.exists()) throw IOException("Support files require a directly imported image model")
        val manifest = JSONObject(file.readText())
        val cleaned = name.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
        if (cleaned == "." || cleaned == ".." || cleaned.isEmpty()) throw IOException("Invalid filename")
        val supportDir = File(folder, "support/$kind").apply { mkdirs() }
        val destination = File(supportDir, cleaned)
        val size = copy(ctx, uri, destination, progress)
        val arr = manifest.getJSONArray("support")
        for (i in arr.length() - 1 downTo 0) {
            if (arr.getJSONObject(i).optString("kind") == kind &&
                (kind != "lora" || arr.getJSONObject(i).optString("name") == cleaned)) arr.remove(i)
        }
        arr.put(JSONObject().put("kind", kind).put("name", cleaned)
            .put("path", destination.absolutePath).put("strength", strength).put("enabled", true))
        file.writeText(manifest.toString())
        return JSONObject().put("kind", kind).put("name", cleaned)
            .put("path", destination.absolutePath).put("size", size)
            .put("strength", strength).put("enabled", true)
    }
}
