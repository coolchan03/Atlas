package ai.offgridmobile.atlastts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import com.k2fsa.sherpa.onnx.GeneratedAudio
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsPocketModelConfig
import com.k2fsa.sherpa.onnx.GenerationConfig
import java.io.File
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Natural-sounding offline voices (Kokoro / KittenTTS / Piper neural models via sherpa-onnx).
 * Text is generated sentence by sentence on one thread and played on another, so speech
 * starts after the first sentence instead of after the whole answer.
 */
class NeuralTts(private val emit: (String, String, String) -> Unit) {
    // Every use of the native engine (load, generate, release) runs on this ONE thread,
    // so a voice can never be freed while it is generating.
    private val genExec = Executors.newSingleThreadExecutor()
    @Volatile private var tts: OfflineTts? = null
    @Volatile var loadedDir: String = ""; private set
    @Volatile private var loadedAccent: String = ""
    /**
     * Voice depth: 1 = as recorded. Below 1 the voice is generated faster and played back
     * slower by the same factor, so the pace stays the same and the voice sounds lower and fuller.
     */
    @Volatile var depth = 1f
    private val tokenA = java.util.concurrent.atomic.AtomicInteger(0)
    private val token: Int get() = tokenA.get()
    /** Why the last token change happened: the person stopped speech ("cancelled") or other speech started ("interrupted"). */
    @Volatile private var endReason = "cancelled"
    private fun bump(reason: String): Int { endReason = reason; return tokenA.incrementAndGet() }
    /** Play through the earpiece (phone-call style) instead of the loudspeaker. */
    @Volatile var earpiece = false
    @Volatile private var track: AudioTrack? = null
    @Volatile private var speakers = 0
    @Volatile private var pocketLoaded = false
    @Volatile private var cloneReference: VoiceCloneWav.Reference? = null
    @Volatile private var cloneSteps: Int = 2

    fun setCloneSteps(steps: Int) { require(steps in listOf(2, 3, 5, 8)); cloneSteps = steps }
    val cloneStepsNow: Int get() = cloneSteps

    /** A new reference applies to the next utterance, never to the currently generating sentence. */
    fun setReference(reference: VoiceCloneWav.Reference?) {
        cloneReference = reference
    }

    /** The samples for [text]. A cloned voice gets its text tidied first (see [PocketText]) so it knows where the speech ends. */
    private fun generateAudio(engine: OfflineTts, text: String, sid: Int, speed: Float,
                              reference: VoiceCloneWav.Reference?, steps: Int): FloatArray {
        if (!pocketLoaded) return engine.generate(text, sid, speed).samples
        return generatePocket(engine, PocketText.prepare(text), sid, speed, reference, steps).samples
    }

    /** One cloned-voice generation exactly as given (no tidying), with its timing logged. */
    private fun generatePocket(engine: OfflineTts, text: String, sid: Int, speed: Float,
                               reference: VoiceCloneWav.Reference?, steps: Int): GeneratedAudio {
        val ref = reference ?: throw IllegalStateException("Choose a recording before using a cloned Pocket TTS voice")
        val started = System.nanoTime()
        val audio = engine.generateWithConfig(text, GenerationConfig(
            sid = sid, speed = speed, referenceAudio = ref.samples, referenceSampleRate = ref.sampleRate,
            numSteps = steps,
            extra = mapOf("max_reference_audio_len" to VoiceReferenceCoach.REFERENCE_SECONDS.toString())
        ))
        val ms = (System.nanoTime() - started) / 1_000_000
        // One line per generation (adb logcat -s AtlasTts): enough to compare steps, check the sample rate the engine
        // reports against the one the player uses, and see how long a cold voice takes.
        Log.i("AtlasTts", "pocket generated ${audio.samples.size} samples at ${audio.sampleRate} Hz (engine ${try { engine.sampleRate() } catch (_: Throwable) { -1 }} Hz), steps=$steps, ${ms} ms")
        return audio
    }

