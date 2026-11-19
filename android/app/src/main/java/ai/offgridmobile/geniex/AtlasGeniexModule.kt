package ai.offgridmobile.geniex

import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Bridge to Qualcomm's GenieX runtime (text models on the Snapdragon 8 Elite family). The real engine only exists in a build made with
 * -PatlasGeniex=true (see GeniexEngine in the geniexOn / geniexOff source sets); a normal build answers "not in this APK" and nothing
 * else changes. This file imports nothing from GenieX, so it always compiles.
 */
class AtlasGeniexModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName(): String = "AtlasGeniex"

    @ReactMethod fun addListener(eventName: String) { /* events are sent only while a reply is being written */ }
    @ReactMethod fun removeListeners(count: Int) { /* nothing is retained */ }

    private fun emit(event: String, body: com.facebook.react.bridge.WritableMap) {
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, body)
    }

    /** Whether this APK has GenieX, whether this phone's chip is one it supports, and why not when it cannot be used. */
    @ReactMethod
    fun status(promise: Promise) {
        val soc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Build.SOC_MODEL else ""
        val map = Arguments.createMap()
        map.putBoolean("packaged", GeniexEngine.PACKAGED)
        map.putString("soc", soc)
        map.putBoolean("chipSupported", GeniexEngine.chipSupported(soc))
        map.putString("reason", GeniexEngine.unavailableReason(soc))
        promise.resolve(map)
    }

    /** Loads a GGUF text model. `npu` true runs it on the Hexagon NPU, false on the CPU. */
    @ReactMethod
    fun load(modelPath: String, contextLength: Int, npu: Boolean, promise: Promise) {
        GeniexEngine.load(ctx, modelPath, contextLength, npu, { promise.resolve(true) }, { code, message -> promise.reject(code, message) })
    }

    /** Writes one reply. Messages are [{role, content}]. Tokens and the final timings arrive as "GeniexToken", "GeniexDone" and "GeniexError". */
    @ReactMethod
    fun generate(sessionId: String, messages: com.facebook.react.bridge.ReadableArray, maxTokens: Int, temperature: Double, promise: Promise) {
        val list = (0 until messages.size()).mapNotNull { i -> messages.getMap(i)?.let { (it.getString("role") ?: "user") to (it.getString("content") ?: "") } }
        GeniexEngine.generate(sessionId, list, maxTokens, temperature.toFloat(),
            onToken = { text -> emit("GeniexToken", Arguments.createMap().apply { putString("sessionId", sessionId); putString("text", text) }) },
            onDone = { ttftMs, prefillTps, decodeTps, promptTokens, generatedTokens, stop ->
                emit("GeniexDone", Arguments.createMap().apply {
                    putString("sessionId", sessionId); putDouble("ttftMs", ttftMs); putDouble("prefillTps", prefillTps); putDouble("decodeTps", decodeTps)
                    putDouble("promptTokens", promptTokens.toDouble()); putDouble("generatedTokens", generatedTokens.toDouble()); putString("stopReason", stop)
                })
            },
            onError = { message -> emit("GeniexError", Arguments.createMap().apply { putString("sessionId", sessionId); putString("message", message) }) })
        promise.resolve(true)
    }

    @ReactMethod fun stop(promise: Promise) { GeniexEngine.stop(); promise.resolve(true) }
    @ReactMethod fun unload(promise: Promise) { GeniexEngine.unload(); promise.resolve(true) }
}
