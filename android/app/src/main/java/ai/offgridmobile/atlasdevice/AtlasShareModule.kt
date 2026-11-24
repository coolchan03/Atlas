package ai.offgridmobile.atlasdevice

import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONObject
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Hands text shared into Atlas (or selected and sent with "Ask Atlas") to the app: once at start, and live while it runs. */
object ShareBridge {
    @Volatile var listener: ((String) -> Unit)? = null
    @Volatile var fileListener: ((String) -> Unit)? = null

    /** The shared text in an intent, or null. The text is taken out of the intent so a screen turn does not offer it again. */
    fun read(intent: Intent?): String? {
        intent ?: return null
        val text = ShareText.from(
            intent.action, intent.type,
            intent.getCharSequenceExtra(Intent.EXTRA_TEXT),
            intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT),
        ) ?: return null
        intent.removeExtra(Intent.EXTRA_TEXT)
        intent.removeExtra(Intent.EXTRA_PROCESS_TEXT)
        intent.action = Intent.ACTION_MAIN
        return text
    }

    @Suppress("DEPRECATION")
    private fun streamOf(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)

    /** A shared file (a PDF, a document or a picture) as a small JSON text {"uri","mime"}, or null. The stream is taken out of the intent so a screen turn does not offer it again. */
    fun readFile(intent: Intent?): String? {
        intent ?: return null
        val uri = ShareText.fileUri(intent.action, intent.type, streamOf(intent)?.toString()) ?: return null
        val json = JSONObject().put("uri", uri).put("mime", intent.type ?: "")
        intent.removeExtra(Intent.EXTRA_STREAM)
        intent.action = Intent.ACTION_MAIN
        return json.toString()
    }

    /** A new intent arrived while Atlas runs. If the app side is not listening yet, the intent is left for getInitialShare. */
    fun deliver(intent: Intent?) {
        listener?.let { send -> read(intent)?.let(send) }
        fileListener?.let { send -> readFile(intent)?.let(send) }
    }
}

class AtlasShareModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName() = "AtlasShare"

    override fun initialize() {
        super.initialize()
        ShareBridge.listener = { text ->
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasShareText", text)
        }
        ShareBridge.fileListener = { file ->
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasShareFile", file)
        }
    }

    override fun invalidate() {
        ShareBridge.listener = null
        ShareBridge.fileListener = null
        super.invalidate()
    }

    @ReactMethod
    fun getInitialShare(promise: Promise) {
        promise.resolve(ShareBridge.read(ctx.currentActivity?.intent))
    }

    @ReactMethod
    fun getInitialShareFile(promise: Promise) {
        promise.resolve(ShareBridge.readFile(ctx.currentActivity?.intent))
    }

    // Required by NativeEventEmitter.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Double) {}
}