    /** One run of the voice lab: the same sentence at one setting, saved as a WAV file and measured. */
    class LabRun(val label: String, val steps: Int, val millis: Long, val audioRate: Int, val engineRate: Int, val path: String,
                 val stats: VoiceStats.Stats?, val error: String?)
    class LabReport(val referenceRate: Int, val reference: VoiceStats.Stats?, val runs: List<LabRun>)

    /**
     * Voice lab (a hidden screen): generates [text] with the loaded cloned voice at each of [stepsList], once more at the
     * first step count with the text exactly as typed (no tidying), saves each as a WAV file in [dir] and measures it, along
     * with the reference recording. Speech is stopped first; runs on the generation thread like all engine use.
     */
    fun lab(text: String, sid: Int, speed: Float, stepsList: List<Int>, dir: File): LabReport {
        bump("interrupted")
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
        return genExec.submit(Callable<LabReport> {
            val engine = tts ?: throw IllegalStateException("No voice is loaded")
            if (!pocketLoaded) throw IllegalStateException("The lab needs a cloned Pocket TTS voice")
            val reference = cloneReference ?: throw IllegalStateException("Choose a recording before using a cloned Pocket TTS voice")
            dir.mkdirs()
            val engineRate = try { engine.sampleRate() } catch (_: Throwable) { 24000 }
            val runs = ArrayList<LabRun>()
            val plan = stepsList.map { Triple("steps $it, text tidied", it, true) } + listOf(Triple("steps ${stepsList.first()}, text as typed", stepsList.first(), false))
            for ((label, steps, tidy) in plan) {
                val started = System.nanoTime()
                try {
                    val audio = generatePocket(engine, if (tidy) PocketText.prepare(text) else text, sid, speed, reference, steps)
                    val ms = (System.nanoTime() - started) / 1_000_000
                    val file = File(dir, "lab-${label.replace(Regex("[^a-z0-9]+"), "-")}.wav")
                    file.writeBytes(WavFile.encode(audio.samples, audio.sampleRate))
                    runs.add(LabRun(label, steps, ms, audio.sampleRate, engineRate, file.path, VoiceStats.analyze(audio.samples, audio.sampleRate), null))
                } catch (t: Throwable) {
                    runs.add(LabRun(label, steps, (System.nanoTime() - started) / 1_000_000, 0, engineRate, "", null, t.message ?: t.toString()))
                }
            }
            LabReport(reference.sampleRate, VoiceStats.analyze(reference.samples, reference.sampleRate), runs)
        }).get()
    }

    /**
     * Plays a WAV file through the very same output the voice uses (one AudioTrack, streamed in float), so a lab recording can be
     * compared with the same audio played by Android's own player.
     */
    fun playFile(path: String, id: String) {
        val wav = WavFile.decode(File(path).readBytes())
        val my = bump("interrupted")
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
        val queue = LinkedBlockingQueue<FloatArray>()
        val end = FloatArray(0)
        queue.put(wav.samples); queue.put(end)
        val failure = java.util.concurrent.atomic.AtomicReference<String?>(null)
        Thread { play(queue, end, wav.rate, id, my, failure) }.start()
    }

    val ready: Boolean get() = tts != null

