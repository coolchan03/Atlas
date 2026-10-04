package ai.offgridmobile.atlastts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Natural-sounding offline voices (Kokoro / Piper neural models via sherpa-onnx).
 * Text is generated sentence by sentence on one thread and played on another, so speech
 * starts after the first sentence instead of after the whole answer.
 */
class NeuralTts(private val emit: (String, String) -> Unit) {
    private var tts: OfflineTts? = null
    var loadedDir: String = ""; private set
    private val genExec = Executors.newSingleThreadExecutor()
    @Volatile private var token = 0
    @Volatile private var track: AudioTrack? = null

    val ready: Boolean get() = tts != null

    /** Loads a voice folder (blocking; call off the UI thread). */
    @Synchronized
    fun load(dir: String) {
        if (dir == loadedDir && tts != null) return
        release()
        val f = File(dir)
        val onnx = f.listFiles { x -> x.name.endsWith(".onnx") }?.maxByOrNull { it.length() }
            ?: throw IllegalStateException("No voice model in $dir")
        val tokens = File(f, "tokens.txt").path
        val espeak = File(f, "espeak-ng-data").let { if (it.isDirectory) it.path else "" }
        val mc = OfflineTtsModelConfig()
        mc.numThreads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
        mc.debug = false
        mc.provider = "cpu"
        if (File(f, "voices.bin").exists()) {
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
        tts = OfflineTts(config = c)
        loadedDir = dir
    }

    fun numSpeakers(): Int = try { tts?.numSpeakers() ?: 0 } catch (_: Throwable) { 0 }

    @Synchronized
    fun release() {
        stop()
        try { tts?.release() } catch (_: Throwable) {}
        tts = null
        loadedDir = ""
    }

    fun stop() {
        token++
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
    }

    fun speak(parts: List<String>, id: String, sid: Int, speed: Float) {
        val my = ++token
        try { track?.pause(); track?.flush() } catch (_: Throwable) {}
        genExec.execute { run(parts, id, sid, speed, my) }
    }

    private fun run(parts: List<String>, id: String, sid: Int, speed: Float, my: Int) {
        val engine = tts ?: run { emit("AtlasTtsDone", id); return }
        val rate = engine.sampleRate()
        val queue = LinkedBlockingQueue<FloatArray>()
        val end = FloatArray(0)
        var frames = 0L
        val t = trackFor(rate)
        val player = Thread {
            var started = false
            try {
                while (token == my) {
                    val buf = queue.poll(200, TimeUnit.MILLISECONDS) ?: continue
                    if (buf === end) break
                    if (!started) { started = true; try { t.play() } catch (_: Throwable) {}; emit("AtlasTtsStart", id) }
                    var off = 0
                    while (off < buf.size && token == my) {
                        val n = t.write(buf, off, minOf(4096, buf.size - off), AudioTrack.WRITE_BLOCKING)
                        if (n <= 0) break
                        off += n
                    }
                }
                // let the last samples play out
                while (token == my && t.playbackHeadPosition < frames) Thread.sleep(40)
            } catch (_: Throwable) {}
            if (token == my) emit("AtlasTtsDone", id) else emit("AtlasTtsStopped", id)
        }
        player.start()
        try {
            for (p in parts) {
                if (token != my) break
                val audio = engine.generate(p, sid, speed)
                if (token != my) break
                // short pause between sentences
                val pad = FloatArray(rate / 8)
                val s = audio.samples
                frames += (s.size + pad.size).toLong()
                queue.put(s); queue.put(pad)
            }
        } catch (_: Throwable) {}
        queue.put(end)
    }

    private fun trackFor(rate: Int): AudioTrack {
        val cur = track
        if (cur != null && cur.sampleRate == rate) {
            try { cur.pause(); cur.flush() } catch (_: Throwable) {}
            // playbackHeadPosition restarts from 0 after stop(); use a fresh track to keep frame counts simple
            try { cur.release() } catch (_: Throwable) {}
        } else if (cur != null) {
            try { cur.release() } catch (_: Throwable) {}
        }
        val min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
        val t = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(maxOf(min * 2, rate * 4 / 2))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track = t
        return t
    }
}
