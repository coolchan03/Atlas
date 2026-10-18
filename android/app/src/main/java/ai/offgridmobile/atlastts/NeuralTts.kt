package ai.offgridmobile.atlastts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
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
class NeuralTts(private val emit: (String, String) -> Unit) {
    // Every use of the native engine (load, generate, release) runs on this ONE thread,
    // so a voice can never be freed while it is generating.
    private val genExec = Executors.newSingleThreadExecutor()
    @Volatile private var tts: OfflineTts? = null
    @Volatile var loadedDir: String = ""; private set
    private val tokenA = java.util.concurrent.atomic.AtomicInteger(0)
    private val token: Int get() = tokenA.get()
    /** Play through the earpiece (phone-call style) instead of the loudspeaker. */
    @Volatile var earpiece = false
    @Volatile private var track: AudioTrack? = null
    @Volatile private var speakers = 0

    val ready: Boolean get() = tts != null

    /** Loads a voice folder. Blocks the caller (never call from the UI thread). */
    fun load(dir: String) {
        tokenA.incrementAndGet()
        genExec.submit(Callable<Unit> {
            if (dir == loadedDir && tts != null) return@Callable
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
            // KittenTTS and Kokoro both ship voices.bin; Atlas names KittenTTS folders "kitten-*".
            if (isKitten(f)) {
                val k = OfflineTtsKittenModelConfig()
                k.model = onnx.path; k.voices = File(f, "voices.bin").path; k.tokens = tokens; k.dataDir = espeak
                k.lengthScale = 1.0f
                mc.kitten = k
            } else if (File(f, "voices.bin").exists()) {
                val k = OfflineTtsKokoroModelConfig()
                k.model = onnx.path; k.voices = File(f, "voices.bin").path; k.tokens = tokens; k.dataDir = espeak
                val lex = f.listFiles { x -> x.name.startsWith("lexicon") && x.name.endsWith(".txt") }?.joinToString(",") { it.path } ?: ""
                if (lex.isNotEmpty()) k.lexicon = lex
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
            speakers = try { e.numSpeakers() } catch (_: Throwable) { 1 }
            tts = e
            loadedDir = dir
        }).get()
    }

    fun numSpeakers(): Int = if (tts != null) speakers else 0

    companion object {
        /** KittenTTS voice folder: the downloaded id starts with "kitten" and holds voices.bin. */
        fun isKitten(dir: File): Boolean =
            dir.name.startsWith("kitten", ignoreCase = true) && File(dir, "voices.bin").exists()
    }

    private fun freeEngine() {
        try { tts?.release() } catch (_: Throwable) {}
        tts = null
        speakers = 0
        loadedDir = ""
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
            val rate = try { engine.sampleRate() } catch (_: Throwable) { 24000 }
            val out = java.io.ByteArrayOutputStream()
            val gap = ShortArray(rate / 8)
            fun put(a: ShortArray) { val b = java.nio.ByteBuffer.allocate(a.size * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN); b.asShortBuffer().put(a); out.write(b.array()) }
            for (p in parts) {
                if (cancelled()) return@Callable null
                val f = engine.generate(p, sid, speed).samples
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
        tokenA.incrementAndGet()
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
    }

    fun speak(parts: List<String>, id: String, sid: Int, speed: Float) {
        val my = tokenA.incrementAndGet()
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
        genExec.execute { run(parts, id, sid, speed, my) }
    }

    private fun run(parts: List<String>, id: String, sid: Int, speed: Float, my: Int) {
        val engine = tts
        if (engine == null || token != my) { emit(if (token == my) "AtlasTtsDone" else "AtlasTtsStopped", id); return }
        val rate = try { engine.sampleRate() } catch (_: Throwable) { 24000 }
        val queue = LinkedBlockingQueue<FloatArray>()
        val end = FloatArray(0)
        val player = Thread { play(queue, end, rate, id, my) }
        player.start()
        try {
            for (p in parts) {
                if (token != my) break
                val audio = engine.generate(p, sid, speed)
                if (token != my) break
                queue.put(audio.samples)
                queue.put(FloatArray(rate / 8)) // short pause between sentences
            }
        } catch (_: Throwable) {}
        queue.put(end)
    }

    /** Plays one utterance on its own AudioTrack, which this thread owns and releases. */
    private fun play(queue: LinkedBlockingQueue<FloatArray>, end: FloatArray, rate: Int, id: String, my: Int) {
        var t: AudioTrack? = null
        var frames = 0L
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
            var started = false
            while (token == my) {
                val buf = queue.poll(200, TimeUnit.MILLISECONDS) ?: continue
                if (buf === end) break
                if (!started) { started = true; t.play(); emit("AtlasTtsStart", id) }
                var off = 0
                while (off < buf.size && token == my) {
                    val n = t.write(buf, off, minOf(4096, buf.size - off), AudioTrack.WRITE_BLOCKING)
                    if (n <= 0) break
                    off += n
                }
                frames += buf.size
            }
            if (token == my && started) {
                // A little silence makes sure the buffer is full enough to play out, then wait for the end.
                val tail = FloatArray(rate / 2)
                t.write(tail, 0, tail.size, AudioTrack.WRITE_NON_BLOCKING)
                var last = -1; var still = 0L
                while (token == my && t.playbackHeadPosition < frames) {
                    val h = t.playbackHeadPosition
                    if (h == last) { still += 40; if (still > 1500) break } else { still = 0; last = h }
                    Thread.sleep(40)
                }
                try { t.stop() } catch (_: Throwable) {}
            }
        } catch (_: Throwable) {
        } finally {
            if (track === t) track = null
            try { t?.release() } catch (_: Throwable) {}
        }
        emit(if (token == my) "AtlasTtsDone" else "AtlasTtsStopped", id)
    }
}
