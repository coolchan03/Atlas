package ai.offgridmobile.atlastts

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * Speaks text with the phone's own text-to-speech engine (works offline when the
 * engine's voice data is installed - Google TTS / Samsung TTS normally are).
 * Long text is split into chunks; "AtlasTtsDone" fires once the LAST chunk of an
 * utterance has finished, "AtlasTtsStopped" when speech is cancelled.
 */
class AtlasTtsModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var rate = 1.0f
    private var pitch = 1.0f
    private var voiceName = ""
    private val pending = mutableListOf<Triple<String, String, String>>()

    override fun getName(): String = "AtlasTts"

    private fun emit(event: String, id: String) {
        try {
            val map = Arguments.createMap()
            map.putString("utteranceId", id)
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, map)
        } catch (_: Exception) {}
    }

    private fun ensure() {
        if (tts != null) return
        tts = TextToSpeech(ctx.applicationContext) { status ->
            ready = status == TextToSpeech.SUCCESS
            if (ready) {
                tts?.language = Locale.getDefault()
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        if (utteranceId != null && utteranceId.endsWith("#0")) emit("AtlasTtsStart", utteranceId.substringBefore("#"))
                    }
                    override fun onDone(utteranceId: String?) {
                        if (utteranceId != null && utteranceId.endsWith("#last")) emit("AtlasTtsDone", utteranceId.substringBefore("#"))
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        if (utteranceId != null) emit("AtlasTtsDone", utteranceId.substringBefore("#"))
                    }
                    override fun onStop(utteranceId: String?, interrupted: Boolean) {
                        if (utteranceId != null) emit("AtlasTtsStopped", utteranceId.substringBefore("#"))
                    }
                })
                synchronized(pending) {
                    for ((text, id, lang) in pending) doSpeak(text, id, lang)
                    pending.clear()
                }
            } else {
                synchronized(pending) {
                    for ((_, id, _) in pending) emit("AtlasTtsDone", id)
                    pending.clear()
                }
            }
        }
    }

    private fun chunks(text: String, max: Int): List<String> {
        val out = mutableListOf<String>()
        val sentences = text.split(Regex("(?<=[.!?\\n])\\s+"))
        val sb = StringBuilder()
        for (s in sentences) {
            if (sb.length + s.length + 1 > max && sb.isNotEmpty()) { out.add(sb.toString()); sb.setLength(0) }
            if (s.length > max) { s.chunked(max).forEach { out.add(it) } } else { if (sb.isNotEmpty()) sb.append(' '); sb.append(s) }
        }
        if (sb.isNotEmpty()) out.add(sb.toString())
        return out.filter { it.isNotBlank() }
    }

    private fun doSpeak(text: String, id: String, lang: String = "") {
        val engine = tts ?: return
        engine.setSpeechRate(rate)
        engine.setPitch(pitch)
        try {
            val loc = if (lang.isBlank()) Locale.getDefault() else Locale.forLanguageTag(lang)
            val r = engine.setLanguage(loc)
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) emit("AtlasTtsNoLanguage", lang)
            if (voiceName.isNotBlank()) engine.voices?.firstOrNull { it.name == voiceName }?.let { engine.voice = it }
        } catch (_: Exception) {}
        val max = (TextToSpeech.getMaxSpeechInputLength() - 100).coerceAtLeast(500)
        val parts = chunks(text, max)
        if (parts.isEmpty()) { emit("AtlasTtsDone", id); return }
        engine.stop()
        parts.forEachIndexed { i, p ->
            val uid = if (i == parts.size - 1) "$id#last" else "$id#$i"
            val uidFirst = if (i == 0 && parts.size > 1) "$id#0" else uid
            engine.speak(p, TextToSpeech.QUEUE_ADD, Bundle(), uidFirst)
        }
    }

    @ReactMethod
    fun speak(text: String, utteranceId: String, promise: Promise) = speakIn(text, utteranceId, "", promise)

    /** Speak in a given language (BCP-47 tag like "es-ES"); "" = phone default. */
    @ReactMethod
    fun speakIn(text: String, utteranceId: String, lang: String, promise: Promise) {
        try {
            ensure()
            if (ready) doSpeak(text, utteranceId, lang) else synchronized(pending) { pending.add(Triple(text, utteranceId, lang)) }
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try { synchronized(pending) { pending.clear() }; tts?.stop(); promise.resolve(true) } catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    @ReactMethod
    fun setRate(r: Double, promise: Promise) { rate = r.toFloat(); promise.resolve(true) }

    /** Installed (offline) voices for a language, e.g. "en". Network-only voices are left out. */
    @ReactMethod
    fun listVoices(lang: String, promise: Promise) {
        try {
            ensure()
            val engine = tts
            if (engine == null || !ready) { promise.resolve(Arguments.createArray()); return }
            val out = Arguments.createArray()
            val voices = try { engine.voices } catch (_: Exception) { null } ?: emptySet()
            voices.filter { v ->
                !v.isNetworkConnectionRequired &&
                !(v.features?.contains(android.speech.tts.TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) ?: false) &&
                (lang.isBlank() || v.locale.language.equals(Locale.forLanguageTag(lang).language, ignoreCase = true))
            }.sortedBy { it.name }.forEach { v ->
                out.pushMap(Arguments.createMap().apply {
                    putString("name", v.name); putString("locale", v.locale.toLanguageTag()); putInt("quality", v.quality)
                })
            }
            promise.resolve(out)
        } catch (e: Exception) { promise.reject("TTS_VOICES", e) }
    }

    /** Use a specific voice by name for the next utterances ("" = default voice). */
    @ReactMethod
    fun setVoice(name: String, promise: Promise) { voiceName = name; promise.resolve(true) }

    /** Voice pitch (1.0 normal). Used to give the two podcast hosts different voices. */
    @ReactMethod
    fun setPitch(p: Double, promise: Promise) { pitch = p.toFloat(); promise.resolve(true) }

    @ReactMethod
    fun warmUp(promise: Promise) { try { ensure(); promise.resolve(true) } catch (e: Exception) { promise.reject("TTS_ERROR", e) } }

    @ReactMethod
    fun isSpeaking(promise: Promise) { promise.resolve(tts?.isSpeaking ?: false) }

    /** Keep the screen on (used while learning mode runs, so Android does not pause the app). */
    @ReactMethod
    fun keepScreenOn(on: Boolean, promise: Promise) {
        val activity = ctx.currentActivity
        if (activity == null) { promise.resolve(false); return }
        activity.runOnUiThread {
            if (on) activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        promise.resolve(true)
    }

    // Required by NativeEventEmitter on Android.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
        tts = null
        super.invalidate()
    }
}
