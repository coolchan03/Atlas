package ai.offgridmobile.atlaskiwix

import android.content.Intent
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.kiwix.libkiwix.JNIKiwix
import org.kiwix.libzim.Archive
import org.kiwix.libzim.Query
import org.kiwix.libzim.Searcher
import org.kiwix.libzim.SuggestionSearcher
import java.util.concurrent.Executors

/**
 * Atlas offline library: opens Kiwix .zim files (Wikipedia, WikiMed, iFixit, Wikivoyage...)
 * picked by the user, searches them and returns article text - all on the device.
 */
class AtlasKiwixModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private class Opened(val uri: String, val pfd: ParcelFileDescriptor?, val archive: Archive, val title: String)

    private val io = Executors.newSingleThreadExecutor()
    private val open = LinkedHashMap<String, Opened>()
    @Volatile private var libsLoaded = false

    override fun getName(): String = "AtlasKiwix"

    private fun ensureLibs() {
        if (!libsLoaded) { JNIKiwix(ctx.applicationContext); libsLoaded = true }
    }

    private fun meta(a: Archive, key: String): String = try { a.getMetadata(key) } catch (_: Exception) { "" }

    private fun openUri(uriStr: String): Opened {
        open[uriStr]?.let { return it }
        ensureLibs()
        // Files downloaded inside the app are plain paths; picked files are content:// URIs.
        if (uriStr.startsWith("/") || uriStr.startsWith("file://")) {
            val path = uriStr.removePrefix("file://")
            val archive = Archive(path)
            val title = meta(archive, "Title").ifBlank { meta(archive, "Name") }.ifBlank { path.substringAfterLast('/') }
            return Opened(uriStr, null, archive, title).also { open[uriStr] = it }
        }
        val uri = Uri.parse(uriStr)
        try {
            ctx.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: Exception) { /* already persisted or not offered */ }
        val pfd = ctx.contentResolver.openFileDescriptor(uri, "r") ?: throw IllegalStateException("Cannot open file")
        val archive = Archive(pfd.fileDescriptor)
        val title = meta(archive, "Title").ifBlank { meta(archive, "Name") }.ifBlank { uri.lastPathSegment ?: "Library" }
        val o = Opened(uriStr, pfd, archive, title)
        open[uriStr] = o
        return o
    }

    private fun info(o: Opened) = Arguments.createMap().apply {
        putString("uri", o.uri)
        putString("title", o.title)
        putString("language", meta(o.archive, "Language"))
        putString("description", meta(o.archive, "Description"))
        putDouble("articles", o.archive.articleCount.toDouble())
        putDouble("bytes", o.archive.filesize.toDouble())
        putBoolean("fulltext", o.archive.hasFulltextIndex())
    }

    @ReactMethod
    fun openFile(uri: String, promise: Promise) {
        io.execute {
            try { promise.resolve(info(openUri(uri))) } catch (e: Throwable) { promise.reject("ZIM_OPEN", e.message ?: "Could not open the file", e) }
        }
    }

    @ReactMethod
    fun close(uri: String, promise: Promise) {
        io.execute {
            open.remove(uri)?.let { try { it.pfd?.close() } catch (_: Exception) {} }
            try { ctx.contentResolver.releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
            promise.resolve(true)
        }
    }

    /** Full-text search where the file has an index, title suggestions otherwise. */
    @ReactMethod
    fun search(uris: com.facebook.react.bridge.ReadableArray, query: String, limit: Int, promise: Promise) {
        io.execute {
            try {
                val out = Arguments.createArray()
                for (i in 0 until uris.size()) {
                    val uri = uris.getString(i) ?: continue
                    val o = try { openUri(uri) } catch (_: Exception) { continue }
                    try {
                        if (o.archive.hasFulltextIndex()) {
                            val searcher = Searcher(o.archive)
                            val it = searcher.search(Query(query)).getResults(0, limit)
                            while (it.hasNext()) {
                                val path = it.path
                                val title = it.title
                                val snippet = try { it.snippet } catch (_: Exception) { "" }
                                out.pushMap(Arguments.createMap().apply {
                                    putString("uri", uri); putString("library", o.title)
                                    putString("path", path); putString("title", title); putString("snippet", snippet ?: "")
                                })
                                it.next()
                            }
                        } else {
                            val it = SuggestionSearcher(o.archive).suggest(query).getResults(0, limit)
                            while (it.hasNext()) {
                                val s = it.next()
                                out.pushMap(Arguments.createMap().apply {
                                    putString("uri", uri); putString("library", o.title)
                                    putString("path", s.path); putString("title", s.title)
                                    putString("snippet", if (s.hasSnippet()) s.snippet else "")
                                })
                            }
                        }
                    } catch (_: Throwable) { /* one bad file should not stop the others */ }
                }
                promise.resolve(out)
            } catch (e: Throwable) { promise.reject("ZIM_SEARCH", e.message ?: "Search failed", e) }
        }
    }

    /** Article text (HTML stripped), cut to maxChars. */
    @ReactMethod
    fun getArticle(uri: String, path: String, maxChars: Int, promise: Promise) {
        io.execute {
            try {
                val o = openUri(uri)
                val item = o.archive.getEntryByPath(path).getItem(true)
                val bytes = item.data.data
                var html = String(bytes, Charsets.UTF_8)
                if (html.length > 600_000) html = html.substring(0, 600_000)
                html = html.replace(Regex("(?is)<(script|style|nav|footer|table class=\"infobox[^>]*)[^>]*>.*?</\\1>"), " ")
                val text = android.text.Html.fromHtml(html, android.text.Html.FROM_HTML_MODE_COMPACT).toString()
                    .replace(Regex("￼"), "")
                    .replace(Regex("[ \\t]+"), " ")
                    .replace(Regex("\\n{3,}"), "\n\n")
                    .trim()
                promise.resolve(Arguments.createMap().apply {
                    putString("title", item.title)
                    putString("text", if (text.length > maxChars) text.substring(0, maxChars) + "..." else text)
                })
            } catch (e: Throwable) { promise.reject("ZIM_ARTICLE", e.message ?: "Could not read the article", e) }
        }
    }

    override fun invalidate() {
        for (o in open.values) try { o.pfd?.close() } catch (_: Exception) {}
        open.clear()
        io.shutdown()
        super.invalidate()
    }
}