    /**
     * Loads a voice folder. `accent` ("gb", "us" or "") picks the pronunciation dictionary of
     * multi-accent Kokoro packages. Blocks the caller (never call from the UI thread).
     */
    fun load(dir: String, accent: String = "") {
        // The same voice is already loaded: nothing to do, and speech that is playing must not be cut off by a reload that changes nothing.
        if (dir == loadedDir && accent == loadedAccent && tts != null) return
        bump("interrupted")
        genExec.submit(Callable<Unit> {
            if (dir == loadedDir && accent == loadedAccent && tts != null) return@Callable
            freeEngine()
            val f = File(dir)
            val onnx = f.listFiles { x -> x.name.endsWith(".onnx") }?.maxByOrNull { it.length() }
                ?: throw IllegalStateException("No voice model in $dir")
            val tokens = File(f, "tokens.txt").path
            val espeak = File(f, "espeak-ng-data").let { if (it.isDirectory) it.path else "" }
            val mc = OfflineTtsModelConfig()
            mc.numThreads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
            mc.debug = false
            mc.provider = "cpu"
            // Pocket TTS has multiple ONNX files and no tokens.txt: it must not fall through to VITS.
            val pocket = isPocket(f)
            if (pocket) {
                val k = OfflineTtsPocketModelConfig()
                k.lmFlow = File(f, "lm_flow.int8.onnx").path
                k.lmMain = File(f, "lm_main.int8.onnx").path
                k.encoder = File(f, "encoder.onnx").path
                k.decoder = File(f, "decoder.int8.onnx").path
                k.textConditioner = File(f, "text_conditioner.onnx").path
                k.vocabJson = File(f, "vocab.json").path
                k.tokenScoresJson = File(f, "token_scores.json").path
                k.voiceEmbeddingCacheCapacity = 10
                mc.pocket = k
            } else if (isKitten(f)) {
                val k = OfflineTtsKittenModelConfig()
                k.model = onnx.path; k.voices = File(f, "voices.bin").path; k.tokens = tokens; k.dataDir = espeak
                k.lengthScale = 1.0f
                mc.kitten = k
            } else if (File(f, "voices.bin").exists()) {
                val k = OfflineTtsKokoroModelConfig()
                k.model = onnx.path; k.voices = File(f, "voices.bin").path; k.tokens = tokens; k.dataDir = espeak
                val (lex, lang) = kokoroDictionary(f.listFiles()?.map { it.name } ?: emptyList(), accent)
                if (lex.isNotEmpty()) k.lexicon = lex.joinToString(",") { File(f, it).path }
                if (lang.isNotEmpty()) k.lang = lang
                File(f, "dict").let { if (it.isDirectory) k.dictDir = it.path }
                mc.kokoro = k
            } else {
                val v = OfflineTtsVitsModelConfig()
                v.model = onnx.path; v.tokens = tokens; v.dataDir = espeak
                mc.vits = v
            }
            val c = OfflineTtsConfig()
            c.model = mc
            c.maxNumSentences = 1
            val e = OfflineTts(config = c)
            speakers = try { e.numSpeakers().coerceAtLeast(1) } catch (_: Throwable) { 1 }
            tts = e
            pocketLoaded = pocket
            if (!pocket) cloneReference = null // do not retain old cloned audio when changing models
            loadedDir = dir
            loadedAccent = accent
        }).get()
    }

    fun numSpeakers(): Int = if (tts != null) speakers else 0

    companion object {
        /** A valid Pocket model is all seven required files, not merely an ONNX named like a Pocket model. */
        fun isPocket(dir: File): Boolean =
            listOf("lm_flow.int8.onnx", "lm_main.int8.onnx", "encoder.onnx", "decoder.int8.onnx",
                "text_conditioner.onnx", "vocab.json", "token_scores.json").all { File(dir, it).isFile }

        /** KittenTTS voice folder: the downloaded id starts with "kitten" and holds voices.bin. */
        fun isKitten(dir: File): Boolean =
            dir.name.startsWith("kitten", ignoreCase = true) && File(dir, "voices.bin").exists()

        /**
         * Pronunciation dictionaries and language for a Kokoro folder. Multi-accent packages
         * (Kokoro v1.0) ship lexicon-gb-en.txt and lexicon-us-en.txt: British speakers need the
         * UK dictionary alone with lang "en" ("en-gb" renders silence); everyone else gets the
         * US one with "en-us". Older single-accent packages keep every lexicon and no lang.
         */
        fun kokoroDictionary(files: List<String>, accent: String): Pair<List<String>, String> {
            val gb = "lexicon-gb-en.txt"; val us = "lexicon-us-en.txt"
            if (accent == "gb" && gb in files) return Pair(listOf(gb), "en")
            if (us in files && gb in files) return Pair(listOf(us), "en-us")
            return Pair(files.filter { it.startsWith("lexicon") && it.endsWith(".txt") }.sorted(), "")
        }

        /** Generation speed and playback rate for a depth (see [depth]). */
        fun deepen(speed: Float, rate: Int, depth: Float): Pair<Float, Int> {
            val d = depth.coerceIn(0.7f, 1f)
            return Pair(speed / d, Math.round(rate * d))
        }
    }

