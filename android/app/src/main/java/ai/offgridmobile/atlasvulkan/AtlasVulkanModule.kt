package ai.offgridmobile.atlasvulkan

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.lang.reflect.Proxy
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Isolated experimental llama.kt bridge; the standard Atlas binary needs no llama.kt classes. */
class AtlasVulkanModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var engine: Any? = null
    @Volatile private var sessionId: String? = null
    private val cancelled = AtomicBoolean(false)
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
        return method.invoke(target, *args)
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
        worker.execute {
            try {
                require(File(path).isFile && path.lowercase().endsWith(".gguf")) { "GGUF file not found" }
                require(gpuLayers in 0..99 && context in 256..32768 && threads in 0..16) { "Unsafe inference parameters" }
                cancelled.set(true)
                engine?.let { call(it, "free") }
                engine = null
                sessionId = null
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
        if (sessionId != null) { promise.reject("VULKAN_BUSY", "Generation is already active"); return }
        cancelled.set(false)
        sessionId = id
        worker.execute {
            if (cancelled.get()) { promise.resolve(false); if (sessionId == id) sessionId = null; return@execute }
            val current = engine
            if (current == null) { promise.reject("VULKAN_NOT_LOADED", "Load a GGUF model first"); if (sessionId == id) sessionId = null; return@execute }
            try {
                val paramsClass = Class.forName("com.tensai.llamakt.SamplingParams")
                val ctor = paramsClass.constructors.first { it.parameterCount == 9 }
                val params = ctor.newInstance(maxTokens, 0.8f, 40, 0.95f, 0.05f, emptyList<String>(), -1, 1.0f, 64)
                val callbackClass = Class.forName("com.tensai.llamakt.TokenCallback")
                val callback = Proxy.newProxyInstance(callbackClass.classLoader, arrayOf(callbackClass)) { _, method, args ->
                    if (method.name == "onToken" && !cancelled.get() && sessionId == id) {
                        emit("AtlasVulkanToken", id, args?.firstOrNull() as? String ?: "")
                    }
                    null
                }
                // chatParseCallback is optional.
                call(current, "completion", prompt, params, callback, null)
                if (sessionId == id) emit("AtlasVulkanEnd", id)
                promise.resolve(true)
            } catch (e: Throwable) {
                if (sessionId == id) emit("AtlasVulkanError", id, e.message ?: "Generation failed")
                promise.reject("VULKAN_GENERATION_FAILED", e.message ?: "Generation failed")
            } finally { if (sessionId == id) sessionId = null }
        }
    }

    @ReactMethod
    fun interrupt(id: String, promise: Promise) {
        try {
            if (sessionId == id && engine != null) {
                cancelled.set(true)
                call(engine!!, "interrupt")
            }
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("VULKAN_INTERRUPT_FAILED", e.message ?: "Interrupt failed") }
    }

    @ReactMethod
    fun unload(promise: Promise) {
        cancelled.set(true)
        engine?.let { try { call(it, "interrupt") } catch (_: Throwable) {} }
        worker.execute {
            try {
                engine?.let { call(it, "free") }
                engine = null
                sessionId = null
                promise.resolve(true)
            } catch (e: Throwable) { promise.reject("VULKAN_UNLOAD_FAILED", e.message ?: "Unload failed") }
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
