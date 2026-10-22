package ai.offgridmobile.atlasdevice

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Locale

/** Best-effort, key-free movie-news watch. Never asserts that theater tickets exist. */
class AtlasMovieWatchWorker(ctx: Context, params: WorkerParameters): Worker(ctx, params) {
    private val prefs = applicationContext.getSharedPreferences("atlas_movie_watch", Context.MODE_PRIVATE)
    private data class Story(val headline: String, val description: String, val published: Long)
    private val releasePhrases = listOf("now in theaters", "in theaters now", "hits theaters today",
        "opens in theaters today", "now playing in theaters", "now in cinemas", "in cinemas now")
    private val blockedPhrases = listOf("coming soon", "next year", "rumor", "rumour",
        "will be in theaters", "expected to open", "not in theaters yet")

    override fun doWork(): Result {
        val title = inputData.getString("title")?.trim() ?: return Result.failure()
        if (title.length !in 3..100) return Result.failure()
        if (prefs.getBoolean("offGrid", false)) return Result.success()
        if (prefs.getBoolean("triggered-$id", false)) return Result.success()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return Result.success()
        }
        return try {
            val google = rss("https://news.google.com/rss/search?q=" +
                URLEncoder.encode("\"$title\" now in theaters", "UTF-8") + "&hl=en-US&gl=US&ceid=US:en")
            val bing = rss("https://www.bing.com/news/search?q=" +
                URLEncoder.encode("\"$title\" in theaters", "UTF-8") + "&format=rss")
            val matches = (google + bing).filter { qualifies(title, it) }
                .distinctBy { it.headline.lowercase().substringBefore(" - ").trim() }
            if (matches.size >= 2) {
                notifyPossibleRelease(title)
                prefs.edit().putBoolean("triggered-$id", true).apply()
            }
            Result.success()
        } catch (_: Exception) {
            // Transient network / publisher failures retry on the next periodic check.
            Result.success()
        }
    }

    private fun qualifies(film: String, story: Story): Boolean {
        val text = (story.headline + " " + story.description).lowercase(Locale.ROOT)
        val title = film.lowercase(Locale.ROOT)
        if (!text.contains(title) || blockedPhrases.any { text.contains(it) }) return false
        if (!releasePhrases.any { text.contains(it) }) return false
        return story.published > System.currentTimeMillis() - 8L * 86400000L &&
            story.published <= System.currentTimeMillis() + 86400000L
    }

    private fun rss(url: String): List<Story> {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("User-Agent", "AtlasMovieWatch/1.0")
        try {
            if (conn.responseCode !in 200..299) return emptyList()
            val parser = XmlPullParserFactory.newInstance().newPullParser()
            val result = mutableListOf<Story>()
            conn.inputStream.use { stream ->
                parser.setInput(stream, "UTF-8")
                var inItem = false
                var headline = ""
                var desc = ""
                var published = 0L
                var event = parser.eventType
                while (event != XmlPullParser.END_DOCUMENT && result.size < 60) {
                    if (event == XmlPullParser.START_TAG) {
                        when (parser.name) {
                            "item" -> { inItem = true; headline = ""; desc = ""; published = 0 }
                            "title" -> if (inItem) headline = parser.nextText().take(350)
                            "description" -> if (inItem) desc = parser.nextText().take(1200)
                            "pubDate" -> if (inItem) published = try {
                                SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US).parse(parser.nextText())?.time ?: 0L
                            } catch (_: Exception) { 0L }
                        }
                    } else if (event == XmlPullParser.END_TAG && parser.name == "item" && inItem) {
                        if (headline.isNotEmpty()) result.add(Story(headline, desc, published))
                        inItem = false
                    }
                    event = parser.next()
                }
            }
            return result
        } finally { conn.disconnect() }
    }

    private fun notifyPossibleRelease(title: String) {
        val ctx = applicationContext
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(
            "atlas_movie_watch", "Movie release news", NotificationManager.IMPORTANCE_DEFAULT))
        val query = URLEncoder.encode("$title movie showtimes theaters", "UTF-8")
        val view = Intent(Intent.ACTION_VIEW,
            Uri.parse("https://www.google.com/search?q=$query")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val pending = PendingIntent.getActivity(ctx, id.hashCode(), view,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        NotificationManagerCompat.from(ctx).notify(id.hashCode(),
            NotificationCompat.Builder(ctx, "atlas_movie_watch")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Possible theater release: $title")
                .setContentText("Recent news suggests a release. Check actual showtimes before going.")
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .build())
    }
}