    private fun freeEngine() {
        try { tts?.release() } catch (_: Throwable) {}
        tts = null
        speakers = 0
        pocketLoaded = false
        cloneReference = null // release sensitive reference samples with the engine
        loadedDir = ""
        loadedAccent = ""
    }

    /** Frees the voice later, in order with any load that follows (never blocks). */
    fun releaseAsync() {
        stop()
        try { genExec.execute { freeEngine() } } catch (_: Throwable) {}
    }

    /** Frees the voice (blocks until any sentence being generated is finished). */
    fun release() {
        stop()
        try { genExec.submit(Callable<Unit> { freeEngine() }).get() } catch (_: Throwable) {}
    }

    fun shutdown() {
        stop()
        try { genExec.execute { freeEngine() }; genExec.shutdown() } catch (_: Throwable) {}
    }


    /**
     * Renders text to 16-bit mono PCM offline (for saving a video). Runs on the generation
     * thread, so it never overlaps a spoken reply. Returns null if the voice is not loaded.
     */
    fun synthesize(parts: List<String>, sid: Int, speed: Float, cancelled: () -> Boolean): Pair<ShortArray, Int>? {
        return genExec.submit(Callable<Pair<ShortArray, Int>?> {
            val engine = tts ?: return@Callable null
            val reference = cloneReference; val steps = cloneSteps
            val (genSpeed, rate) = deepen(speed, try { engine.sampleRate() } catch (_: Throwable) { 24000 }, depth)
            val out = java.io.ByteArrayOutputStream()
            val gap = ShortArray(rate / 8)
            fun put(a: ShortArray) { val b = java.nio.ByteBuffer.allocate(a.size * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN); b.asShortBuffer().put(a); out.write(b.array()) }
            for (p in parts) {
                if (cancelled()) return@Callable null
                val f = generateAudio(engine, p, sid, genSpeed, reference, steps)
                put(ShortArray(f.size) { (f[it].coerceIn(-1f, 1f) * 32767f).toInt().toShort() })
                put(gap)
            }
            val bytes = out.toByteArray()
            val sh = ShortArray(bytes.size / 2)
            java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(sh)
            Pair(sh, rate)
        }).get()
    }

    fun stop() {
        bump("cancelled")
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
    }

    fun speak(parts: List<String>, id: String, sid: Int, speed: Float) {
        val my = bump("interrupted")
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
        val it = parts.iterator()
        genExec.execute { run({ if (it.hasNext()) it.next() else null }, id, sid, speed, my) }
    }

    /** Marks the end of a streamed reply (compared by identity, so no text can be mistaken for it). */
    private val streamEnd = Any()
    @Volatile private var streamIn: LinkedBlockingQueue<Any>? = null

    /**
     * Starts speaking a reply that is still being written: sentences are added with [speakStreamAppend]
     * and the voice generates each one while the one before it plays, so it starts after the first
     * sentence instead of after the whole reply. Ends (and reports done) after [speakStreamEnd].
     */
    fun speakStreamStart(id: String, sid: Int, speed: Float) {
        val my = bump("interrupted")
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
        val input = LinkedBlockingQueue<Any>()
        streamIn = input
        genExec.execute {
            run({
                var next: String? = null
                while (token == my) {
                    val v = input.poll(200, TimeUnit.MILLISECONDS) ?: continue
                    next = if (v === streamEnd) null else v as String
                    break
                }
                next
            }, id, sid, speed, my)
        }
    }

    fun speakStreamAppend(parts: List<String>) { val q = streamIn ?: return; parts.forEach { q.put(it) } }

    fun speakStreamEnd() { streamIn?.put(streamEnd); streamIn = null }

