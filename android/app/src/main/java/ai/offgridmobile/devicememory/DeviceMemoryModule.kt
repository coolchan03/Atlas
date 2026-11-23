package ai.offgridmobile.devicememory

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Exposes the REAL per-process memory headroom to JS — not a fraction-of-total-RAM
 * guess. iOS uses os_proc_available_memory(); Android has no exact twin, so we use
 * ActivityManager's system available memory, which is the practical ceiling for
 * large native allocations before the low-memory killer applies pressure. Same TS
 * contract on both platforms (getMemoryInfo → { processAvailableBytes, ... }).
 */
class DeviceMemoryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceMemoryModule"

    /**
     * What this APK was built for: the CPU type it runs as and the native libraries it actually contains, read from where Android put them
     * (nativeLibraryDir ends in the CPU type). The app shows features whose libraries are not there as missing on this build. Same contract as
     * iOS: constants.buildInfo = { abi, nativeLibs }.
     */
    override fun getConstants(): Map<String, Any> {
        val dir = File(reactApplicationContext.applicationInfo.nativeLibraryDir ?: "")
        val abi = when (val isa = dir.name) {
            "arm64" -> "arm64-v8a"
            "arm" -> "armeabi-v7a"
            else -> isa
        }
        val libs = (dir.list() ?: emptyArray()).sorted()
        return mapOf("buildInfo" to mapOf("abi" to abi, "nativeLibs" to libs))
    }

    @ReactMethod
    fun getMemoryInfo(promise: Promise) {
        try {
            val am = reactApplicationContext
                .getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mi = ActivityManager.MemoryInfo()
            am.getMemoryInfo(mi)
            val map = Arguments.createMap()
            map.putDouble("processAvailableBytes", mi.availMem.toDouble())
            map.putDouble("footprintBytes", (mi.totalMem - mi.availMem).toDouble())
            map.putBoolean("lowMemory", mi.lowMemory)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("MEM_ERROR", e)
        }
    }

    /**
     * Why the previous runs of this app ended, from the system's own record (ApplicationExitInfo, Android 11+). Same contract as iOS:
     * { supported, reasons: [{ at, reason, description, rssKb }] }, newest first. Below Android 11 it answers supported = false.
     */
    @ReactMethod
    fun getLastExitReasons(max: Int, promise: Promise) {
        try {
            val out = Arguments.createMap()
            val list = Arguments.createArray()
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                out.putBoolean("supported", false)
                out.putArray("reasons", list)
                promise.resolve(out)
                return
            }
            val am = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val exits = am.getHistoricalProcessExitReasons(null, 0, if (max in 1..20) max else 5)
            for (e in exits) {
                val m = Arguments.createMap()
                m.putDouble("at", e.timestamp.toDouble())
                m.putString("reason", reasonName(e.reason))
                m.putString("description", e.description ?: "")
                m.putDouble("rssKb", e.rss.toDouble())
                list.pushMap(m)
            }
            out.putBoolean("supported", true)
            out.putArray("reasons", list)
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("EXIT_ERROR", e)
        }
    }

    private fun reasonName(code: Int): String = when (code) {
        ApplicationExitInfo.REASON_ANR -> "ANR"
        ApplicationExitInfo.REASON_CRASH -> "CRASH"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RESOURCE_USAGE"
        ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INITIALIZATION_FAILURE"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "PERMISSION_CHANGE"
        ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED"
        ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
        else -> if (Build.VERSION.SDK_INT >= 31 && code == ApplicationExitInfo.REASON_FREEZER) "FREEZER" else "OTHER"
    }
}
