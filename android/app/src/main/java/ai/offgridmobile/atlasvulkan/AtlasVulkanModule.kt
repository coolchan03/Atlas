package ai.offgridmobile.atlasvulkan

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Optional diagnostic bridge; never loads llama.kt unless explicitly queried. */
class AtlasVulkanModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "AtlasVulkan"

    @ReactMethod
    fun listBackends(promise: Promise) {
        try {
            // Reflect so ordinary Atlas APKs can omit the experimental AAR entirely.
            val engineClass = Class.forName("com.tensai.llamakt.LlamaEngine")
            val instance = engineClass.getDeclaredConstructor().newInstance()
            val method = engineClass.getMethod("availableBackends")
            val backends = method.invoke(instance) as List<*>
            val out = Arguments.createArray()
            for (device in backends) {
                if (device == null) continue
                val type = device.javaClass
                val map = Arguments.createMap()
                map.putString("name", type.getMethod("getName").invoke(device) as? String)
                map.putString("description", type.getMethod("getDescription").invoke(device) as? String)
                map.putString("type", type.getMethod("getType").invoke(device) as? String)
                out.pushMap(map)
            }
            promise.resolve(out)
        } catch (error: Throwable) {
            promise.reject("VULKAN_RUNTIME_UNAVAILABLE", "Optional Vulkan backend unavailable: " + (error.message ?: error.javaClass.simpleName))
        }
    }
}
