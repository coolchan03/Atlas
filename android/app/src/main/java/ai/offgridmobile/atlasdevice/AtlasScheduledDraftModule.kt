package ai.offgridmobile.atlasdevice

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Durable encrypted SMS-draft reminders. Never sends an SMS. */
class AtlasScheduledDraftModule(private val ctx: ReactApplicationContext): ReactContextBaseJavaModule(ctx) {
    override fun getName(): String = "AtlasScheduledDrafts"
    private val work by lazy { WorkManager.getInstance(ctx) }
    private val tag = "atlas-scheduled-text-draft"

    @ReactMethod fun schedule(to: String, body: String, timeMs: Double, promise: Promise) {
        try {
            val phone = to.replace(Regex("[\\s().-]"), "")
            require(Regex("^\\+?[0-9]{3,20}$").matches(phone)) { "Invalid recipient phone number" }
            require(body.isNotBlank() && body.length <= 1200) { "Text must be 1-1200 characters" }
            val at = timeMs.toLong()
            val delay = at - System.currentTimeMillis()
            require(delay >= 5000L && delay <= 366L * 86400000L) { "Time must be within the next year" }
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                promise.reject("NOTIFICATION_PERMISSION", "Allow notifications before scheduling")
                return
            }
            val data = AtlasDraftCipher.encrypt(JSONObject().put("to", phone).put("body", body).toString())
            val job = OneTimeWorkRequestBuilder<AtlasScheduledDraftWorker>()
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setInputData(workDataOf("secret" to data))
                .addTag(tag)
                .addTag("atlas-at:$at")
                .build()
            work.enqueue(job)
            promise.resolve(job.id.toString())
        } catch (e: Exception) { promise.reject("DRAFT_SCHEDULE", e) }
    }

    /** Lists reminder IDs/times, not plaintext recipients or bodies. */
    @ReactMethod fun list(promise: Promise) {
        Thread {
            try {
                val result = Arguments.createArray()
                val active = setOf(WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED, WorkInfo.State.RUNNING)
                val jobs = work.getWorkInfosByTag(tag).get().filter { it.state in active }.take(100)
                for (job in jobs) {
                    val at = job.tags.firstOrNull { it.startsWith("atlas-at:") }?.removePrefix("atlas-at:")?.toDoubleOrNull()
                    result.pushMap(Arguments.createMap().apply {
                        putString("id", job.id.toString())
                        putString("status", job.state.name.lowercase())
                        if (at != null) putDouble("scheduledAt", at)
                    })
                }
                promise.resolve(result)
            } catch (e: Exception) { promise.reject("DRAFT_LIST", e) }
        }.start()
    }

    @ReactMethod fun cancel(id: String, promise: Promise) {
        Thread {
            try {
                val uuid = UUID.fromString(id)
                val job = work.getWorkInfoById(uuid).get()
                if (job == null || !job.tags.contains(tag)) {
                    promise.reject("DRAFT_NOT_FOUND", "Scheduled draft ID not found")
                    return@Thread
                }
                work.cancelWorkById(uuid).result.get()
                promise.resolve(true)
            } catch (e: Exception) { promise.reject("DRAFT_CANCEL", e) }
        }.start()
    }
}
