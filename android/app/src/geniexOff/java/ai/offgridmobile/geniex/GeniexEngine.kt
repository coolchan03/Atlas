package ai.offgridmobile.geniex

import android.content.Context

/** The normal build: GenieX is not packaged, so every call says so and nothing else is affected. */
object GeniexEngine {
    const val PACKAGED = false
    fun chipSupported(soc: String): Boolean = false
    fun unavailableReason(soc: String): String = "GenieX is not in this APK (it is added only to builds made with -PatlasGeniex=true)."
    fun load(ctx: Context, modelPath: String, contextLength: Int, npu: Boolean, ok: () -> Unit, fail: (String, String) -> Unit) =
        fail("GENIEX_NOT_PACKAGED", unavailableReason(""))
    fun generate(sessionId: String, messages: List<Pair<String, String>>, maxTokens: Int, temperature: Float,
                 onToken: (String) -> Unit, onDone: (Double, Double, Double, Long, Long, String) -> Unit, onError: (String) -> Unit) =
        onError(unavailableReason(""))
    fun stop() = Unit
    fun unload() = Unit
}
