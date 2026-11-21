package ai.offgridmobile.atlastts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Play, pause, previous, next and stop for Read Aloud on the lock screen and in the notification shade (a media notification backed by a
 * MediaSession, so headset buttons and the lock screen reach it too). It only shows the controls and reports presses to JavaScript as
 * "AtlasMediaAction" ({ action: play | pause | next | previous | stop }); the reader itself stays in JavaScript.
 */
class AtlasMediaControlsModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private var session: MediaSession? = null
    private var registered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.getStringExtra(EXTRA_ACTION) ?: return
            emit(action)
        }
    }

    override fun getName(): String = "AtlasMediaControls"

    private fun emit(action: String) {
        try {
            val map = Arguments.createMap()
            map.putString("action", action)
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasMediaAction", map)
        } catch (_: Exception) {}
    }

    private fun press(action: String, code: Int): PendingIntent {
        val intent = Intent(ACTION).setPackage(ctx.packageName).putExtra(EXTRA_ACTION, action)
        return PendingIntent.getBroadcast(ctx, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun button(icon: Int, label: String, action: String, code: Int): Notification.Action =
        Notification.Action.Builder(Icon.createWithResource(ctx, icon), label, press(action, code)).build()

    /** Shows (or updates) the controls: what is being read, and whether it is playing. */
    @ReactMethod
    fun show(title: String, text: String, playing: Boolean) {
        try {
            if (!registered) {
                ContextCompat.registerReceiver(ctx, receiver, IntentFilter(ACTION), ContextCompat.RECEIVER_NOT_EXPORTED)
                registered = true
            }
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL, "Read aloud controls", NotificationManager.IMPORTANCE_LOW))
            }
            val s = session ?: MediaSession(ctx, "AtlasReadAloud").also { made ->
                made.setCallback(object : MediaSession.Callback() {
                    override fun onPlay() { emit("play") }
                    override fun onPause() { emit("pause") }
                    override fun onSkipToNext() { emit("next") }
                    override fun onSkipToPrevious() { emit("previous") }
                    override fun onStop() { emit("stop") }
                })
                session = made
            }
            s.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).putString(MediaMetadata.METADATA_KEY_ARTIST, text).build())
            s.setPlaybackState(
                PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP)
                    .setState(if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                    .build(),
            )
            s.isActive = true
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(ctx)
            val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            val notification = builder
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(text)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setOngoing(playing)
                .addAction(button(android.R.drawable.ic_media_previous, "Previous", "previous", 1))
                .addAction(if (playing) button(android.R.drawable.ic_media_pause, "Pause", "pause", 2) else button(android.R.drawable.ic_media_play, "Play", "play", 3))
                .addAction(button(android.R.drawable.ic_media_next, "Next", "next", 4))
                .setStyle(Notification.MediaStyle().setMediaSession(s.sessionToken).setShowActionsInCompactView(0, 1, 2))
                .apply { if (open != null) setContentIntent(PendingIntent.getActivity(ctx, 5, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)) }
                .build()
            currentNotification = notification
            nm.notify(NOTIFICATION_ID, notification)
        } catch (_: Exception) {
            // No notification permission, or the phone refused: reading goes on without the lock-screen controls.
        }
    }

    /**
     * Holds Atlas in the foreground while music plays (true) so it keeps playing with the screen off or the app closed from the recent
     * apps; false lets go. Needs the media notification from show() and the notification permission; without them it does nothing.
     */
    @ReactMethod
    fun keepAlive(on: Boolean) {
        try {
            val intent = Intent(ctx, AtlasMediaForegroundService::class.java)
            if (on) ContextCompat.startForegroundService(ctx, intent) else ctx.stopService(intent)
        } catch (_: Exception) {
            // Android refused a foreground start (the app was not in a state that allows it): music keeps to its old behaviour.
        }
    }

    /** Takes the controls away (reading ended or was stopped). */
    @ReactMethod
    fun hide() {
        try { ctx.stopService(Intent(ctx, AtlasMediaForegroundService::class.java)) } catch (_: Exception) {}
        currentNotification = null
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID) } catch (_: Exception) {}
        try { session?.isActive = false; session?.release() } catch (_: Exception) {}
        session = null
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        hide()
        try { if (registered) ctx.unregisterReceiver(receiver) } catch (_: Exception) {}
        registered = false
        super.invalidate()
    }

    companion object {
        private const val ACTION = "ai.offgridmobile.atlas.READ_ALOUD_ACTION"
        private const val EXTRA_ACTION = "action"
        private const val CHANNEL = "atlas_read_aloud_controls"
        const val NOTIFICATION_ID = 7421
        /** The media notification last built, so the foreground service can show the same one. */
        @Volatile var currentNotification: Notification? = null
    }
}
