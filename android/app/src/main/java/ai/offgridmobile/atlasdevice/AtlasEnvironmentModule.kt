package ai.offgridmobile.atlasdevice

import android.Manifest
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

/** Foreground-only sensor measurements and 7-second Bluetooth scan. No identifiers exported. */
class AtlasEnvironmentModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName(): String = "AtlasEnvironment"
    private val main = Handler(Looper.getMainLooper())
    private val sensors by lazy { ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager }
    private val prefs by lazy { ctx.getSharedPreferences("atlas_ambient_samples", Context.MODE_PRIVATE) }
    private val scanning = AtomicBoolean(false)
    private fun permitted(name: String): Boolean =
        ContextCompat.checkSelfPermission(ctx, name) == PackageManager.PERMISSION_GRANTED

    @ReactMethod fun snapshot(promise: Promise) {
        val out = Arguments.createMap()
        try {
            val net = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val wifi = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val capabilities = net.getNetworkCapabilities(net.activeNetwork)
            out.putMap("wifi", Arguments.createMap().apply {
                putBoolean("available", ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI))
                putBoolean("enabled", wifi.isWifiEnabled)
                putBoolean("connected", capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true)
            })
            out.putMap("bluetooth", Arguments.createMap().apply {
                putBoolean("available", ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH))
                val hasPermission = Build.VERSION.SDK_INT < 31 || permitted(Manifest.permission.BLUETOOTH_CONNECT)
                putBoolean("permissionGranted", hasPermission)
                if (hasPermission) try {
                    val mgr = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                    putBoolean("enabled", mgr?.adapter?.isEnabled == true)
                } catch (_: SecurityException) { putBoolean("permissionGranted", false) }
            })
            val pressure = sensors.getDefaultSensor(Sensor.TYPE_PRESSURE)
            val temp = sensors.getDefaultSensor(Sensor.TYPE_AMBIENT_TEMPERATURE)
            out.putMap("sensors", Arguments.createMap().apply {
                putBoolean("pressure", pressure != null)
                putBoolean("ambientTemperature", temp != null)
            })
            out.putDouble("sampledAt", System.currentTimeMillis().toDouble())
            if (pressure == null && temp == null) { promise.resolve(out); return }
            val captured = mutableMapOf<Int, Float>()
            val observer = object : SensorEventListener {
                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
                override fun onSensorChanged(event: SensorEvent) {
                    if (event.values.isNotEmpty()) captured[event.sensor.type] = event.values[0]
                }
            }
            main.post {
                try {
                    pressure?.let { sensors.registerListener(observer, it, SensorManager.SENSOR_DELAY_NORMAL) }
                    temp?.let { sensors.registerListener(observer, it, SensorManager.SENSOR_DELAY_NORMAL) }
                    main.postDelayed({
                        sensors.unregisterListener(observer)
                        try {
                            captured[Sensor.TYPE_PRESSURE]?.let { out.putDouble("pressureHpa", it.toDouble()) }
                            captured[Sensor.TYPE_AMBIENT_TEMPERATURE]?.let { value ->
                                out.putDouble("ambientTemperatureC", value.toDouble())
                                val now = System.currentTimeMillis()
                                val old = prefs.getLong("time", 0L)
                                val hours = (now - old) / 3600000.0
                                if (hours >= 5.0 / 60.0 && hours <= 48.0 && prefs.contains("temperature")) {
                                    out.putDouble("temperatureChangeCPerHour", (value - prefs.getFloat("temperature", value)) / hours)
                                }
                                if (old == 0L || hours >= 5.0 / 60.0 || hours < 0 || hours > 48.0) {
                                    prefs.edit().putLong("time", now).putFloat("temperature", value).apply()
                                }
                            }
                            promise.resolve(out)
                        } catch (e: Exception) { promise.reject("ENV_SENSORS", e) }
                    }, 1800L)
                } catch (e: Exception) {
                    sensors.unregisterListener(observer)
                    promise.reject("ENV_SENSORS", e)
                }
            }
        } catch (e: Exception) { promise.reject("ENV_READ", e) }
    }

    @ReactMethod fun scanNearby(promise: Promise) {
        if (ctx.currentActivity == null) { promise.reject("FOREGROUND_ONLY", "Open Atlas before scanning"); return }
        if (!scanning.compareAndSet(false, true)) { promise.reject("SCAN_RUNNING", "Scan already active"); return }
        val permissions = if (Build.VERSION.SDK_INT >= 31)
            listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        else listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        if (permissions.any { !permitted(it) }) {
            scanning.set(false)
            promise.reject("BLE_PERMISSION", "Bluetooth scan permission required")
            return
        }
        main.post {
            try {
                val adapter = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
                if (adapter == null || !adapter.isEnabled) {
                    scanning.set(false); promise.reject("BLUETOOTH_OFF", "Bluetooth is off"); return@post
                }
                val ble = adapter.bluetoothLeScanner
                if (ble == null) {
                    scanning.set(false); promise.reject("BLE_UNAVAILABLE", "BLE scan unavailable"); return@post
                }
                val found = linkedMapOf<String, Pair<String, Int>>()
                val ended = AtomicBoolean(false)
                lateinit var callback: ScanCallback
                fun finish(error: Int? = null) {
                    if (!ended.compareAndSet(false, true)) return
                    try { ble.stopScan(callback) } catch (_: SecurityException) {}
                    scanning.set(false)
                    if (error != null) { promise.reject("BLE_SCAN_ERROR", "Bluetooth error $error"); return }
                    val results = Arguments.createArray()
                    found.values.take(20).forEach { (name, signal) ->
                        results.pushMap(Arguments.createMap().apply {
                            putString("name", name)
                            putInt("signalDbm", signal)
                        })
                    }
                    promise.resolve(results)
                }
                callback = object : ScanCallback() {
                    override fun onScanResult(type: Int, item: ScanResult) {
                        if (ended.get() || found.size >= 20) return
                        try {
                            val key = item.device.address ?: return
                            val name = item.scanRecord?.deviceName ?: item.device.name ?: "Unnamed device"
                            found[key] = Pair(name.take(80), item.rssi)
                        } catch (_: SecurityException) { finish(2) }
                    }
                    override fun onScanFailed(code: Int) { finish(code) }
                }
                ble.startScan(callback)
                main.postDelayed({ finish() }, 7000L)
            } catch (e: Exception) { scanning.set(false); promise.reject("BLE_SCAN", e) }
        }
    }
}
