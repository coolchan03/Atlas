package ai.offgridmobile.atlastts

/**
 * Text prepared for Pocket TTS, the cloning voice. It writes the audio one small step at a time, so a long piece of text, a
 * sentence with no ending, a lowercase start or only one or two words can make it loop, stutter or repeat a word. This keeps
 * every piece short, starting with a capital and ending with punctuation, the way the model was trained to read. Pure.
 */
object PocketText {
    /** About 50 spoken tokens: the most the model reads steadily in one go. */
    const val MAX_CHARS = 180
    private const val SHORT_WORDS = 5
    private val CLAUSE_END = Regex("(?<=[,;:])\\s+")
    private val SENTENCE_END = Regex("(?<=[.!?])\\s+")

    /** The pieces to generate for [text], each safe to hand to the model on its own. */
    fun prepare(text: String): List<String> {
        val flat = text.replace(Regex("\\s+"), " ").trim()
        if (!flat.any { it.isLetterOrDigit() }) return emptyList()
        return split(flat).map { shape(it) }.filter { it.any(Char::isLetterOrDigit) }
    }

    private fun split(text: String): List<String> {
        val out = mutableListOf<String>()
        for (sentence in text.split(SENTENCE_END)) {
            if (sentence.length <= MAX_CHARS) { out.add(sentence); continue }
            var line = StringBuilder()
            for (clause in sentence.split(CLAUSE_END)) {
                if (line.isNotEmpty() && line.length + clause.length + 1 > MAX_CHARS) { out.add(line.toString()); line = StringBuilder() }
                if (clause.length > MAX_CHARS) { words(clause).forEach { out.add(it) } } else { if (line.isNotEmpty()) line.append(' '); line.append(clause) }
            }
            if (line.isNotEmpty()) out.add(line.toString())
        }
        return out
    }

    /** A clause with no punctuation at all, cut at word boundaries. */
    private fun words(text: String): List<String> {
        val out = mutableListOf<String>()
        var line = StringBuilder()
        for (w in text.split(' ')) {
            if (line.isNotEmpty() && line.length + w.length + 1 > MAX_CHARS) { out.add(line.toString()); line = StringBuilder() }
            if (line.isNotEmpty()) line.append(' ')
            line.append(w)
        }
        if (line.isNotEmpty()) out.add(line.toString())
        return out
    }

    /** Capital first letter, a full stop at the end, and padding in front of a very short piece so the model has room to start. */
    private fun shape(piece: String): String {
        var t = piece.trim().trimStart('-', '*', '"', '\'', '(', '[')
        if (t.isEmpty()) return t
        t = t.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        if (t.last().isLetterOrDigit()) t += "."
        if (t.split(' ').size < SHORT_WORDS) t = "        $t"
        return t
    }
}
