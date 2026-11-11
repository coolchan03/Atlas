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