    /** Generates each part the source hands over (null = no more) and queues it for the player. Failures are reported, never swallowed. */
    private fun run(nextPart: () -> String?, id: String, sid: Int, speed: Float, my: Int) {
        val engine = tts
        if (token != my) { emit("AtlasTtsStopped", id, endReason); return }
        if (engine == null) { emit("AtlasTtsError", id, "No voice is loaded"); return }
        val reference = cloneReference; val steps = cloneSteps
        val (genSpeed, rate) = deepen(speed, try { engine.sampleRate() } catch (_: Throwable) { 24000 }, depth)
        val queue = LinkedBlockingQueue<FloatArray>()
        val end = FloatArray(0)
        val failure = java.util.concurrent.atomic.AtomicReference<String?>(null)
        val player = Thread { play(queue, end, rate, id, my, failure) }
        player.start()
        try {
            while (token == my) {
                val p = nextPart() ?: break
                val audio = generateAudio(engine, p, sid, genSpeed, reference, steps)
                if (token != my) break
                if (audio.isEmpty()) continue // nothing for this piece: the player reports it if nothing at all is heard
                queue.put(audio)
                queue.put(FloatArray(rate / 8)) // short pause between sentences
            }
        } catch (t: Throwable) {
            Log.e("AtlasTts", "generation failed", t)
            failure.compareAndSet(null, t.message ?: t.toString())
        }
        queue.put(end)
    }

    /**
     * Plays one utterance on its own AudioTrack, which this thread owns and releases. Ends with exactly one event:
     * AtlasTtsDone (all of it was heard), AtlasTtsError (a failure, or nothing could be heard) or AtlasTtsStopped (cancelled or interrupted).
     */
    private fun play(queue: LinkedBlockingQueue<FloatArray>, end: FloatArray, rate: Int, id: String, my: Int,
                     failure: java.util.concurrent.atomic.AtomicReference<String?>) {
        var t: AudioTrack? = null
        var frames = 0L
        var started = false
        var buffering = false
        try {
            val min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
            t = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(if (earpiece) AudioAttributes.USAGE_VOICE_COMMUNICATION else AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(maxOf(min * 2, rate * 4 / 2))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            if (android.os.Build.VERSION.SDK_INT >= 31) { try { t.setStartThresholdInFrames(1) } catch (_: Throwable) {} }
            track = t
            while (token == my) {
                val buf = queue.poll(200, TimeUnit.MILLISECONDS)
                if (buf == null) {
                    // Audio already heard has run out and the next piece is still being made.
                    if (started && !buffering) { buffering = true; emit("AtlasTtsBuffering", id, "") }
                    continue
                }
                if (buf === end) break
                if (!started) { started = true; t.play(); emit("AtlasTtsStart", id, "") }
                else if (buffering) { buffering = false; emit("AtlasTtsResumed", id, "") }
                var off = 0
                while (off < buf.size && token == my) {
                    val n = t.write(buf, off, minOf(4096, buf.size - off), AudioTrack.WRITE_BLOCKING)
                    if (n <= 0) { failure.compareAndSet(null, "The audio output refused the sound (error $n)"); break }
                    off += n
                }
                frames += buf.size
                if (failure.get() != null) break
            }
            if (token == my && started && failure.get() == null) {
                // A little silence makes sure the buffer is full enough to play out, then wait for the end.
                val tail = FloatArray(rate / 2)
                t.write(tail, 0, tail.size, AudioTrack.WRITE_NON_BLOCKING)
                var last = -1; var still = 0L
                while (token == my && t.playbackHeadPosition < frames) {
                    val h = t.playbackHeadPosition
                    if (h == last) { still += 40; if (still > 1500) { failure.compareAndSet(null, "The audio output stopped moving before the speech finished"); break } } else { still = 0; last = h }
                    Thread.sleep(40)
                }
                try { t.stop() } catch (_: Throwable) {}
            }
        } catch (e: Throwable) {
            Log.e("AtlasTts", "playback failed", e)
            failure.compareAndSet(null, e.message ?: e.toString())
        } finally {
            if (track === t) track = null
            try { t?.release() } catch (_: Throwable) {}
        }
        val problem = failure.get()
        when {
            problem != null -> emit("AtlasTtsError", id, problem)
            token != my -> emit("AtlasTtsStopped", id, endReason)
            !started -> emit("AtlasTtsError", id, "The voice produced no audio")
            else -> emit("AtlasTtsDone", id, "")
        }
    }
}
