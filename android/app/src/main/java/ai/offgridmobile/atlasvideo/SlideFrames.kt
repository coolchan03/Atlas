package ai.offgridmobile.atlasvideo

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint

/** One slide of the video: a title, up to five bullets, and the narration audio file. */
data class SlideSpec(val title: String, val bullets: List<String>, val wavPath: String)

/** Draws a slide into a bitmap and converts it to planar YUV 4:2:0 for the video encoder. */
object SlideFrames {
    const val WIDTH = 1280
    const val HEIGHT = 720

    fun render(slide: SlideSpec, index: Int, total: Int): Bitmap {
        val bmp = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.parseColor("#0F172A"))
        val pad = 72
        val textWidth = WIDTH - pad * 2
        var scale = 1.0f
        var titleLayout: StaticLayout
        var bulletLayouts: List<StaticLayout>
        while (true) {
            val tp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = 56f * scale; typeface = Typeface.DEFAULT }
            titleLayout = layout(slide.title, tp, textWidth)
            val bp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#CBD5E1"); textSize = 36f * scale; typeface = Typeface.DEFAULT }
            bulletLayouts = slide.bullets.take(5).map { layout("•  $it", bp, textWidth) }
            val gap = (22 * scale).toInt()
            val height = titleLayout.height + 36 + bulletLayouts.sumOf { it.height + gap }
            if (height <= HEIGHT - pad * 2 - 40 || scale <= 0.5f) break
            scale -= 0.05f
        }
        var y = pad.toFloat()
        c.save(); c.translate(pad.toFloat(), y); titleLayout.draw(c); c.restore()
        y += titleLayout.height + 36
        for (l in bulletLayouts) {
            c.save(); c.translate(pad.toFloat(), y); l.draw(c); c.restore()
            y += l.height + (22 * scale)
        }
        // Slim progress bar and slide counter along the bottom.
        val bar = Paint().apply { color = Color.parseColor("#1E293B") }
        c.drawRect(0f, HEIGHT - 10f, WIDTH.toFloat(), HEIGHT.toFloat(), bar)
        val fill = Paint().apply { color = Color.parseColor("#10B981") }
        c.drawRect(0f, HEIGHT - 10f, WIDTH.toFloat() * (index + 1) / total, HEIGHT.toFloat(), fill)
        val meta = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#64748B"); textSize = 24f }
        c.drawText("${index + 1} / $total", (WIDTH - pad - 80).toFloat(), HEIGHT - 30f, meta)
        return bmp
    }

    private fun layout(text: String, p: TextPaint, width: Int): StaticLayout =
        StaticLayout.Builder.obtain(text, 0, text.length, p, width).setAlignment(Layout.Alignment.ALIGN_NORMAL).setLineSpacing(0f, 1.1f).build()

    /** Planar YUV 4:2:0 (BT.601, limited range) of the bitmap: Y then U then V. */
    class Yuv(val y: ByteArray, val u: ByteArray, val v: ByteArray)

    fun toYuv(bmp: Bitmap): Yuv {
        val w = bmp.width; val h = bmp.height
        val px = IntArray(w * h)
        bmp.getPixels(px, 0, w, 0, 0, w, h)
        val y = ByteArray(w * h)
        val u = ByteArray(w * h / 4)
        val v = ByteArray(w * h / 4)
        for (j in 0 until h) {
            for (i in 0 until w) {
                val p = px[j * w + i]
                val r = (p shr 16) and 0xFF; val g = (p shr 8) and 0xFF; val b = p and 0xFF
                y[j * w + i] = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).coerceIn(16, 235).toByte()
            }
        }
        for (j in 0 until h / 2) {
            for (i in 0 until w / 2) {
                var rs = 0; var gs = 0; var bs = 0
                for (dj in 0..1) for (di in 0..1) {
                    val p = px[(2 * j + dj) * w + 2 * i + di]
                    rs += (p shr 16) and 0xFF; gs += (p shr 8) and 0xFF; bs += p and 0xFF
                }
                val r = rs / 4; val g = gs / 4; val b = bs / 4
                u[j * (w / 2) + i] = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).coerceIn(16, 240).toByte()
                v[j * (w / 2) + i] = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).coerceIn(16, 240).toByte()
            }
        }
        return Yuv(y, u, v)
    }
}
