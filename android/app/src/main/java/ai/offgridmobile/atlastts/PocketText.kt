package ai.offgridmobile.atlastts

/**
 * Text prepared for Pocket TTS, the cloning voice. It writes the audio one small step at a time and decides when to stop from
 * the text itself. Text with no ending punctuation, a lowercase start or only a few words leaves it unsure where the speech ends,
 * so it adds a stray sound before the words or keeps going after them. This gives it what it expects: a capital first letter, a
 * full stop at the end, and spaces in front of a very short phrase. The words and the pacing are not changed. Pure.
 */
object PocketText {
    private const val SHORT_WORDS = 5

    /** [text] as the model expects to read it. Blank text with nothing to say stays as it is. */
    fun prepare(text: String): String {
        var t = text.replace(Regex("\\s+"), " ").trim().trimStart('-', '*', '"', '\'', '(', '[')
        if (!t.any { it.isLetterOrDigit() }) return text
        t = t.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        if (!t.last().let { it in ".!?" }) t = t.trimEnd(',', ';', ':', '-', ' ') + "."
        if (t.split(' ').size < SHORT_WORDS) t = "        $t"
        return t
    }
}
