package ai.offgridmobile.localdream

/** Model-family rules shared by the importer and native CLI.
 * A recognized name is a family hint, NOT proof that weights are valid.
 */
internal object AtlasImageArchitecture {
    private val supported = setOf("sd15", "sdxl", "flux", "z_image", "anima", "chroma")
    fun supported(family: String): Boolean = family in supported

    fun classify(fileName: String, architecture: String = "", tensorKeys: String = ""): String {
        val name = fileName.lowercase()
        val arch = architecture.lowercase()
        val keys = tensorKeys.lowercase()
        // Check known model names before generic Flux keys: Chroma is Flux-derived.
        if (name.contains("pony-v7") || name.contains("pony_v7") ||
            name.contains("base-v7") || name.contains("auraflow") ||
            arch == "auraflow") return "auraflow"
        if (name.contains("chroma") || arch == "chroma") return "chroma"
        if (name.contains("anima") || arch == "anima") return "anima"
        if (name.contains("z_image") || name.contains("z-image") ||
            name.contains("zimage") || arch in setOf("lumina2", "z_image", "z-image")) return "z_image"
        if (arch == "flux" || (keys.contains("double_blocks.") &&
                    keys.contains("single_blocks."))) return "flux"
        if (arch in setOf("sdxl", "stable-diffusion-xl") ||
            keys.contains("conditioner.embedders.1.") || keys.contains("text_encoder_2.") ||
            keys.contains("clip_g.")) return "sdxl"
        if (arch in setOf("sd", "stable-diffusion") ||
            keys.contains("model.diffusion_model.") || keys.contains("diffusion_model.") ||
            keys.contains("unet.")) return "sd15"
        return "unknown"
    }

    fun missing(family: String, attachments: Set<String>): List<String> {
        val required = when (family) {
            "flux" -> listOf("vae", "clip_l", "t5xxl")
            "z_image", "anima" -> listOf("vae", "llm")
            "chroma" -> listOf("vae", "t5xxl")
            else -> emptyList()
        }
        return required.filterNot { it in attachments }
    }

    fun variant(fileName: String): String =
        if (fileName.lowercase().contains("turbo")) "turbo" else "base"

    fun cfg(family: String, variant: String, requested: Double): Double = when {
        family == "flux" || (variant == "turbo" && family in setOf("z_image", "anima")) -> 1.0
        else -> requested.coerceIn(1.0, 15.0)
    }
}
