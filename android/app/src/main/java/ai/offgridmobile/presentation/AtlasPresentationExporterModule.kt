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
