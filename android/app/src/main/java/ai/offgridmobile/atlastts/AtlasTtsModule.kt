package ai.offgridmobile.atlastts

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * Speaks text with the phone's own text-to-speech engine (works offline when the
 * engine's voice data is installed - Google TTS / Samsung TTS normally are).
 * Long text is split into chunks; "AtlasTtsDone" fires once the LAST chunk of an
 * utterance has finished, "AtlasTtsStopped" when speech is cancelled.
 */
class AtlasTtsModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    @Volatile private var tts: TextToSpeech? = null
    @Volatile private var ready = false
    @Volatile private var lastErrored = ""
    private var rate = 1.0f
    private var pitch = 1.0f
    private var voiceName = ""
    private val pending = mutableListOf<Triple<String, String, String>>()

    // ---- natural (neural) voices ----
    private val neural by lazy { NeuralTts { e, id, detail -> emit(e, id, detail) } }
    /** Choosing a voice (reading the recording, loading the model, setting the reference) is one job at a time, in the order asked, so two choices can never leave the engine holding a mix of them. */
    private val voiceExec = java.util.concurrent.Executors.newSingleThreadExecutor()
    @Volatile private var neuralDir = ""
    @Volatile private var neuralSid = 0
    @Volatile private var voiceGen = 0
    /** Phone-call style output: play through the earpiece instead of the loudspeaker. */
    @Volatile private var earpiece = false

    private fun audioAttrs(): android.media.AudioAttributes = android.media.AudioAttributes.Builder()
        .setUsage(if (earpiece) android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION else android.media.AudioAttributes.USAGE_MEDIA)
        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build()

    private fun routeAudio(on: Boolean) {
        val am = ctx.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
        if (on) {
            am.mode = android.media.AudioManager.MODE_IN_COMMUNICATION
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                am.availableCommunicationDevices.firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }?.let { am.setCommunicationDevice(it) }
            } else {
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = false
            }
        } else {
            if (android.os.Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice()
            am.mode = android.media.AudioManager.MODE_NORMAL
        }
    }

    /** true = earpiece (hold the phone to your ear like a call), false = normal speaker / headphones. */
    @ReactMethod
    fun setEarpiece(on: Boolean, promise: Promise) {
        try {
            if (on == earpiece) { promise.resolve(true); return }
            earpiece = on
            neural.earpiece = on
            try { tts?.setAudioAttributes(audioAttrs()) } catch (_: Exception) {}
            routeAudio(on)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("AUDIO_ROUTE", e) }
    }
    /** synthesizeToFile jobs waiting for the engine: utterance id -> finished(ok). */
    private val fileJobs = java.util.concurrent.ConcurrentHashMap<String, (Boolean) -> Unit>()
    @Volatile private var fileCancel = false
    private val cancelled = java.util.Collections.synchronizedSet(mutableSetOf<String>())
    /** Where new voices are saved: the phone (default) or an SD card folder chosen in Settings. */
    @Volatile private var voicesBase = ""
    private fun voicesRoot() = (if (voicesBase.isNotBlank()) java.io.File(voicesBase, "voices") else java.io.File(ctx.filesDir, "voices")).apply { mkdirs() }
    private fun allVoiceRoots(): List<java.io.File> = listOfNotNull(java.io.File(ctx.filesDir, "voices"), if (voicesBase.isNotBlank()) java.io.File(voicesBase, "voices") else null).distinct()
    private fun findVoice(id: String): java.io.File? = allVoiceRoots().map { java.io.File(it, id) }.firstOrNull { it.isDirectory }

    @ReactMethod
    fun setVoicesBase(path: String, promise: Promise) { voicesBase = path; promise.resolve(true) }
    private fun useNeural(lang: String) = neuralDir.isNotEmpty() && neural.ready && (lang.isBlank() || lang.lowercase().startsWith("en"))

    override fun getName(): String = "AtlasTts"

    private fun emit(event: String, id: String, detail: String = "") {
        try {
            val map = Arguments.createMap()
            map.putString("utteranceId", id)
            if (detail.isNotEmpty()) { map.putString("message", detail); map.putString("reason", detail) }
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, map)
        } catch (_: Exception) {}
    }

    @Synchronized
    private fun ensure() {
        if (tts != null) return
        val holder = arrayOfNulls<TextToSpeech>(1)
        val early = arrayOfNulls<Int>(1)
        val e = TextToSpeech(ctx.applicationContext) { status ->
            val eng = synchronized(holder) { holder[0] ?: run { early[0] = status; null } }
            if (eng != null) onInit(eng, status)
        }
        tts = e
        val st = synchronized(holder) { holder[0] = e; early[0] }
        if (st != null) onInit(e, st) // the engine answered inside its constructor (e.g. no TTS engine installed)
    }

    private fun onInit(engine: TextToSpeech, status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            try { engine.language = Locale.getDefault() } catch (_: Exception) {}
            try { engine.setAudioAttributes(audioAttrs()) } catch (_: Exception) {}
            engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    if (utteranceId != null && utteranceId.endsWith("#0")) emit("AtlasTtsStart", utteranceId.substringBefore("#"))
                }
                override fun onDone(utteranceId: String?) {
                    if (utteranceId != null && fileJobs.remove(utteranceId)?.invoke(true) != null) return
                    if (utteranceId != null && utteranceId.endsWith("#last")) emit("AtlasTtsDone", utteranceId.substringBefore("#"))
                }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    if (utteranceId != null && fileJobs.remove(utteranceId)?.invoke(false) != null) return
                    val id = utteranceId?.substringBefore("#") ?: return
                    if (id == lastErrored) return
                    lastErrored = id
                    try { engine.stop() } catch (_: Exception) {}
                    emit("AtlasTtsDone", id)
                }
                override fun onStop(utteranceId: String?, interrupted: Boolean) {
                    if (utteranceId != null && fileJobs.remove(utteranceId)?.invoke(false) != null) return
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
                if (tts === engine) tts = null // try again next time instead of staying broken
            }
            try { engine.shutdown() } catch (_: Exception) {}
        }
    }

    private fun chunks(text: String, max: Int): List<String> = SpeechChunks.chunks(text, max)

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
                // The first piece is one sentence, so the voice starts speaking sooner.
                val parts = SpeechChunks.speechParts(text, 380)
                if (parts.isEmpty()) emit("AtlasTtsDone", utteranceId) else neural.speak(parts, utteranceId, sid, rate)
                promise.resolve(true); return
            }
            ensure()
            val now = synchronized(pending) {
                if (tts == null) null else if (!ready) { pending.add(Triple(text, utteranceId, lang)); false } else true
            }
            if (now == null) { promise.reject("NO_TTS_ENGINE", "No text-to-speech engine is installed on this phone. Install Google Speech Services, or download a natural voice in Models > Voice."); return }
            if (now) doSpeak(text, utteranceId, lang)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    private fun writeWav(file: java.io.File, pcm: ShortArray, rate: Int) {
        val data = pcm.size * 2
        val b = java.nio.ByteBuffer.allocate(44 + data).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()); b.putInt(36 + data); b.put("WAVE".toByteArray())
        b.put("fmt ".toByteArray()); b.putInt(16); b.putShort(1); b.putShort(1); b.putInt(rate); b.putInt(rate * 2); b.putShort(2); b.putShort(16)
        b.put("data".toByteArray()); b.putInt(data)
        for (v in pcm) b.putShort(v)
        file.writeBytes(b.array())
    }

    /**
     * Saves the spoken text as a WAV file using the voice chosen in Settings (natural voice or the
     * phone's own), without playing it. Used by "Save as video". Resolves the file path.
     */
    @ReactMethod
    fun synthesizeToFile(text: String, outPath: String, lang: String, promise: Promise) {
        Thread {
            try {
                fileCancel = false
                val out = java.io.File(outPath)
                out.parentFile?.mkdirs()
                if (useNeural(lang)) {
                    val sid = if (voiceName.startsWith("sid:")) voiceName.removePrefix("sid:").toIntOrNull() ?: neuralSid else neuralSid
                    val r = neural.synthesize(chunks(text, 380), sid, rate) { fileCancel }
                    if (r == null) { if (fileCancel) promise.reject("CANCELLED", "Stopped") else promise.reject("NO_VOICE", "The natural voice is not loaded yet. Open Settings > Voice and try again."); return@Thread }
                    writeWav(out, r.first, r.second)
                    promise.resolve(out.path); return@Thread
                }
                ensure()
                val waitUntil = System.currentTimeMillis() + 8000
                while (!ready && tts != null && System.currentTimeMillis() < waitUntil) Thread.sleep(50)
                val engine = tts
                if (engine == null || !ready) { promise.reject("NO_TTS_ENGINE", "No text-to-speech engine is installed on this phone."); return@Thread }
                synchronized(engine) {
                    engine.setSpeechRate(rate)
                    engine.setPitch(1.0f)
                    try {
                        val loc = if (lang.isBlank()) Locale.getDefault() else Locale.forLanguageTag(lang)
                        engine.setLanguage(loc)
                        if (voiceName.isNotBlank() && !voiceName.startsWith("sid:")) engine.voices?.firstOrNull { it.name == voiceName }?.let { engine.voice = it }
                    } catch (_: Exception) {}
                }
                val parts = chunks(text, (TextToSpeech.getMaxSpeechInputLength() - 100).coerceAtLeast(500))
                if (parts.isEmpty()) { promise.reject("EMPTY", "Nothing to say"); return@Thread }
                // The engine writes one file per call; join the pieces into one WAV.
                val pieces = mutableListOf<java.io.File>()
                for ((i, part) in parts.withIndex()) {
                    if (fileCancel) { pieces.forEach { it.delete() }; promise.reject("CANCELLED", "Stopped"); return@Thread }
                    val piece = java.io.File(out.path + ".$i.part")
                    val id = "file~${System.nanoTime()}"
                    val latch = java.util.concurrent.CountDownLatch(1)
                    var ok = false
                    fileJobs[id] = { v -> ok = v; latch.countDown() }
                    val q = engine.synthesizeToFile(part, Bundle(), piece, id)
                    if (q != TextToSpeech.SUCCESS) { fileJobs.remove(id); pieces.forEach { it.delete() }; promise.reject("TTS_ERROR", "The voice engine refused the text"); return@Thread }
                    if (!latch.await(120, java.util.concurrent.TimeUnit.SECONDS)) { fileJobs.remove(id) }
                    pieces.add(piece)
                    if (!ok || piece.length() <= 44) { pieces.forEach { it.delete() }; promise.reject("TTS_ERROR", "The voice engine could not save the speech"); return@Thread }
                }
                if (pieces.size == 1) { pieces[0].renameTo(out) } else {
                    // Same engine, same format: keep the first header and append the others' samples.
                    val first = pieces[0].readBytes()
                    val all = java.io.ByteArrayOutputStream()
                    all.write(first)
                    for (k in 1 until pieces.size) { val b = pieces[k].readBytes(); all.write(b, 44, b.size - 44) }
                    val bytes = all.toByteArray()
                    val bb = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                    bb.putInt(4, bytes.size - 8); bb.putInt(40, bytes.size - 44)
                    out.writeBytes(bytes)
                    pieces.forEach { it.delete() }
                }
                promise.resolve(out.path)
            } catch (e: Throwable) { promise.reject("TTS_ERROR", e.message ?: e.toString()) }
        }.start()
    }

    /**
     * Speaks a reply while it is still being written (natural voice only; resolves false for the
     * phone's own voice, which cannot take text this way). Add sentences with speakStreamAppend and
     * finish with speakStreamEnd.
     */
    @ReactMethod
    fun speakStreamStart(utteranceId: String, promise: Promise) {
        try {
            if (!useNeural("")) { promise.resolve(false); return }
            try { tts?.stop() } catch (_: Exception) {}
            val sid = if (voiceName.startsWith("sid:")) voiceName.removePrefix("sid:").toIntOrNull() ?: neuralSid else neuralSid
            neural.speakStreamStart(utteranceId, sid, rate)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    @ReactMethod
    fun speakStreamAppend(text: String, promise: Promise) {
        try { neural.speakStreamAppend(SpeechChunks.chunks(text, 380)); promise.resolve(true) }
        catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    @ReactMethod
    fun speakStreamEnd(promise: Promise) {
        try { neural.speakStreamEnd(); promise.resolve(true) } catch (e: Exception) { promise.reject("TTS_ERROR", e) }
    }

    @ReactMethod
    fun cancelSynthesis(promise: Promise) { fileCancel = true; promise.resolve(true) }

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

    // Cloned reference recordings are separate from model files. No external upload is performed.
    private val referenceRoot: java.io.File by lazy { java.io.File(ctx.noBackupFilesDir, "voice-references").apply { mkdirs() } }
    @Volatile private var activeReferenceId: String = ""
    private fun referenceFile(id: String): java.io.File {
        require(id.matches(Regex("[a-f0-9-]{36}"))) { "Invalid voice reference id" }
        return java.io.File(referenceRoot, "$id.wav")
    }

    /** Longest recording accepted as a source, so decoding it stays light on memory. */
    private val MAX_REFERENCE_SOURCE_SECONDS = 600.0

    /**
     * Imports a voice sample from any audio Android can play (mp3, m4a, ogg, flac, wav...) of any length up to ten
     * minutes. It is converted to 16 kHz mono; a long recording is cut to its clearest 20 seconds.
     */
    @ReactMethod
    fun importVoiceReference(uri: String, name: String, promise: Promise) {
        Thread {
            val converted = java.io.File(ctx.cacheDir, "voice-reference-${java.util.UUID.randomUUID()}.wav")
            try {
                val parsed = android.net.Uri.parse(uri)
                require(parsed.scheme == "file" || parsed.scheme == "content") { "Choose a local audio file" }
                val sourceSeconds = AudioDecoder.decode(ctx, parsed, converted, { false }) { }
                require(sourceSeconds >= 3.0) { "Use a recording of at least 3 seconds" }
                require(sourceSeconds <= MAX_REFERENCE_SOURCE_SECONDS) { "Use a recording shorter than 10 minutes" }
                // AudioDecoder writes a plain 44-byte WAV header followed by 16-bit mono samples.
                val bytes = converted.readBytes()
                val count = (bytes.size - 44) / 2
                val pcm = java.nio.ByteBuffer.wrap(bytes, 44, count * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                val samples = FloatArray(count) { pcm.short / 32768f }
                val start = VoiceReferenceCoach.bestWindowStart(samples, AudioDecoder.RATE, VoiceReferenceCoach.REFERENCE_SECONDS)
                val end = minOf(samples.size, start + VoiceReferenceCoach.REFERENCE_SECONDS * AudioDecoder.RATE)
                val encoded = VoiceReferenceCoach.encodeWav(VoiceCloneWav.Reference(samples.copyOfRange(start, end), AudioDecoder.RATE))
                val decoded = VoiceCloneWav.decode(encoded) // rejects silence and heavy clipping with a clear message
                val id = java.util.UUID.randomUUID().toString()
                val dest = referenceFile(id)
                try { dest.writeBytes(encoded) } catch (e: Throwable) { dest.delete(); throw e }
                promise.resolve(Arguments.createMap().apply {
                    putString("id", id); putDouble("seconds", decoded.seconds); putDouble("sourceSeconds", sourceSeconds)
                })
            } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_IMPORT", e.message ?: e.toString()) }
            finally { converted.delete() }
        }.start()
    }

    /** Atomically load Pocket TTS with its consented reference and generation setting. */
    @ReactMethod
    fun activateClonedVoice(id: String, sid: Int, style: ReadableMap?, referenceId: String,
                            steps: Int, promise: Promise) {
        val dir = findVoice(id)
        if (dir == null || !NeuralTts.isPocket(dir)) {
            promise.reject("NO_POCKET_MODEL", "Import the complete Pocket TTS model first"); return
        }
        if (steps !in listOf(2, 3, 5, 8)) { promise.reject("BAD_STEPS", "Invalid quality setting"); return }
        val g = ++voiceGen
        voiceExec.execute {
            try {
                // A newer choice was made while this one waited its turn: skip the work (a model load can take many seconds).
                if (g != voiceGen) { promise.resolve(0); return@execute }
                val accent = if (style?.hasKey("accent") == true) style.getString("accent") ?: "" else ""
                // The same clone is already active: nothing to load, and speech that is playing is left alone.
                if (neural.loadedDir == dir.path && neural.ready && neuralDir == dir.path && activeReferenceId == referenceId &&
                    neuralSid == sid && neural.cloneStepsNow == steps) {
                    promise.resolve(neural.numSpeakers()); return@execute
                }
                val source = referenceFile(referenceId)
                if (!source.isFile) throw IllegalArgumentException("The reference recording was deleted")
                val audio = VoiceCloneWav.decode(source.readBytes())
                neural.load(dir.path, accent) // the same model for another clone is not reloaded, and does not interrupt speech
                if (g == voiceGen) {
                    neuralSid = sid
                    neural.depth = 1f
                    neural.setCloneSteps(steps)
                    neural.setReference(audio)
                    activeReferenceId = referenceId
                    neuralDir = dir.path
                    promise.resolve(neural.numSpeakers())
                } else promise.resolve(0) // newer voice choice won
            } catch (e: Throwable) { if (g == voiceGen) neuralDir = ""; promise.reject("VOICE_CLONE_LOAD", e.message ?: e.toString()) }
        }
    }

    @ReactMethod
    fun setVoiceReference(id: String, promise: Promise) {
        Thread {
            try {
                val sample = if (id.isBlank()) null else {
                    val file = referenceFile(id)
                    if (!file.exists()) throw IllegalArgumentException("Voice recording missing; import it again")
                    VoiceCloneWav.decode(file.readBytes())
                }
                neural.setReference(sample)
                activeReferenceId = id
                promise.resolve(true)
            } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_LOAD", e.message ?: e.toString()) }
        }.start()
    }

    @ReactMethod
    fun setVoiceCloneSteps(steps: Int, promise: Promise) {
        try { neural.setCloneSteps(steps); promise.resolve(true) }
        catch (e: Throwable) { promise.reject("VOICE_CLONE_STEPS", e.message ?: e.toString()) }
    }

    /** Measures real synthesis on this device. It does not play, transmit or retain audio. */
    @ReactMethod
    fun benchmarkVoiceClone(text: String, promise: Promise) {
        Thread {
            try {
                require(neuralDir.isNotBlank() && neural.ready) { "Load the Pocket voice first" }
                require(text.length in 1..250) { "Invalid benchmark text" }
                val began = System.nanoTime()
                val output = neural.synthesize(chunks(text, 380), neuralSid, rate) { false }
                    ?: throw IllegalStateException("Voice generation unavailable")
                val generated = (System.nanoTime() - began) / 1_000_000_000.0
                val audio = output.first.size.toDouble() / output.second
                promise.resolve(Arguments.createMap().apply {
                    putDouble("synthesisSeconds", generated)
                    putDouble("audioSeconds", audio)
                    putDouble("realTimeFactor", if (audio > 0.0) generated / audio else 0.0)
                })
            } catch (e: Throwable) { promise.reject("VOICE_BENCHMARK", e.message ?: e.toString()) }
        }.start()
    }

    /** The ids of the voice samples stored on this phone (for syncing them to a paired phone). */
    @ReactMethod
    fun listVoiceReferences(promise: Promise) {
        try {
            val ids = Arguments.createArray()
            referenceRoot.listFiles()?.filter { it.isFile && it.name.endsWith(".wav") }
                ?.map { it.name.removeSuffix(".wav") }
                ?.filter { it.matches(Regex("[a-f0-9-]{36}")) }
                ?.forEach { ids.pushString(it) }
            promise.resolve(ids)
        } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_LIST", e.message ?: e.toString()) }
    }

    /** One stored voice sample as base64, to send to a paired phone. */
    @ReactMethod
    fun readVoiceReference(id: String, promise: Promise) {
        try {
            val file = referenceFile(id)
            if (!file.isFile) throw IllegalArgumentException("That voice sample is not on this phone")
            promise.resolve(android.util.Base64.encodeToString(file.readBytes(), android.util.Base64.NO_WRAP))
        } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_READ", e.message ?: e.toString()) }
    }

    /**
     * Keeps a voice sample received from a paired phone, after the same checks as an imported one (a real, usable
     * recording). It never replaces a sample this phone already has. Resolves true when it was kept.
     */
    @ReactMethod
    fun writeVoiceReference(id: String, base64: String, promise: Promise) {
        Thread {
            try {
                val dest = referenceFile(id)
                if (dest.exists()) { promise.resolve(false); return@Thread }
                val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
                require(bytes.size in 45..4_000_000) { "Invalid voice sample size" }
                VoiceCloneWav.decode(bytes) // rejects silence, clipping and anything that is not a voice sample
                val temp = java.io.File(referenceRoot, "$id.wav.part")
                try {
                    temp.writeBytes(bytes)
                    if (!temp.renameTo(dest)) throw IllegalStateException("Voice sample could not be saved")
                } finally { if (temp.exists()) temp.delete() }
                promise.resolve(true)
            } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_WRITE", e.message ?: e.toString()) }
        }.start()
    }

    @ReactMethod
    fun deleteVoiceReference(id: String, promise: Promise) {
        try {
            val file = referenceFile(id)
            // A recording that is already gone counts as deleted, so a stale entry can still be removed from the list.
            if (file.exists() && !file.delete()) throw IllegalStateException("Voice recording could not be deleted")
            if (activeReferenceId == id) { neural.setReference(null); activeReferenceId = "" }
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_DELETE", e.message ?: e.toString()) }
    }

    @ReactMethod
    fun analyzeVoiceReference(id: String, promise: Promise) {
        Thread {
            try {
                val file = referenceFile(id)
                val report = VoiceReferenceCoach.analyze(VoiceCloneWav.decode(file.readBytes()))
                promise.resolve(Arguments.createMap().apply {
                    putString("rating", report.rating)
                    putDouble("seconds", report.seconds)
                    putDouble("peak", report.peak)
                    putDouble("rmsDb", report.rmsDb)
                    putDouble("noiseFloorDb", report.noiseFloorDb)
                    putDouble("signalNoiseDb", report.signalNoiseDb)
                    putDouble("clippedPercent", report.clippedPercent)
                    putDouble("quietPercent", report.quietPercent)
                    putDouble("trimStartSeconds", report.trimStartSeconds)
                    putDouble("trimEndSeconds", report.trimEndSeconds)
                    val notes = Arguments.createArray()
                    for (advice in report.advice) notes.pushString(advice)
                    putArray("advice", notes)
                })
            } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_ANALYZE", e.message ?: e.toString()) }
        }.start()
    }

    @ReactMethod
    fun improveVoiceReference(id: String, promise: Promise) {
        Thread {
            try {
                val input = VoiceCloneWav.decode(referenceFile(id).readBytes())
                val improved = VoiceReferenceCoach.improve(input)
                val encoded = VoiceReferenceCoach.encodeWav(improved)
                require(encoded.size <= VoiceCloneWav.MAX_BYTES) { "Improved recording is too large" }
                VoiceCloneWav.decode(encoded) // reject accidental invalid WAV output before saving
                val newId = java.util.UUID.randomUUID().toString()
                val target = referenceFile(newId)
                try { target.writeBytes(encoded) } catch (e: Throwable) { target.delete(); throw e }
                promise.resolve(Arguments.createMap().apply {
                    putString("id", newId)
                    putDouble("seconds", improved.samples.size.toDouble() / improved.sampleRate)
                })
            } catch (e: Throwable) { promise.reject("VOICE_REFERENCE_IMPROVE", e.message ?: e.toString()) }
        }.start()
    }

    /**
     * Use a downloaded natural voice (folder name under voices/), or "" for the phone's voice.
     * `style` may hold `accent` ("gb"/"us": pronunciation dictionary of multi-accent Kokoro) and
     * `depth` (1 = as recorded, lower = deeper). Resolves the number of speakers.
     */
    @ReactMethod
    fun setNeuralVoice(id: String, sid: Int, style: ReadableMap?, promise: Promise) {
        val accent = if (style?.hasKey("accent") == true) style.getString("accent") ?: "" else ""
        val depth = if (style?.hasKey("depth") == true) style.getDouble("depth").toFloat() else 1f
        val g = ++voiceGen
        if (id.isBlank()) { neuralDir = ""; neural.releaseAsync(); promise.resolve(0); return }
        val dir = findVoice(id)
        if (dir == null) { neuralDir = ""; promise.reject("NO_VOICE", "Voice not downloaded (if it was on an SD card, put the card back)"); return }
        voiceExec.execute {
            try {
                if (g != voiceGen) { promise.resolve(0); return@execute }
                neural.load(dir.path, accent)
                // The speaker and depth change only once this choice is the one that won, so speech already playing is not altered by a choice still loading.
                if (g == voiceGen) { neuralSid = sid; neural.depth = depth; neuralDir = dir.path; promise.resolve(neural.numSpeakers()) }
                else promise.resolve(0) // a newer choice was made while this one loaded
            } catch (e: Throwable) { if (g == voiceGen) neuralDir = ""; promise.reject("VOICE_LOAD", e.message ?: e.toString()) }
        }
    }

    @ReactMethod
    fun setNeuralSpeaker(sid: Int, promise: Promise) { neuralSid = sid; promise.resolve(true) }

    @ReactMethod
    fun installedNeuralVoices(promise: Promise) {
        val out = Arguments.createArray()
        allVoiceRoots().flatMap { r -> r.listFiles()?.toList() ?: emptyList() }.filter { it.isDirectory && !it.name.endsWith(".part") }.distinctBy { it.name }.forEach { d ->
            out.pushMap(Arguments.createMap().apply { putString("id", d.name); putDouble("bytes", d.walkTopDown().filter { it.isFile }.sumOf { it.length() }.toDouble()) })
        }
        promise.resolve(out)
    }

    @ReactMethod
    fun deleteNeuralVoice(id: String, promise: Promise) {
        if (id.isBlank() || id.contains('/') || id.contains("..")) { promise.reject("BAD_ID", "Invalid voice"); return }
        Thread {
            val d = findVoice(id) ?: java.io.File(voicesRoot(), id)
            if (d.path == neuralDir) { neuralDir = ""; try { neural.release() } catch (_: Throwable) {} }
            else if (d.path == neural.loadedDir) { try { neural.release() } catch (_: Throwable) {} }
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
            try {
                val dest = ModelPack.download(url, voicesRoot(), id, { cancelled.contains(id) }) { p -> progress(id, p) }
                promise.resolve(dest.path)
            } catch (e: Throwable) {
                promise.reject("VOICE_DOWNLOAD", if (cancelled.contains(id)) "cancelled" else (e.message ?: e.toString()))
            }
        }.start()
    }

    /**
     * Imports a voice file the user downloaded (a sherpa-onnx .tar.bz2 or .zip of a Piper/VITS,
     * Kokoro or KittenTTS voice). Unpacks it into voices/<id>, checks it is a voice Atlas can
     * play, and resolves the new id.
     */
    @ReactMethod
    fun importNeuralVoice(uri: String, name: String, promise: Promise) {
        Thread {
            try {
                val input = ctx.contentResolver.openInputStream(android.net.Uri.parse(uri))
                    ?: throw IllegalStateException("Could not open the file")
                promise.resolve(input.use { installVoice(it, name) })
            } catch (e: Throwable) { promise.reject("VOICE_IMPORT", e.message ?: e.toString()) }
        }.start()
    }

    /**
     * Downloads a voice package (a sherpa-onnx .tar.bz2 or .zip) from a web address and installs it the same way as an
     * imported file. Emits AtlasVoiceDownload {id, progress} with the id the voice will have. Resolves that id.
     */
    @ReactMethod
    fun downloadAndImportNeuralVoice(url: String, name: String, promise: Promise) {
        val id = VoiceImport.idFor(name)
        cancelled.remove(id)
        Thread {
            val archive = java.io.File(ctx.cacheDir, "voice-download-$id.archive")
            try {
                require(url.startsWith("https://")) { "Voice downloads must use https" }
                var conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 30000; conn.readTimeout = 60000; conn.setRequestProperty("User-Agent", "Atlas")
                var hops = 0
                while (conn.responseCode in 300..399 && hops++ < 5) {
                    val loc = conn.getHeaderField("Location") ?: break
                    val next = java.net.URL(conn.url, loc)
                    conn.disconnect()
                    require(next.protocol == "https") { "Voice downloads must use https" }
                    conn = next.openConnection() as java.net.HttpURLConnection
                    conn.connectTimeout = 30000; conn.readTimeout = 60000; conn.setRequestProperty("User-Agent", "Atlas")
                }
                if (conn.responseCode >= 400) throw IllegalStateException("HTTP ${conn.responseCode}")
                val total = conn.contentLengthLong
                require(total <= MAX_VOICE_DOWNLOAD_BYTES) { "That download is far larger than a voice" }
                var read = 0L
                var last = 0L
                conn.inputStream.use { input ->
                    archive.outputStream().use { out ->
                        val buffer = ByteArray(1 shl 16)
                        while (true) {
                            if (cancelled.contains(id)) throw java.io.InterruptedIOException("cancelled")
                            val n = input.read(buffer)
                            if (n < 0) break
                            out.write(buffer, 0, n)
                            read += n
                            require(read <= MAX_VOICE_DOWNLOAD_BYTES) { "That download is far larger than a voice" }
                            val now = System.currentTimeMillis()
                            if (now - last > 500) { last = now; progress(id, if (total > 0) read.toDouble() / total else -1.0) }
                        }
                    }
                }
                progress(id, 1.0)
                promise.resolve(archive.inputStream().use { installVoice(it, name) })
            } catch (e: Throwable) {
                promise.reject("VOICE_DOWNLOAD", if (cancelled.contains(id)) "cancelled" else (e.message ?: e.toString()))
            } finally { archive.delete() }
        }.start()
    }

    private val MAX_VOICE_DOWNLOAD_BYTES = 2L * 1024 * 1024 * 1024

    /** Unpacks a voice package stream into voices/<id>, checks Atlas can play it, and returns the new id. */
    private fun installVoice(input: java.io.InputStream, name: String): String {
        val id = VoiceImport.idFor(name)
        val root = voicesRoot()
        val tmp = java.io.File(root, "$id.part")
        try {
            tmp.deleteRecursively(); tmp.mkdirs()
            VoiceImport.unpack(input, tmp)
            val kids = tmp.listFiles() ?: emptyArray()
            val src = if (kids.size == 1 && kids[0].isDirectory) kids[0] else tmp
            VoiceImport.problem(src)?.let { throw IllegalArgumentException(it) }
            val dest = java.io.File(root, id)
            if (dest.path == neuralDir || dest.path == neural.loadedDir) { neuralDir = ""; try { neural.release() } catch (_: Throwable) {} }
            dest.deleteRecursively()
            if (!src.renameTo(dest)) throw IllegalStateException("Could not move voice files")
            return id
        } finally { tmp.deleteRecursively() }
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
        try { if (earpiece) routeAudio(false) } catch (_: Exception) {}
        try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
        tts = null
        try { neural.shutdown() } catch (_: Throwable) {}
        super.invalidate()
    }
}
