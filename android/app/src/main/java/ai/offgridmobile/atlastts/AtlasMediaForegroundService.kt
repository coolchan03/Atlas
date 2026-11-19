package ai.offgridmobile.atlastts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps Atlas running while its music plays with the screen off or the app closed from the recent-apps list. The sound itself is still made
 * in JavaScript (the music player); this service only holds the process in the foreground, as Android requires for playback in the
 * background, and shows the media notification the controls module built (so the music appears in the phone's media controls).
 * Started and stopped by AtlasMediaControlsModule.keepAlive.
 */
class AtlasMediaForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android requires startForeground within seconds of startForegroundService, so a plain notification stands in when the controls
        // have not built theirs yet (it is replaced as soon as they do, under the same id).
        val notification = AtlasMediaControlsModule.currentNotification ?: fallback()
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(AtlasMediaControlsModule.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            else startForeground(AtlasMediaControlsModule.NOTIFICATION_ID, notification)
        } catch (_: Exception) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun fallback(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Music playing", NotificationManager.IMPORTANCE_LOW))
        }
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        return builder.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("Atlas music").setOngoing(true).build()
    }

    companion object { private const val CHANNEL = "atlas_music_playing" }
}
