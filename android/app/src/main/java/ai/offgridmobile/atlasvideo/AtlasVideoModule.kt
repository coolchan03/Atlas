package ai.offgridmobile.atlasvideo

import android.content.ContentValues
import android.content.Intent
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import java.io.File
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean

/**
 * "Save as video": turns narrated slides into an MP4 on the phone, offline.
 * Each slide is drawn to a bitmap and encoded as H.264; the narration WAV files are
 * resampled to 44.1 kHz mono, encoded as AAC and muxed in. Saved to Movies/Atlas.
 * Emits "AtlasVideoProgress" { fraction, stage }.
 */
class AtlasVideoModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private class Sample(val data: ByteArray, val ptsUs: Long, val flags: Int)
    private class Cancelled : RuntimeException("Stopped")

    private val busy = AtomicBoolean(false)
    @Volatile private var cancelFlag = false
    private var lastPct = -1

    override fun getName(): String = "AtlasVideo"

    private fun progress(fraction: Double, stage: String) {
        val pct = (fraction * 100).toInt()
        if (pct == lastPct) return
        lastPct = pct
        try {
            val m = Arguments.createMap()
            m.putDouble("fraction", fraction.coerceIn(0.0, 1.0))
            m.putString("stage", stage)
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasVideoProgress", m)
        } catch (_: Exception) {}
    }

    private fun check() { if (cancelFlag) throw Cancelled() }

    @ReactMethod
    fun cancel(promise: Promise) { cancelFlag = true; promise.resolve(true) }

    /** slidesJson: [{title, bullets: [..], wav: "/path/narration.wav"}]. Resolves { uri, name }. */
    @ReactMethod
    fun exportSlides(slidesJson: String, fileName: String, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("UNSUPPORTED", "Saving videos needs Android 10 or newer."); return
        }
        if (!busy.compareAndSet(false, true)) { promise.reject("BUSY", "A video is already being saved."); return }
        cancelFlag = false
        lastPct = -1
        Thread {
            var uri: Uri? = null
            try {
                val arr = JSONArray(slidesJson)
                val slides = (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    val b = o.optJSONArray("bullets") ?: JSONArray()
                    SlideSpec(o.optString("title"), (0 until b.length()).map { b.getString(it) }, o.getString("wav"))
                }
                if (slides.isEmpty()) throw IllegalArgumentException("No slides")
                val safe = fileName.replace(Regex("[^A-Za-z0-9 _-]"), "_").trim().take(60).ifBlank { "Atlas video" }
                val values = ContentValues().apply {
                    put(MediaStore.Video.Media.DISPLAY_NAME, "$safe.mp4")
                    put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                    put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Atlas")
                    put(MediaStore.Video.Media.IS_PENDING, 1)
                }
                val resolver = ctx.contentResolver
                val created: Uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("The gallery refused the new file")
                uri = created
                resolver.openFileDescriptor(created, "rw")!!.use { pfd ->
                    encode(slides, MediaMuxer(pfd.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4))
                }
                resolver.update(created, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
                progress(1.0, "done")
                val res = Arguments.createMap()
                res.putString("uri", created.toString())
                res.putString("name", "$safe.mp4")
                promise.resolve(res)
            } catch (c: Cancelled) {
                uri?.let { try { ctx.contentResolver.delete(it, null, null) } catch (_: Exception) {} }
                promise.reject("CANCELLED", "Stopped")
            } catch (e: Throwable) {
                uri?.let { try { ctx.contentResolver.delete(it, null, null) } catch (_: Exception) {} }
                promise.reject("VIDEO_ERROR", e.message ?: e.toString())
            } finally {
                busy.set(false)
            }
        }.start()
    }

    // ------------------------------------------------------------------ audio input

    /** Mono 16-bit samples and their sample rate from a PCM WAV file. */
    private fun readWav(path: String): Pair<ShortArray, Int> {
        val bytes = File(path).readBytes()
        val bb = java.nio.ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        if (bytes.size < 44 || String(bytes, 0, 4) != "RIFF") throw IllegalStateException("Not a WAV file")
        var pos = 12
        var rate = 22050; var channels = 1; var bits = 16
        var dataStart = -1; var dataLen = 0
        while (pos + 8 <= bytes.size) {
            val id = String(bytes, pos, 4)
            val len = bb.getInt(pos + 4)
            if (id == "fmt ") {
                channels = bb.getShort(pos + 10).toInt().coerceAtLeast(1)
                rate = bb.getInt(pos + 12)
                bits = bb.getShort(pos + 22).toInt()
            } else if (id == "data") {
                dataStart = pos + 8
                val remaining = bytes.size - dataStart
                dataLen = if (len <= 0 || len > remaining) remaining else len
                break
            }
            if (len < 0) break
            pos += 8 + len + (len and 1)
        }
        if (dataStart < 0 || bits != 16) throw IllegalStateException("Unsupported audio format")
        val frames = dataLen / (2 * channels)
        val out = ShortArray(frames)
        for (i in 0 until frames) {
            var sum = 0
            for (ch in 0 until channels) sum += bb.getShort(dataStart + (i * channels + ch) * 2).toInt()
            out[i] = (sum / channels).toShort()
        }
        return Pair(out, rate)
    }

    private fun resample(src: ShortArray, from: Int, to: Int): ShortArray {
        if (from == to || src.isEmpty()) return src
        val n = (src.size.toLong() * to / from).toInt()
        val out = ShortArray(n)
        val step = from.toDouble() / to
        for (i in 0 until n) {
            val p = i * step
            val i0 = p.toInt().coerceAtMost(src.size - 1)
            val i1 = (i0 + 1).coerceAtMost(src.size - 1)
            val f = p - i0
            out[i] = (src[i0] * (1 - f) + src[i1] * f).toInt().toShort()
        }
        return out
    }

    // ------------------------------------------------------------------ encoding

    private fun encode(slides: List<SlideSpec>, muxer: MediaMuxer) {
        var started = false
        var vCodec: MediaCodec? = null
        var aCodec: MediaCodec? = null
        try {
            // Pass 1: how long is each slide? Narration plus a short pause, at least 3 seconds.
            val slideSamples = slides.map { s ->
                check()
                val (pcm, rate) = readWav(s.wavPath)
                val narration = (pcm.size.toLong() * AUDIO_RATE / rate).toInt()
                maxOf(narration + AUDIO_RATE * 8 / 10, AUDIO_RATE * 3)
            }
            val totalSamples = slideSamples.sumOf { it.toLong() }.toDouble()

            // Audio: AAC, kept in memory (small) until the muxer starts.
            val audioFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, AUDIO_RATE, 1).apply {
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                setInteger(MediaFormat.KEY_BIT_RATE, 64000)
                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
            }
            val ac = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
            aCodec = ac
            ac.configure(audioFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            ac.start()
            val aInfo = MediaCodec.BufferInfo()
            val audio = ArrayList<Sample>()
            var aOutFormat: MediaFormat? = null
            fun drainAudio(untilEos: Boolean) {
                var idle = 0
                while (true) {
                    val idx = ac.dequeueOutputBuffer(aInfo, if (untilEos) 10000 else 0)
                    if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) {
                        if (!untilEos) return
                        if (++idle > 500) throw IllegalStateException("The audio encoder stopped responding")
                    } else if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        aOutFormat = ac.outputFormat
                    } else if (idx >= 0) {
                        idle = 0
                        val buf = ac.getOutputBuffer(idx)!!
                        if (aInfo.size > 0 && (aInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                            val data = ByteArray(aInfo.size)
                            buf.position(aInfo.offset); buf.limit(aInfo.offset + aInfo.size); buf.get(data)
                            audio.add(Sample(data, aInfo.presentationTimeUs, aInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME))
                        }
                        ac.releaseOutputBuffer(idx, false)
                        if ((aInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
                    }
                }
            }
            var fed = 0L
            for ((si, s) in slides.withIndex()) {
                check()
                val (pcm, rate) = readWav(s.wavPath)
                val mono = resample(pcm, rate, AUDIO_RATE)
                val slide = ShortArray(slideSamples[si])
                System.arraycopy(mono, 0, slide, 0, minOf(mono.size, slide.size))
                var off = 0
                while (off < slide.size) {
                    check()
                    val n = minOf(4096, slide.size - off)
                    val idx = ac.dequeueInputBuffer(10000)
                    if (idx < 0) { drainAudio(false); continue }
                    val buf = ac.getInputBuffer(idx)!!
                    buf.clear()
                    buf.order(ByteOrder.LITTLE_ENDIAN)
                    buf.asShortBuffer().put(slide, off, n)
                    ac.queueInputBuffer(idx, 0, n * 2, fed * 1_000_000L / AUDIO_RATE, 0)
                    fed += n; off += n
                    drainAudio(false)
                }
                progress(0.3 * (si + 1) / slides.size, "audio")
            }
            while (true) {
                check()
                val idx = ac.dequeueInputBuffer(10000)
                if (idx < 0) { drainAudio(false); continue }
                ac.queueInputBuffer(idx, 0, 0, fed * 1_000_000L / AUDIO_RATE, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                break
            }
            drainAudio(true)
            val audioOut = aOutFormat ?: throw IllegalStateException("No audio was produced")
            try { ac.stop() } catch (_: Exception) {}
            ac.release(); aCodec = null

            // Video: H.264, one slide image repeated at FPS frames per second.
            val w = SlideFrames.WIDTH; val h = SlideFrames.HEIGHT
            val vFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
                setInteger(MediaFormat.KEY_BIT_RATE, 1_500_000)
                setInteger(MediaFormat.KEY_FRAME_RATE, FPS)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            }
            val vc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            vCodec = vc
            vc.configure(vFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            vc.start()
            val vInfo = MediaCodec.BufferInfo()
            var vTrack = -1; var aTrack = -1
            var ai = 0
            fun flushAudio(upToUs: Long) {
                val ai0 = aTrack
                while (ai < audio.size && audio[ai].ptsUs <= upToUs) {
                    val sm = audio[ai++]
                    val info = MediaCodec.BufferInfo()
                    info.set(0, sm.data.size, sm.ptsUs, sm.flags)
                    muxer.writeSampleData(ai0, java.nio.ByteBuffer.wrap(sm.data), info)
                }
            }
            fun drainVideo(untilEos: Boolean) {
                var idle = 0
                while (true) {
                    val idx = vc.dequeueOutputBuffer(vInfo, if (untilEos) 10000 else 0)
                    if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) {
                        if (!untilEos) return
                        if (++idle > 1000) throw IllegalStateException("The video encoder stopped responding")
                    } else if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        vTrack = muxer.addTrack(vc.outputFormat)
                        aTrack = muxer.addTrack(audioOut)
                        muxer.start(); started = true
                    } else if (idx >= 0) {
                        idle = 0
                        val buf = vc.getOutputBuffer(idx)!!
                        if (vInfo.size > 0 && (vInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0 && started) {
                            flushAudio(vInfo.presentationTimeUs)
                            buf.position(vInfo.offset); buf.limit(vInfo.offset + vInfo.size)
                            muxer.writeSampleData(vTrack, buf, vInfo)
                        }
                        vc.releaseOutputBuffer(idx, false)
                        if ((vInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
                    }
                }
            }

            var doneSamples = 0L
            for ((si, s) in slides.withIndex()) {
                check()
                val bmp = SlideFrames.render(s, si, slides.size)
                val yuv = SlideFrames.toYuv(bmp)
                bmp.recycle()
                val startUs = doneSamples * 1_000_000L / AUDIO_RATE
                val frames = maxOf(1, Math.round(slideSamples[si].toDouble() / AUDIO_RATE * FPS).toInt())
                for (f in 0 until frames) {
                    check()
                    var idx = vc.dequeueInputBuffer(10000)
                    while (idx < 0) { check(); drainVideo(false); idx = vc.dequeueInputBuffer(10000) }
                    val img = vc.getInputImage(idx) ?: throw IllegalStateException("The video encoder gave no input image")
                    putPlane(img.planes[0], yuv.y, w, h)
                    putPlane(img.planes[1], yuv.u, w / 2, h / 2)
                    putPlane(img.planes[2], yuv.v, w / 2, h / 2)
                    vc.queueInputBuffer(idx, 0, w * h * 3 / 2, startUs + f * 1_000_000L / FPS, 0)
                    drainVideo(false)
                }
                doneSamples += slideSamples[si]
                progress(0.3 + 0.7 * doneSamples / totalSamples, "video")
            }
            var eosIdx = vc.dequeueInputBuffer(10000)
            while (eosIdx < 0) { check(); drainVideo(false); eosIdx = vc.dequeueInputBuffer(10000) }
            vc.queueInputBuffer(eosIdx, 0, 0, doneSamples * 1_000_000L / AUDIO_RATE, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            drainVideo(true)
            if (!started) throw IllegalStateException("No video was produced")
            flushAudio(Long.MAX_VALUE)
        } finally {
            try { vCodec?.stop() } catch (_: Exception) {}
            try { vCodec?.release() } catch (_: Exception) {}
            try { aCodec?.stop() } catch (_: Exception) {}
            try { aCodec?.release() } catch (_: Exception) {}
            if (started) { try { muxer.stop() } catch (_: Exception) {} }
            try { muxer.release() } catch (_: Exception) {}
        }
    }

    /** Copies a planar image into a codec input plane, honouring its row and pixel strides. */
    private fun putPlane(plane: Image.Plane, src: ByteArray, w: Int, h: Int) {
        val buf = plane.buffer
        val rs = plane.rowStride
        val ps = plane.pixelStride
        if (ps == 1) {
            for (r in 0 until h) { buf.position(r * rs); buf.put(src, r * w, w) }
        } else {
            for (r in 0 until h) for (c in 0 until w) buf.put(r * rs + c * ps, src[r * w + c])
        }
    }

    // ------------------------------------------------------------------ share / open

    @ReactMethod
    fun share(uri: String, promise: Promise) {
        try {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "video/mp4"
                putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(send, "Share video").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("SHARE_ERROR", e.message ?: e.toString()) }
    }

    @ReactMethod
    fun open(uri: String, promise: Promise) {
        try {
            val view = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(uri), "video/mp4")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(view)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("OPEN_ERROR", e.message ?: e.toString()) }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        private const val AUDIO_RATE = 44100
        private const val FPS = 5
    }
}
