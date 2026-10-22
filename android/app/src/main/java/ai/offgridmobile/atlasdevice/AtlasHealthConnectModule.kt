package ai.offgridmobile.atlasdevice

import android.content.Intent
import android.content.pm.PackageManager
import android.health.connect.AggregateRecordsRequest
import android.health.connect.AggregateRecordsResponse
import android.health.connect.HealthConnectException
import android.health.connect.HealthConnectManager
import android.health.connect.TimeRangeFilter
import android.health.connect.TimeInstantRangeFilter
import android.health.connect.datatypes.AggregationType
import android.health.connect.datatypes.HeartRateRecord
import android.health.connect.datatypes.StepsRecord
import android.os.Build
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Optional foreground-only Health Connect reader. Never caches health records. */
class AtlasHealthConnectModule(private val app: ReactApplicationContext) :
    ReactContextBaseJavaModule(app) {
    override fun getName(): String = "AtlasHealthConnect"

    private val stepPermission = "android.permission.health.READ_STEPS"
    private val pulsePermission = "android.permission.health.READ_HEART_RATE"

    private fun granted(permission: String) =
        app.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    @RequiresApi(34)
    private fun manager(): HealthConnectManager? =
        app.getSystemService(HealthConnectManager::class.java)

    @ReactMethod
    fun status(promise: Promise) {
        try {
            val supported = Build.VERSION.SDK_INT >= 34
            val available = supported && manager() != null
            val permissions = Arguments.createMap().apply {
                putBoolean("steps", available && granted(stepPermission))
                putBoolean("heartRate", available && granted(pulsePermission))
            }
            promise.resolve(Arguments.createMap().apply {
                putBoolean("supported", supported)
                putBoolean("available", available)
                putMap("permissions", permissions)
            })
        } catch (e: Exception) {
            promise.reject("HEALTH_STATUS", e.message ?: "Health Connect unavailable", e)
        }
    }

    @ReactMethod
    fun openPermissions(promise: Promise) {
        if (Build.VERSION.SDK_INT < 34) {
            promise.reject("HEALTH_UNSUPPORTED", "Health Connect needs Android 14 or newer in this build.")
            return
        }
        try {
            val intent = Intent(HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS).apply {
                putExtra(Intent.EXTRA_PACKAGE_NAME, app.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            app.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("HEALTH_PERMISSIONS", "Could not open Health Connect permissions: " + e.message, e)
        }
    }

    @RequiresApi(34)
    private fun aggregateLong(
        manager: HealthConnectManager,
        range: TimeRangeFilter,
        metric: AggregationType<Long>,
        done: (Long?) -> Unit,
        failed: (Throwable) -> Unit
    ) {
        try {
            val request = AggregateRecordsRequest.Builder<Long>(range)
                .addAggregationType(metric).build()
            manager.aggregate(request, app.mainExecutor,
                object : OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException> {
                    override fun onResult(result: AggregateRecordsResponse<Long>) {
                        done(result.get(metric))
                    }
                    override fun onError(error: HealthConnectException) {
                        failed(error)
                    }
                })
        } catch (e: Exception) {
            failed(e)
        }
    }

    @ReactMethod
    fun readSummary(days: Int, promise: Promise) {
        if (Build.VERSION.SDK_INT < 34) {
            promise.reject("HEALTH_UNSUPPORTED", "Health Connect needs Android 14 or newer in this build.")
            return
        }
        if (days !in 1..7) {
            promise.reject("HEALTH_RANGE", "Select 1 to 7 days.")
            return
        }
        val stepsGranted = granted(stepPermission)
        val heartGranted = granted(pulsePermission)
        if (!stepsGranted && !heartGranted) {
            promise.reject("HEALTH_PERMISSION_REQUIRED", "Grant health permissions first.")
            return
        }
        try {
            val service = manager()
            if (service == null) {
                promise.reject("HEALTH_UNAVAILABLE", "Health Connect is unavailable.")
                return
            }
            val end = Instant.now()
            val start = LocalDate.now(ZoneId.systemDefault()).minusDays((days - 1).toLong())
                .atStartOfDay(ZoneId.systemDefault()).toInstant()
            val range = TimeInstantRangeFilter.Builder().setStartTime(start).setEndTime(end).build()
            val out = Arguments.createMap().apply {
                putString("start", start.toString())
                putString("end", end.toString())
                putInt("days", days)
                putBoolean("stepsGranted", stepsGranted)
                putBoolean("heartRateGranted", heartGranted)
            }
            val failed: (Throwable) -> Unit = { error ->
                promise.reject("HEALTH_READ", error.message ?: "Health Connect read failed", error)
            }
            val readHeart: () -> Unit = {
                if (!heartGranted) {
                    out.putNull("averageHeartRateBpm")
                    promise.resolve(out)
                } else {
                    aggregateLong(service, range, HeartRateRecord.BPM_AVG,
                        { bpm ->
                            if (bpm == null) out.putNull("averageHeartRateBpm")
                            else out.putDouble("averageHeartRateBpm", bpm.toDouble())
                            promise.resolve(out)
                        }, failed)
                }
            }
            if (!stepsGranted) {
                out.putNull("steps")
                readHeart()
            } else {
                aggregateLong(service, range, StepsRecord.STEPS_COUNT_TOTAL,
                    { steps ->
                        if (steps == null) out.putNull("steps")
                        else out.putDouble("steps", steps.toDouble())
                        readHeart()
                    }, failed)
            }
        } catch (e: Exception) {
            promise.reject("HEALTH_READ", e.message ?: "Health Connect read failed", e)
        }
    }
}
