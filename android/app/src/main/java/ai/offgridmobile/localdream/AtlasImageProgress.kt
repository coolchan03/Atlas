package ai.offgridmobile.localdream

/**
 * Safe, model-independent reading of sd-cli output. Progress bars use carriage
 * returns, and arbitrary engine logs often contain "1/2"-like numbers; only
 * ratios whose denominator equals the requested diffusion step count qualify.
 */
internal object AtlasImageProgress {
    private val fractions = Regex("""(?<![\d/])(\d{1,3})\s*/\s*(\d{1,3})(?!\d)""")

    fun parseStep(line: String, expectedSteps: Int): Int? =
        fractions.findAll(line).mapNotNull { match ->
            val step = match.groupValues[1].toIntOrNull()
            val total = match.groupValues[2].toIntOrNull()
            if (step != null && total == expectedSteps && step in 1..expectedSteps) step else null
        }.firstOrNull()

    fun stage(line: String): String? {
        val lower = line.lowercase()
        return when {
            lower.contains("decode") && (lower.contains("vae") || lower.contains("latent")) -> "Decoding image"
            lower.contains("saving") || lower.contains("wrote image") -> "Writing PNG"
            lower.contains("sampling") || lower.contains("denois") -> "Running diffusion"
            lower.contains("prompt") && (lower.contains("encod") || lower.contains("condition")) -> "Encoding prompt"
            lower.contains("loading") && (lower.contains("tensor") || lower.contains("weight") ||
                lower.contains("model")) -> "Loading checkpoint weights"
            lower.contains("compute buffer") || lower.contains("flash attention") -> "Preparing computation"
            else -> null
        }
    }

    /** Linux proc stat uses a parenthesized process name. Find field 14+15 afterwards. */
    fun cpuTicks(stat: String): Long? {
        val end = stat.lastIndexOf(')')
        if (end < 0 || end + 2 >= stat.length) return null
        val fields = stat.substring(end + 2).trim().split(Regex("\\s+"))
        // After ") ", field 3 (state) is index zero, utime and stime are 11/12.
        return if (fields.size > 12) {
            val u = fields[11].toLongOrNull()
            val s = fields[12].toLongOrNull()
            if (u != null && s != null) u + s else null
        } else null
    }
}