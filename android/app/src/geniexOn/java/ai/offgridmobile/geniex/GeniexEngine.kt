package ai.offgridmobile.geniex

import android.content.Context
import com.geniex.sdk.GenieXSdk
import com.geniex.sdk.LlmWrapper
import com.geniex.sdk.bean.ChatMessage
import com.geniex.sdk.bean.GenerationConfig
import com.geniex.sdk.bean.LlmCreateInput
import com.geniex.sdk.bean.LlmStreamResult
import com.geniex.sdk.bean.ModelConfig
import com.geniex.sdk.bean.SamplerConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The real GenieX engine (a build made with -PatlasGeniex=true). One model at a time; one reply at a time. Not yet run on a device:
 * written from the SDK's published API (com.qualcomm.qti:geniex-android 0.10.0).
 */
object GeniexEngine {
    const val PACKAGED = true
    /** The chips the SDK documents for Android: Snapdragon 8 Elite and 8 Elite Gen 5. */
    private val CHIPS = setOf("SM8750", "SM8750-AB", "SM8850")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Mutex()
    @Volatile private var llm: LlmWrapper? = null
    @Volatile private var job: Job? = null
    @Volatile private var initialised = false
    /** Where to report a reply that is stopped from outside, so the caller's promise always ends. */
    @Volatile private var activeOnError: ((String) -> Unit)? = null

    fun chipSupported(soc: String): Boolean = soc.trim().uppercase() in CHIPS
    fun unavailableReason(soc: String): String =
        if (chipSupported(soc)) "" else "GenieX supports only the Snapdragon 8 Elite and 8 Elite Gen 5 on Android (this phone reports \"$soc\")."

    private fun ensureInit(ctx: Context) {
        if (initialised) return
        GenieXSdk.getInstance().init(ctx.applicationContext)
        initialised = true
    }

    fun load(ctx: Context, modelPath: String, contextLength: Int, npu: Boolean, ok: () -> Unit, fail: (String, String) -> Unit) {
        scope.launch {
            lock.withLock {
                try {
                    ensureInit(ctx)
                    llm?.close(); llm = null
                    val config = ModelConfig().apply { nCtx = contextLength.coerceIn(512, 32768) }
                    val input = LlmCreateInput(modelPath, null, config, "llama_cpp", if (npu) "npu" else "cpu")
                    llm = LlmWrapper.builder().llmCreateInput(input).build().getOrThrow()
                    ok()
                } catch (e: Throwable) {
                    fail("GENIEX_LOAD_FAILED", e.message ?: e.javaClass.simpleName)
                }
            }
        }
    }

    fun generate(sessionId: String, messages: List<Pair<String, String>>, maxTokens: Int, temperature: Float,
                 onToken: (String) -> Unit, onDone: (Double, Double, Double, Long, Long, String) -> Unit, onError: (String) -> Unit) {
        val model = llm ?: return onError("No GenieX model is loaded.")
        job?.cancel()
        activeOnError = onError
        job = scope.launch {
            try {
                val chat = messages.map { (role, content) -> ChatMessage(role, content, emptyList(), null, null) }.toTypedArray()
                // The chat template turns the messages into the prompt the model expects; the raw text must never be sent.
                val templated = model.applyChatTemplate(chat, null, enableThinking = false).getOrThrow()
                val sampler = SamplerConfig()
                sampler.temperature = temperature
                val config = GenerationConfig()
                config.maxTokens = maxTokens.coerceIn(1, 8192)
                config.samplerConfig = sampler
                model.generateStreamFlow(prompt = templated.formattedText, config = config).collect { result ->
                    when (result) {
                        is LlmStreamResult.Token -> onToken(result.text)
                        is LlmStreamResult.Completed -> result.profile.let { p ->
                            activeOnError = null
                            onDone(p.ttftMs, p.prefillSpeed, p.decodingSpeed, p.promptTokens, p.generatedTokens, p.stopReason ?: "")
                        }
                        is LlmStreamResult.Error -> onError(result.throwable.message ?: "GenieX failed")
                    }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Throwable) {
                onError(e.message ?: e.javaClass.simpleName)
            }
        }
    }

    fun stop() {
        val model = llm
        val report = activeOnError
        activeOnError = null
        job?.cancel()
        report?.invoke("Stopped.")
        if (model != null) scope.launch { try { model.stopStream() } catch (_: Throwable) { /* nothing was running */ } }
    }

    fun unload() {
        job?.cancel()
        runBlocking { lock.withLock { llm?.close(); llm = null } }
    }
}
