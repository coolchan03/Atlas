package ai.offgridmobile.presentation

import android.content.ContentValues
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileOutputStream

/** Offline exporter: genuine 16:9 PDF pages and PPTX files in Downloads/Atlas. */
class AtlasPresentationExporterModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "AtlasPresentationExporter"
  private fun safeName(value: String): String {
    val name = value.replace(Regex("[^a-zA-Z0-9 ._()-]"), "_").take(90).trim()
    require(name.isNotEmpty() && name != "." && name != "..") { "Invalid file name" }
    return name
  }

  private fun publish(source: File, filename: String, mime: String): String {
    require(source.isFile && source.length() > 0) { "Export file is empty" }
    val name = safeName(filename)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = context.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, name)
        put(MediaStore.Downloads.MIME_TYPE, mime)
        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Atlas")
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Cannot open Downloads")
      try {
        resolver.openOutputStream(uri)?.use { target ->
          source.inputStream().use { it.copyTo(target) }
        } ?: throw IllegalStateException("Cannot write export")
        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        return uri.toString()
      } catch (e: Exception) {
        resolver.delete(uri, null, null)
        throw e
      }
    }
    val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "Atlas")
    dir.mkdirs()
    val destination = File(dir, name)
    source.copyTo(destination, overwrite = true)
    return Uri.fromFile(destination).toString()
  }

  @ReactMethod fun publishFile(path: String, filename: String, mime: String, promise: Promise) {
    Thread {
      try {
        require(mime == "application/vnd.openxmlformats-officedocument.presentationml.presentation") { "Unsupported export type" }
        val file = File(path)
        require(file.canonicalPath.startsWith(context.cacheDir.canonicalPath + File.separator)) { "Invalid export path" }
        promise.resolve(publish(file, filename, mime))
      } catch (e: Exception) { promise.reject("PRESENTATION_SAVE", e.message, e) }
    }.start()
  }

  private fun color(map: ReadableMap, name: String, fallback: String): Int {
    val raw = (if (map.hasKey(name) && !map.isNull(name)) map.getString(name) else null) ?: fallback
    return try { Color.parseColor("#" + raw.trimStart('#')) } catch (_: Exception) { Color.parseColor("#" + fallback) }
  }
  private fun write(
    canvas: Canvas, text: String, x: Float, start: Float, width: Float, size: Float, tint: Int,
    bold: Boolean, maxLines: Int, font: String
  ): Float {
    val brush = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = tint
      textSize = size
      typeface = Typeface.create(if (font == "Georgia") "serif" else "sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
    }
    var y = start
    var lines = 0
    for (paragraph in text.replace("\r", "").split("\n")) {
      var line = ""
      for (word in paragraph.split(Regex("\\s+"))) {
        if (word.isBlank()) continue
        val candidate = if (line.isEmpty()) word else "$line $word"
        if (line.isNotEmpty() && brush.measureText(candidate) > width) {
          canvas.drawText(line, x, y, brush)
          y += size * 1.34f
          lines++
          if (lines >= maxLines) return y
          line = word
        } else line = candidate
      }
      if (line.isNotBlank()) {
        canvas.drawText(line.take(240), x, y, brush)
        y += size * 1.34f
        lines++
        if (lines >= maxLines) return y
      }
    }
    return y
  }

  private fun draw(canvas: Canvas, slide: ReadableMap, style: ReadableMap, number: Int) {
    val fg = color(style, "foreground", "111827")
    val alt = color(style, "secondary", "64748B")
    val accent = color(style, "accent", "2563EB")
    val panel = color(style, "panel", "F1F5F9")
    val font = style.getString("font") ?: "Aptos"
    val title = (slide.getString("title") ?: "").take(140)
    val subtitle = (slide.getString("subtitle") ?: "").take(260)
    canvas.drawColor(color(style, "background", "FFFFFF"))
    val brush = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent }
    when (slide.getString("layout")) {
      "title" -> {
        canvas.drawRoundRect(54f, 92f, 905f, 105f, 3f, 3f, brush)
        write(canvas, title, 59f, 208f, 840f, 49f, fg, true, 3, font)
        write(canvas, subtitle, 60f, 314f, 820f, 26f, alt, false, 4, font)
      }
      "closing" -> {
        canvas.drawRoundRect(59f, 148f, 806f, 165f, 4f, 4f, brush)
        write(canvas, title, 64f, 265f, 840f, 49f, fg, true, 3, font)
        write(canvas, subtitle, 65f, 362f, 820f, 26f, alt, false, 4, font)
      }
      "section" -> {
        canvas.drawRoundRect(70f, 125f, 82f, 420f, 3f, 3f, brush)
        write(canvas, title, 108f, 210f, 780f, 46f, fg, true, 3, font)
        write(canvas, subtitle, 109f, 316f, 740f, 22f, alt, false, 4, font)
      }
      "quote" -> {
        brush.color = panel
        canvas.drawRoundRect(66f, 150f, 894f, 398f, 15f, 15f, brush)
        brush.color = accent
        canvas.drawRoundRect(66f, 150f, 77f, 398f, 3f, 3f, brush)
        write(canvas, title, 83f, 96f, 800f, 34f, fg, true, 2, font)
        val quote = slide.getArray("bullets")?.let { if (it.size() > 0) it.getString(0) else null } ?: "Add a quotation"
        write(canvas, quote, 103f, 234f, 770f, 31f, fg, false, 5, font)
        write(canvas, subtitle, 104f, 460f, 770f, 21f, alt, false, 2, font)
      }
      "two_column" -> {
        write(canvas, title, 78f, 91f, 810f, 34f, fg, true, 2, font)
        if (subtitle.isNotBlank()) write(canvas, subtitle, 78f, 137f, 810f, 19f, alt, false, 2, font)
        val items = slide.getArray("bullets")
        for (col in 0..1) {
          val x = if (col == 0) 63f else 485f
          brush.color = panel
          canvas.drawRoundRect(x, 179f, x + 411f, 481f, 12f, 12f, brush)
          var y = 217f
          for (i in col until minOf(items?.size() ?: 0, 8) step 2) {
            y = write(canvas, items?.getString(i) ?: "", x + 20f, y, 370f, 21f, fg, false, 3, font) + 12f
          }
        }
      }
      "timeline" -> {
        write(canvas, title, 75f, 91f, 815f, 34f, fg, true, 2, font)
        if (subtitle.isNotBlank()) write(canvas, subtitle, 78f, 139f, 790f, 19f, alt, false, 2, font)
        val items = slide.getArray("bullets")
        for (i in 0 until minOf(items?.size() ?: 0, 5)) {
          val y = 190f + i * 63f
          brush.color = accent
          canvas.drawRoundRect(79f, y, 123f, y + 43f, 5f, 5f, brush)
          write(canvas, (i + 1).toString(), 91f, y + 29f, 30f, 20f, android.graphics.Color.WHITE, true, 1, font)
          write(canvas, items?.getString(i) ?: "", 152f, y + 28f, 735f, 22f, fg, false, 2, font)
        }
      }
      "infographic", "emoji" -> {
        write(canvas, title, 73f, 88f, 810f, 34f, fg, true, 2, font)
        if (subtitle.isNotBlank()) write(canvas, subtitle, 76f, 140f, 780f, 19f, alt, false, 2, font)
        val items = slide.getArray("bullets")
        for (i in 0 until minOf(items?.size() ?: 0, 4)) {
          val x = 60f + i * 222f
          brush.color = panel
          canvas.drawRoundRect(x, 211f, x + 209f, 426f, 12f, 12f, brush)
          val parts = (items?.getString(i) ?: "").split("|", limit = 2)
          write(canvas, parts[0].trim(), x + 13f, 286f, 185f,
            if (slide.getString("layout") == "emoji") 42f else 38f, accent, true, 2, font)
          write(canvas, (parts.getOrNull(1) ?: parts[0]).trim(), x + 14f, 360f, 185f, 20f, fg, false, 3, font)
        }
      }
      else -> {
        canvas.drawRoundRect(55f, 41f, 67f, 107f, 4f, 4f, brush)
        write(canvas, title, 79f, 89f, 800f, 34f, fg, true, 2, font)
        if (subtitle.isNotBlank()) write(canvas, subtitle, 79f, 137f, 820f, 19f, alt, false, 2, font)
        brush.color = panel
        canvas.drawRoundRect(61f, 170f, 899f, 485f, 17f, 17f, brush)
        val items = slide.getArray("bullets")
        var y = 209f
        if (items == null || items.size() == 0) {
          write(canvas, "Add your main points", 86f, y, 750f, 23f, fg, false, 2, font)
        } else {
          for (i in 0 until minOf(items.size(), 9)) {
            if (y > 460f) break
            y = write(canvas, "?  " + (items.getString(i) ?: "").take(260), 86f, y, 758f, 22f, fg, false, 2, font) + 9f
          }
        }
      }
    }
    write(canvas, number.toString(), 909f, 523f, 40f, 12f, alt, false, 1, font)
  }

  @ReactMethod fun exportPdf(slides: ReadableArray, style: ReadableMap, filename: String, promise: Promise) {
    Thread {
      val pdf = PdfDocument()
      var output: File? = null
      try {
        require(slides.size() in 1..40) { "Add 1-40 slides" }
        val file = File.createTempFile("atlas-presentation-", ".pdf", context.cacheDir)
        output = file
        for (i in 0 until slides.size()) {
          val slide = slides.getMap(i) ?: throw IllegalArgumentException("Invalid slide")
          val page = pdf.startPage(PdfDocument.PageInfo.Builder(960, 540, i + 1).create())
          draw(page.canvas, slide, style, i + 1)
          pdf.finishPage(page)
        }
        FileOutputStream(file).use { pdf.writeTo(it) }
        pdf.close()
        promise.resolve(publish(file, filename, "application/pdf"))
      } catch (e: Exception) {
        try { pdf.close() } catch (_: Exception) {}
        promise.reject("PRESENTATION_PDF", e.message, e)
      } finally { output?.delete() }
    }.start()
  }

  @ReactMethod fun shareUri(value: String, mime: String, promise: Promise) {
    try {
      val uri = Uri.parse(value)
      require(uri.scheme == "content") { "Sharing requires a Downloads file on Android 10 or later" }
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = mime
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(intent, "Share presentation").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.startActivity(chooser)
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("PRESENTATION_SHARE", e.message, e) }
  }
}
