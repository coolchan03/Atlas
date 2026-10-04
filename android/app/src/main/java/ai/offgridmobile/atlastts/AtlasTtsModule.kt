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
    @Volatile private var ready = false
    @Volatile private var lastErrored = ""
    private var rate = 1.0f
    private var pitch = 1.0f
    private var voiceName = ""
    private val pending = mutableListOf<Triple<String, String, String>>()

    // ---- natural (neural) voices ----
    private val neural by lazy { NeuralTts { e, id -> emit(e, id) } }
    @Volatile private var neuralDir = ""
    @Volatile private var neuralSid = 0
    private val cancelled = java.util.Collections.synchronizedSet(mutableSetOf<String>())
    private fun voicesRoot() = java.io.File(ctx.filesDir, "voices").apply { mkdirs() }
    private fun useNeural(lang: String) = neuralDir.isNotEmpty() && neural.ready && (lang.isBlank() || lang.lowercase().startsWith("en"))

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
            val ok = status == TextToSpeech.SUCCESS
            if (ok) {
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
                        val id = utteranceId?.substringBefore("#") ?: return
                        if (id == lastErrored) return
                        lastErrored = id
                        try { tts?.stop() } catch (_: Exception) {}
                        emit("AtlasTtsDone", id)
                    }
                    override fun onStop(utteranceId: String?, interrupted: Boolean) {
                        if (utteranceId != null) emit("AtlasTtsStopped", utteranceId.substringBefore("#"))
                    }
                })
                synchronized(pending) {
                    ready = true
                    for ((text, id, lang) in pending) doSpeak(text, id, lang)
                    pending.clear()
                }
            } else {
                synchronized(pending) {
                    ready = false
                    for ((_, id, _) in pending) emit("AtlasTtsDone", id)
                    pending.clear()
                    try { tts?.shutdown() } catch (_: Exception) {}
                    tts = null // try again next time instead of staying broken
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
            if (useNeural(lang)) {
                try { tts?.stop() } catch (_: Exception) {}
                val sid = if (voiceName.startsWith("sid:")) voiceName.removePrefix("sid:").toIntOrNull() ?: neuralSid else neuralSid
                val parts = chunks(text, 380)
                if (parts.isEmpty()) emit("AtlasTtsDone", utteranceId) else neural.speak(parts, utteranceId, sid, rate)
                promise.resolve(true); return
            }
            ensure()
            val now = synchronized(pending) { if (!ready) { pending.add(Triple(text, utteranceId, lang)); false } else true }
            if (now) doSpeak(text, utteranceId, lang)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try { synchronized(pending) { pending.clear() }; tts?.stop(); if (neuralDir.isNotEmpty()) neural.stop(); promise.resolve(true) } catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    @ReactMethod
    fun setRate(r: Double, promise: Promise) { rate = r.toFloat(); promise.resolve(true) }

    /** Installed (offline) voices for a language, e.g. "en". Network-only voices are left out. */
    @ReactMethod
    fun listVoices(lang: String, promise: Promise) {
        try {
            if (neuralDir.isNotEmpty() && neural.ready && (lang.isBlank() || lang.lowercase().startsWith("en"))) {
                val out = Arguments.createArray()
                val n = neural.numSpeakers()
                for (i in 0 until maxOf(1, n)) out.pushMap(Arguments.createMap().apply { putString("name", "sid:$i"); putString("locale", "en-US"); putInt("quality", 500) })
                promise.resolve(out); return
            }
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

    /** Use a downloaded natural voice (folder name under voices/), or "" for the phone's voice. Resolves the number of speakers. */
    @ReactMethod
    fun setNeuralVoice(id: String, sid: Int, promise: Promise) {
        neuralSid = sid
        if (id.isBlank()) { neuralDir = ""; Thread { try { neural.release() } catch (_: Throwable) {} }.start(); promise.resolve(0); return }
        val dir = java.io.File(voicesRoot(), id)
        if (!dir.isDirectory) { neuralDir = ""; promise.reject("NO_VOICE", "Voice not downloaded"); return }
        Thread {
            try { neural.load(dir.path); neuralDir = dir.path; promise.resolve(neural.numSpeakers()) }
            catch (e: Throwable) { neuralDir = ""; promise.reject("VOICE_LOAD", e.message ?: e.toString()) }
        }.start()
    }

    @ReactMethod
    fun setNeuralSpeaker(sid: Int, promise: Promise) { neuralSid = sid; promise.resolve(true) }

    @ReactMethod
    fun installedNeuralVoices(promise: Promise) {
        val out = Arguments.createArray()
        voicesRoot().listFiles()?.filter { it.isDirectory && !it.name.endsWith(".part") }?.forEach { d ->
            out.pushMap(Arguments.createMap().apply { putString("id", d.name); putDouble("bytes", d.walkTopDown().filter { it.isFile }.sumOf { it.length() }.toDouble()) })
        }
        promise.resolve(out)
    }

    @ReactMethod
    fun deleteNeuralVoice(id: String, promise: Promise) {
        Thread {
            val d = java.io.File(voicesRoot(), id)
            if (d.path == neuralDir) { neuralDir = ""; try { neural.release() } catch (_: Throwable) {} }
            d.deleteRecursively(); promise.resolve(true)
        }.start()
    }

    @ReactMethod
    fun cancelNeuralDownload(id: String, promise: Promise) { cancelled.add(id); promise.resolve(true) }

    /** Downloads a voice .zip and unpacks it into voices/<id> while downloading. Emits AtlasVoiceDownload {id, progress}. */
    @ReactMethod
    fun downloadNeuralVoice(id: String, url: String, promise: Promise) {
        cancelled.remove(id)
        Thread {
            val root = voicesRoot()
            val tmp = java.io.File(root, "$id.part")
            try {
                tmp.deleteRecursively(); tmp.mkdirs()
                var conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 30000; conn.readTimeout = 60000; conn.instanceFollowRedirects = true
                conn.setRequestProperty("User-Agent", "Atlas")
                var hops = 0
                while (conn.responseCode in 300..399 && hops++ < 5) {
                    val loc = conn.getHeaderField("Location") ?: break
                    conn.disconnect()
                    conn = java.net.URL(conn.url, loc).openConnection() as java.net.HttpURLConnection
                    conn.connectTimeout = 30000; conn.readTimeout = 60000
                }
                if (conn.responseCode >= 400) throw IllegalStateException("HTTP ${conn.responseCode}")
                val total = conn.contentLengthLong
                var read = 0L
                var last = 0L
                val counting = object : java.io.FilterInputStream(java.io.BufferedInputStream(conn.inputStream, 1 shl 16)) {
                    override fun read(b: ByteArray, off: Int, len: Int): Int {
                        if (cancelled.contains(id)) throw java.io.InterruptedIOException("cancelled")
                        val n = super.read(b, off, len)
                        if (n > 0) {
                            read += n
                            val now = System.currentTimeMillis()
                            if (now - last > 500) { last = now; progress(id, if (total > 0) read.toDouble() / total else -1.0) }
                        }
                        return n
                    }
                }
                java.util.zip.ZipInputStream(counting).use { zip ->
                    val base = tmp.canonicalPath
                    var e = zip.nextEntry
                    while (e != null) {
                        val out = java.io.File(tmp, e.name)
                        if (!out.canonicalPath.startsWith(base)) throw SecurityException("bad zip entry")
                        if (e.isDirectory) out.mkdirs() else { out.parentFile?.mkdirs(); java.io.FileOutputStream(out).use { zip.copyTo(it, 1 shl 16) } }
                        e = zip.nextEntry
                    }
                }
                // the zip may contain one top folder: flatten it
                val kids = tmp.listFiles() ?: emptyArray()
                val src = if (kids.size == 1 && kids[0].isDirectory) kids[0] else tmp
                val dest = java.io.File(root, id)
                dest.deleteRecursively()
                if (!src.renameTo(dest)) throw IllegalStateException("Could not move voice files")
                tmp.deleteRecursively()
                progress(id, 1.0)
                promise.resolve(dest.path)
            } catch (e: Throwable) {
                tmp.deleteRecursively()
                promise.reject("VOICE_DOWNLOAD", if (cancelled.contains(id)) "cancelled" else (e.message ?: e.toString()))
            }
        }.start()
    }

    private fun progress(id: String, p: Double) {
        try {
            val m = Arguments.createMap(); m.putString("id", id); m.putDouble("progress", p)
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasVoiceDownload", m)
        } catch (_: Exception) {}
    }

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
        try { neural.shutdown() } catch (_: Throwable) {}
        super.invalidate()
    }
}
