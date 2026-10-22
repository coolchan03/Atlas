package ai.offgridmobile.atlasdevice

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Optional daily release-news checks. Triggers "possible release" notices, never confirmed showtimes. */
class AtlasMovieWatchModule(private val ctx: ReactApplicationContext): ReactContextBaseJavaModule(ctx) {
    override fun getName(): String = "AtlasMovieWatches"
    private val work by lazy { WorkManager.getInstance(ctx) }
    private val tag = "atlas-movie-watch"

    /** Reflects the app-wide Off-grid switch so existing watches never search while offline mode is enabled. */
    @ReactMethod fun setOffGrid(enabled: Boolean, promise: Promise) {
        ctx.getSharedPreferences("atlas_movie_watch", android.content.Context.MODE_PRIVATE)
            .edit().putBoolean("offGrid", enabled).apply()
        promise.resolve(true)
    }

    @ReactMethod fun watch(title: String, promise: Promise) {
        try {
            val film = title.trim().replace(Regex("\\s+"), " ")
            require(film.length in 3..100 && !film.contains('/')) { "Enter an exact movie title (3-100 characters)" }
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                promise.reject("NOTIFICATION_PERMISSION", "Enable notifications before adding movie watches")
                return
            }
            val request = PeriodicWorkRequestBuilder<AtlasMovieWatchWorker>(1, TimeUnit.DAYS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf("title" to film))
                .addTag(tag)
                .addTag("atlas-movie:$film")
                .build()
            val unique = "atlas-watch-" + film.lowercase().hashCode().toUInt().toString(16)
            work.enqueueUniquePeriodicWork(unique, ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE, request)
            promise.resolve(request.id.toString())
        } catch (e: Exception) { promise.reject("MOVIE_WATCH", e) }
    }

    @ReactMethod fun list(promise: Promise) {
        Thread {
            try {
                val active = setOf(WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED, WorkInfo.State.RUNNING)
                val jobs = work.getWorkInfosByTag(tag).get().filter { it.state in active }.take(100)
                val triggered = ctx.getSharedPreferences("atlas_movie_watch", android.content.Context.MODE_PRIVATE)
                val out = Arguments.createArray()
                for (job in jobs) {
                    out.pushMap(Arguments.createMap().apply {
                        putString("id", job.id.toString())
                        putString("title", job.tags.firstOrNull { it.startsWith("atlas-movie:") }?.removePrefix("atlas-movie:") ?: "")
                        putBoolean("possibleReleaseFound", triggered.getBoolean("triggered-" + job.id, false))
                    })
                }
                promise.resolve(out)
            } catch (e: Exception) { promise.reject("MOVIE_WATCH_LIST", e) }
        }.start()
    }

    @ReactMethod fun cancel(id: String, promise: Promise) {
        Thread {
            try {
                val key = UUID.fromString(id)
                val info = work.getWorkInfoById(key).get()
                if (info == null || !info.tags.contains(tag)) {
                    promise.reject("MOVIE_WATCH_NOT_FOUND", "No matching movie watch")
                    return@Thread
                }
                work.cancelWorkById(key).result.get()
                promise.resolve(true)
            } catch (e: Exception) { promise.reject("MOVIE_WATCH_CANCEL", e) }
        }.start()
    }
}
