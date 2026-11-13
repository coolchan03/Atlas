package ai.offgridmobile.atlasdevice

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.sqrt

class AtlasSensorModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx), SensorEventListener {

    private val sensors by lazy { ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager }
    private var magListening = false
    private var stepListening = false
    private var stepOffset = -1

    override fun getName() = "AtlasSensor"

    // Every sensor the phone has, one live reading each, for the Sensors screen.
    private val liveTypes = mutableSetOf<Int>()
    private val live = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            try {
                val m = Arguments.createMap()
                m.putInt("type", e.sensor.type)
                val values = Arguments.createArray()
                e.values.forEach { values.pushDouble(it.toDouble()) }
                m.putArray("values", values)
                m.putInt("accuracy", e.accuracy)
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasSensorValue", m)
            } catch (_: Exception) {}
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    /** The phone's own sensors (wake-up duplicates left out): type, name, maker, range and resolution. */
    @ReactMethod
    fun listSensors(promise: Promise) {
        try {
            val out = Arguments.createArray()
            sensors.getSensorList(Sensor.TYPE_ALL).filter { !it.isWakeUpSensor }.forEach { s ->
                val m = Arguments.createMap()
                m.putInt("type", s.type); m.putString("name", s.name); m.putString("vendor", s.vendor)
                m.putString("stringType", s.stringType)
                m.putDouble("maxRange", s.maximumRange.toDouble()); m.putDouble("resolution", s.resolution.toDouble())
                out.pushMap(m)
            }
            promise.resolve(out)
        } catch (e: Throwable) { promise.reject("SENSOR_LIST", e.message ?: e.toString()) }
    }

    /** Starts live readings from the default sensor of a type. Resolves false if there is none or it needs a permission. */
    @ReactMethod
    fun startSensor(type: Int, promise: Promise) {
        try {
            if (type in liveTypes) { promise.resolve(true); return }
            val s = sensors.getDefaultSensor(type)
            if (s == null) { promise.resolve(false); return }
            val ok = sensors.registerListener(live, s, SensorManager.SENSOR_DELAY_UI)
            if (ok) liveTypes.add(type)
            promise.resolve(ok)
        } catch (_: SecurityException) { promise.resolve(false) }
        catch (e: Throwable) { promise.reject("SENSOR_START", e.message ?: e.toString()) }
    }

    @ReactMethod
    fun stopSensor(type: Int, promise: Promise) {
        try {
            val s = sensors.getDefaultSensor(type)
            if (s != null && liveTypes.remove(type)) sensors.unregisterListener(live, s)
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("SENSOR_STOP", e.message ?: e.toString()) }
    }

    @ReactMethod fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}
    @ReactMethod fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

    @ReactMethod
    fun startMagnetometer(promise: Promise) {
        if (magListening) { promise.resolve(true); return }
        val m = sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        if (m == null) { promise.resolve(false); return }
        sensors.registerListener(this, m, SensorManager.SENSOR_DELAY_UI)
        magListening = true; promise.resolve(true)
    }

    @ReactMethod
    fun stopMagnetometer(promise: Promise) {
        if (!magListening) { promise.resolve(true); return }
        val m = sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        if (m != null) sensors.unregisterListener(this, m)
        magListening = false; promise.resolve(true)
    }

    @ReactMethod
    fun startPedometer(promise: Promise) {
        if (stepListening) { promise.resolve(true); return }
        val s = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (s == null) { promise.resolve(false); return }
        sensors.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL)
        stepListening = true; stepOffset = -1; promise.resolve(true)
    }

    @ReactMethod
    fun stopPedometer(promise: Promise) {
        if (!stepListening) { promise.resolve(true); return }
        val s = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (s != null) sensors.unregisterListener(this, s)
        stepListening = false; promise.resolve(true)
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_MAGNETIC_FIELD -> {
                if (!magListening) return
                val x = e.values[0].toDouble(); val y = e.values[1].toDouble(); val z = e.values[2].toDouble()
                val mag = sqrt(x * x + y * y + z * z)
                try {
                    val m = Arguments.createMap()
                    m.putDouble("x", x); m.putDouble("y", y); m.putDouble("z", z); m.putDouble("magnitude", mag)
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasMagnetometer", m)
                } catch (_: Exception) {}
            }
            Sensor.TYPE_STEP_COUNTER -> {
                if (!stepListening) return
                val total = e.values[0].toInt()
                if (stepOffset < 0) { stepOffset = total; return }
                try {
                    val m = Arguments.createMap(); m.putInt("steps", total - stepOffset)
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasPedometer", m)
                } catch (_: Exception) {}
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
