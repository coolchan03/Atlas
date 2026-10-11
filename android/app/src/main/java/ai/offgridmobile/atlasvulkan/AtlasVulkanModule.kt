package ai.offgridmobile.atlasvulkan

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Proxy
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** Isolated experimental llama.kt bridge; the standard Atlas binary needs no llama.kt classes. */
class AtlasVulkanModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var engine: Any? = null
    private val sessionId = AtomicReference<String?>(null)
    private val cancelled = AtomicBoolean(false)
    // Keep admission and cancellation flag changes in the same critical section.
    private val sessionLock = Any()
    @Volatile private var unloading = false
    override fun getName(): String = "AtlasVulkan"

    @ReactMethod
    fun addListener(eventName: String) { /* Events are emitted only during inference. */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* No native observer is retained. */ }

    private fun newEngine(): Any =
        Class.forName("com.tensai.llamakt.LlamaEngine").getDeclaredConstructor().newInstance()

    private fun call(target: Any, name: String, vararg args: Any?): Any? {
        val method = target.javaClass.methods.firstOrNull { it.name == name && it.parameterCount == args.size }
            ?: throw NoSuchMethodException(name)
        try { return method.invoke(target, *args) }
        catch (e: InvocationTargetException) { throw e.targetException ?: e }
    }

    private fun emit(name: String, id: String, value: String = "") {
        val data = Arguments.createMap()
        data.putString("sessionId", id)
        data.putString("text", value)
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, data)
    }

    @ReactMethod
    fun listBackends(promise: Promise) {
        worker.execute {
            try {
                val instance = newEngine()
                val out = Arguments.createArray()
                for (backend in call(instance, "availableBackends") as List<*>) {
                    if (backend == null) continue
                    val map = Arguments.createMap()
                    map.putString("name", call(backend, "getName") as? String)
                    map.putString("description", call(backend, "getDescription") as? String)
                    map.putString("type", call(backend, "getType") as? String)
                    out.pushMap(map)
                }
                promise.resolve(out)
            } catch (e: Throwable) { promise.reject("VULKAN_RUNTIME_UNAVAILABLE", e.message ?: "Vulkan unavailable") }
        }
    }

    @ReactMethod
    fun loadModel(path: String, gpuLayers: Int, context: Int, threads: Int, promise: Promise) {
        if (sessionId.get() != null) {
            promise.reject("VULKAN_BUSY", "Cannot replace a model while generating")
            return
        }
        worker.execute {
            try {
                check(sessionId.get() == null) { "Cannot replace a model while generating" }
                require(File(path).isFile && path.lowercase().endsWith(".gguf")) { "GGUF file not found" }
                require(gpuLayers in 0..99 && context in 256..32768 && threads in 0..16) { "Unsafe inference parameters" }
                cancelled.set(true)
                engine?.let { call(it, "free") }
                engine = null
                sessionId.set(null)
                val candidate = newEngine()
                try {
                    // LoadProgressCallback, kvCacheType and flashAttn are deliberately null.
                    call(candidate, "load", path, gpuLayers, context, threads, null, null, null)
                    engine = candidate
                    cancelled.set(false)
                    promise.resolve(call(candidate, "activeBackend") as? String ?: "unknown")
                } catch (failure: Throwable) {
                    try { call(candidate, "free") } catch (_: Throwable) {}
                    throw failure
                }
            } catch (e: Throwable) { promise.reject("VULKAN_LOAD_FAILED", e.message ?: "Load failed") }
        }
    }

    @ReactMethod
    fun tokenize(text: String, promise: Promise) {
        worker.execute {
            try {
                val current = engine ?: throw IllegalStateException("Load a GGUF model first")
                val ids = call(current, "tokenize", text) as IntArray
                val result = Arguments.createArray()
                ids.forEach { result.pushInt(it) }
                promise.resolve(result)
            } catch (e: Throwable) { promise.reject("VULKAN_TOKENIZE_FAILED", e.message ?: "Tokenization failed") }
        }
    }

    @ReactMethod
    fun formatChat(messagesJson: String, promise: Promise) {
        worker.execute {
            try {
                val current = engine ?: throw IllegalStateException("Load a GGUF model first")
                val json = org.json.JSONArray(messagesJson)
                val chatClass = Class.forName("com.tensai.llamakt.ChatMessage")
                val constructor = chatClass.getConstructor(String::class.java, String::class.java)
                val messages = (0 until json.length()).map { index ->
                    val item = json.getJSONObject(index)
                    constructor.newInstance(item.getString("role"), item.getString("content"))
                }
                promise.resolve(call(current, "formatChat", messages, false) as String)
            } catch (e: Throwable) { promise.reject("VULKAN_CHAT_FORMAT_FAILED", e.message ?: "Unable to format model chat") }
        }
    }

    @ReactMethod
    fun activeBackend(promise: Promise) {
        worker.execute {
            try { promise.resolve(engine?.let { call(it, "activeBackend") as? String } ?: "unloaded") }
            catch (e: Throwable) { promise.reject("VULKAN_STATUS_FAILED", e.message ?: "Status failed") }
        }
    }

    @ReactMethod
    fun generate(prompt: String, maxTokens: Int, id: String, promise: Promise) {
        if (id.isBlank() || maxTokens !in 1..4096 || prompt.isBlank()) {
            promise.reject("VULKAN_INVALID_REQUEST", "Invalid session or generation parameters")
            return
        }
        // Reserve and clear the cancellation flag together: an interrupt must not
        // get overwritten by a concurrent generate() call after session admission.
        val admitted = synchronized(sessionLock) {
            if (unloading || sessionId.get() != null) false
            else {
                cancelled.set(false)
                sessionId.set(id)
                true
            }
        }
        if (!admitted) {
            promise.reject("VULKAN_BUSY", "Generation is already active")
            return
        }
        worker.execute {
            if (cancelled.get()) { promise.resolve(false); sessionId.compareAndSet(id, null); return@execute }
            val current = engine
            if (current == null) { promise.reject("VULKAN_NOT_LOADED", "Load a GGUF model first"); sessionId.compareAndSet(id, null); return@execute }
            try {
                val paramsClass = Class.forName("com.tensai.llamakt.SamplingParams")
                val ctor = paramsClass.constructors.first { it.parameterCount == 9 }
                val params = ctor.newInstance(maxTokens, 0.8f, 40, 0.95f, 0.05f, emptyList<String>(), -1, 1.0f, 64)
                val callbackClass = Class.forName("com.tensai.llamakt.TokenCallback")
                val callback = Proxy.newProxyInstance(callbackClass.classLoader, arrayOf(callbackClass)) { _, method, args ->
                    if (method.name == "onToken" && !cancelled.get() && sessionId.get() == id) {
                        emit("AtlasVulkanToken", id, args?.firstOrNull() as? String ?: "")
                    }
                    null
                }
                // chatParseCallback is optional.
                // Pinned llama.kt returns a signed decode count; negative signals a native failure.
                // Never report completion success for a failed decode with partial token output.
                val decodedTokens = call(current, "completion", prompt, params, callback, null) as? Int
                    ?: throw IllegalStateException("Native completion did not return a token count")
                if (decodedTokens < 0) throw IllegalStateException("Native Vulkan decode failed (code $decodedTokens)")
                if (sessionId.get() == id) emit("AtlasVulkanEnd", id)
                promise.resolve(true)
            } catch (e: Throwable) {
                if (sessionId.get() == id) emit("AtlasVulkanError", id, e.message ?: "Generation failed")
                promise.reject("VULKAN_GENERATION_FAILED", e.message ?: "Generation failed")
            } finally { sessionId.compareAndSet(id, null) }
        }
    }

    @ReactMethod
    fun interrupt(id: String, promise: Promise) {
        try {
            // Queued generation may not have acquired an engine yet. Still cancel
            // its reserved session, so the worker does not start it later.
            val matched = synchronized(sessionLock) {
                if (sessionId.get() != id) false
                else { cancelled.set(true); true }
            }
            if (matched) engine?.let { call(it, "interrupt") }
            promise.resolve(matched)
        } catch (e: Throwable) { promise.reject("VULKAN_INTERRUPT_FAILED", e.message ?: "Interrupt failed") }
    }

    @ReactMethod
    fun unload(promise: Promise) {
        val admitted = synchronized(sessionLock) {
            if (unloading) false
            else {
                unloading = true
                cancelled.set(true)
                true
            }
        }
        if (!admitted) { promise.reject("VULKAN_BUSY", "Unload already in progress"); return }
        engine?.let { try { call(it, "interrupt") } catch (_: Throwable) {} }
        try {
            worker.execute {
                try {
                    engine?.let { call(it, "free") }
                    engine = null
                    sessionId.set(null)
                    promise.resolve(true)
                } catch (e: Throwable) { promise.reject("VULKAN_UNLOAD_FAILED", e.message ?: "Unload failed") }
                finally { synchronized(sessionLock) { unloading = false } }
            }
        } catch (e: Throwable) {
            synchronized(sessionLock) { unloading = false }
            promise.reject("VULKAN_UNLOAD_FAILED", e.message ?: "Unload could not be queued")
        }
    }

    override fun invalidate() {
        cancelled.set(true)
        engine?.let { try { call(it, "interrupt") } catch (_: Throwable) {} }
        worker.execute { engine?.let { try { call(it, "free") } catch (_: Throwable) {} }; engine = null }
        worker.shutdown()
        super.invalidate()
    }
}
