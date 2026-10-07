package ai.offgridmobile.atlasdevice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import ai.offgridmobile.MainActivity
import ai.offgridmobile.R

/**
 * Keeps local AI inference alive when the app is backgrounded or the display turns off.
 * The service owns a partial CPU wake lock only while explicit AI work is active.
 */
class AtlasAiWorkService : Service() {
    companion object {
        const val ACTION_START = "ai.offgridmobile.atlas.AI_WORK_START"
        const val ACTION_STOP = "ai.offgridmobile.atlas.AI_WORK_STOP"
        const val EXTRA_LABEL = "label"
        private const val CHANNEL_ID = "atlas_ai_work"
        private const val NOTIFICATION_ID = 8042
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopAiWork()
            return START_NOT_STICKY
        }

        val label = intent?.getStringExtra(EXTRA_LABEL)?.takeIf { it.isNotBlank() }
            ?: "Local AI response in progress"
        val notification = buildNotification(label)

        if (Build.VERSION.SDK_INT >= 34) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        acquireCpuWakeLock()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        releaseCpuWakeLock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopAiWork() {
        releaseCpuWakeLock()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun acquireCpuWakeLock() {
        if (wakeLock?.isHeld == true) return
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Atlas:LocalAiInference",
        ).apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseCpuWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }

    private fun buildNotification(label: String): android.app.Notification {
        val openApp = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Atlas is working")
            .setContentText(label)
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Local AI activity",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Keeps an on-device AI response running when Atlas is in the background."
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
