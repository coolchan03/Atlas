package ai.offgridmobile.atlasdevice

/**
 * The text another app hands to Atlas: a shared link or note (Share, ACTION_SEND) or text selected in any app and sent
 * with "Ask Atlas" (ACTION_PROCESS_TEXT). Kept free of Android types so it is tested on the JVM.
 */
internal object ShareText {
    const val MAX_CHARS = 20000
    const val ACTION_SEND = "android.intent.action.SEND"
    const val ACTION_PROCESS_TEXT = "android.intent.action.PROCESS_TEXT"

    /** The kinds of file Atlas takes when another app shares one: documents it can read and pictures. */
    private val FILE_TYPES = setOf(
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    )

    /** The address of a shared file (ACTION_SEND with a stream) when its type is one Atlas can open, else null. */
    fun fileUri(action: String?, mimeType: String?, streamUri: String?): String? {
        if (action != ACTION_SEND || streamUri.isNullOrBlank() || mimeType == null) return null
        val type = mimeType.lowercase()
        return if (type in FILE_TYPES || type.startsWith("image/") || type.startsWith("text/")) streamUri else null
    }

    fun from(action: String?, mimeType: String?, sharedText: CharSequence?, selectedText: CharSequence?): String? {
        val raw = when (action) {
            ACTION_SEND -> if (mimeType?.startsWith("text/") == true) sharedText else null
            ACTION_PROCESS_TEXT -> selectedText
            else -> null
        } ?: return null
        val text = raw.toString().trim()
        return if (text.isEmpty()) null else text.take(MAX_CHARS)
    }
}
