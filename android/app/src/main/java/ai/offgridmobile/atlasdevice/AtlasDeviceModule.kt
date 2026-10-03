package ai.offgridmobile.atlasdevice

import android.content.ContentUris
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.CalendarContract
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Atlas assistant access to the phone: all-files permission, opening files, calendar. */
class AtlasDeviceModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx), SensorEventListener {
    override fun getName(): String = "AtlasDevice"

    // ---------------- compass ----------------
    private val sensors by lazy { ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager }
    private val rot = FloatArray(9)
    private val orient = FloatArray(3)
    private var grav: FloatArray? = null
    private var mag: FloatArray? = null
    private var lastEmit = 0L
    private var listening = false

    /** True only if the phone has a magnetometer (a real compass). */
    @ReactMethod
    fun hasCompass(promise: Promise) {
        promise.resolve(sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null)
    }

    @ReactMethod
    fun startCompass(promise: Promise) {
        if (listening) { promise.resolve(true); return }
        val rv = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        val m = sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        if (m == null) { promise.resolve(false); return }
        if (rv != null) sensors.registerListener(this, rv, SensorManager.SENSOR_DELAY_UI)
        else {
            sensors.registerListener(this, m, SensorManager.SENSOR_DELAY_UI)
            sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        }
        listening = true
        promise.resolve(true)
    }

    @ReactMethod
    fun stopCompass(promise: Promise) {
        sensors.unregisterListener(this); listening = false; grav = null; mag = null
        promise.resolve(true)
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> SensorManager.getRotationMatrixFromVector(rot, e.values)
            Sensor.TYPE_ACCELEROMETER -> { grav = e.values.clone(); if (mag == null) return; if (!SensorManager.getRotationMatrix(rot, null, grav, mag)) return }
            Sensor.TYPE_MAGNETIC_FIELD -> { mag = e.values.clone(); if (grav == null) return; if (!SensorManager.getRotationMatrix(rot, null, grav, mag)) return }
            else -> return
        }
        val now = System.currentTimeMillis()
        if (now - lastEmit < 80) return
        lastEmit = now
        SensorManager.getOrientation(rot, orient)
        val deg = ((Math.toDegrees(orient[0].toDouble()) + 360.0) % 360.0)
        try {
            val map = Arguments.createMap(); map.putDouble("heading", deg)
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasCompass", map)
        } catch (_: Exception) {}
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        if (sensor?.type == Sensor.TYPE_MAGNETIC_FIELD) {
            try {
                val map = Arguments.createMap(); map.putInt("accuracy", accuracy)
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasCompassAccuracy", map)
            } catch (_: Exception) {}
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() { try { sensors.unregisterListener(this) } catch (_: Exception) {}; super.invalidate() }

    @ReactMethod
    fun hasAllFilesAccess(promise: Promise) {
        promise.resolve(if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager() else true)
    }

    @ReactMethod
    fun requestAllFilesAccess(promise: Promise) {
        try {
            val i = if (Build.VERSION.SDK_INT >= 30) {
                Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${ctx.packageName}"))
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("SETTINGS", e) }
    }

    @ReactMethod
    fun storageRoot(promise: Promise) { promise.resolve(Environment.getExternalStorageDirectory().absolutePath) }

    /** Open a file in another app (browser for .html, docs app for .docx, etc.). */
    @ReactMethod
    fun openFile(path: String, promise: Promise) {
        try {
            val f = File(path.removePrefix("file://"))
            val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.atlasfiles", f)
            val ext = f.extension.lowercase()
            val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: when (ext) { "md" -> "text/markdown"; else -> "*/*" }
            val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            val chooser = Intent.createChooser(view, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("OPEN", e.message ?: "Could not open the file", e) }
    }

    /** Events between start and end (ms since 1970). Needs READ_CALENDAR. */
    @ReactMethod
    fun calendarEvents(startMs: Double, endMs: Double, promise: Promise) {
        try {
            val b = CalendarContract.Instances.CONTENT_URI.buildUpon()
            ContentUris.appendId(b, startMs.toLong())
            ContentUris.appendId(b, endMs.toLong())
            val cols = arrayOf(
                CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
                CalendarContract.Instances.EVENT_LOCATION, CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
                CalendarContract.Instances.DESCRIPTION,
            )
            val out = Arguments.createArray()
            ctx.contentResolver.query(b.build(), cols, null, null, "${CalendarContract.Instances.BEGIN} ASC")?.use { c ->
                var n = 0
                while (c.moveToNext() && n < 200) {
                    out.pushMap(Arguments.createMap().apply {
                        putString("title", c.getString(0) ?: "")
                        putDouble("begin", c.getLong(1).toDouble())
                        putDouble("end", c.getLong(2).toDouble())
                        putString("location", c.getString(3) ?: "")
                        putBoolean("allDay", c.getInt(4) == 1)
                        putString("calendar", c.getString(5) ?: "")
                        putString("description", (c.getString(6) ?: "").take(300))
                    })
                    n++
                }
            }
            promise.resolve(out)
        } catch (e: SecurityException) {
            promise.reject("CAL_PERMISSION", "Calendar permission not granted")
        } catch (e: Exception) { promise.reject("CAL", e.message ?: "Calendar error", e) }
    }

    /** Opens the calendar app with a new event filled in - you confirm and save it there. */
    @ReactMethod
    fun addCalendarEvent(title: String, startMs: Double, endMs: Double, location: String, description: String, promise: Promise) {
        try {
            val i = Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMs.toLong())
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMs.toLong())
                .putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                .putExtra(CalendarContract.Events.DESCRIPTION, description)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("CAL_ADD", e.message ?: "Could not open the calendar", e) }
    }
}
