package ai.offgridmobile.atlasdevice

import android.Manifest
import android.content.Context
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
import org.json.JSONObject
import java.net.URL
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

/** One-shot conditional notifications from approved, objectively checkable HTTPS sources. */
class AtlasConditionWatchModule(private val ctx: ReactApplicationContext):
    ReactContextBaseJavaModule(ctx) {
    override fun getName(): String = "AtlasConditionalWatches"
    private val work by lazy { WorkManager.getInstance(ctx) }
    private val prefs by lazy { ctx.getSharedPreferences("atlas_condition_watches", Context.MODE_PRIVATE) }
    private val tag = "atlas-condition-watch"

    companion object {
        fun requirePublicHttps(raw: String): URL {
            require(raw.length in 14..1200) { "Source URL length must be 14-1200 characters" }
            val url = URL(raw)
            val host = url.host.lowercase(Locale.ROOT).trimEnd('.')
            require(url.protocol.equals("https", true) && url.port == -1 && url.userInfo == null &&
                url.ref == null) { "Only normal HTTPS links without credentials or special ports are supported" }
            require(host.contains('.') && !host.startsWith('.') && !host.endsWith(".local") &&
                !host.endsWith(".internal") && !host.endsWith(".test") && !host.endsWith(".localhost") &&
                host != "localhost" && !host.endsWith(".home") && !host.endsWith(".lan") &&
                !host.matches(Regex("[0-9.]+")) && !host.contains(':') &&
                host.all { it.isLetterOrDigit() || it == '-' || it == '.' }) {
                "Use a public HTTPS domain, not a private address"
            }
            return url
        }

        fun validateRule(rule: JSONObject): Int {
            val name = rule.getString("name").trim()
            require(name.length in 3..100) { "Watch name must be 3-100 characters" }
            requirePublicHttps(rule.getString("url"))
            val hours = rule.optInt("pollHours", 6)
            require(hours in 1..24) { "Choose a polling interval between 1 and 24 hours" }
            when (rule.getString("kind")) {
                "text" -> {
                    val positive = rule.getJSONArray("allOf")
                    val negative = rule.optJSONArray("noneOf")
                    require(positive.length() in 1..4 && (negative?.length() ?: 0) <= 4) {
                        "Provide 1-4 required phrases and no more than 4 excluded phrases"
                    }
                    for (i in 0 until positive.length()) {
                        require(positive.getString(i).trim().length in 3..100) { "Invalid required phrase" }
                    }
                    if (negative != null) for (i in 0 until negative.length()) {
                        require(negative.getString(i).trim().length in 3..100) { "Invalid excluded phrase" }
                    }
                }
                "json" -> {
                    val path = rule.getString("path")
                    require(Regex("^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+){0,9}$").matches(path)) {
                        "JSON path must be a dot-separated key path"
                    }
                    val op = rule.getString("operator")
                    require(op in setOf("eq", "neq", "gt", "gte", "lt", "lte")) { "Invalid comparison operator" }
                    val value = rule.get("target")
                    require(value is Number || value is Boolean || value is String) { "Invalid comparison target" }
                    if (op in setOf("gt", "gte", "lt", "lte")) {
                        require(value.toString().toDoubleOrNull() != null) { "Numeric comparison requires numeric target" }
                    } else {
                        require(value.toString().length <= 100) { "Comparison target is too long" }
                    }
                }
                "status" -> require(rule.getInt("status") in 100..599) { "Invalid HTTP response status" }
                "change" -> { /* First successful sample sets a baseline; only later changes can notify. */ }
                else -> throw IllegalArgumentException("Unknown condition type")
            }
            return hours
        }
    }

    @ReactMethod fun setOffGrid(enabled: Boolean, promise: Promise) {
        prefs.edit().putBoolean("offGrid", enabled).apply()
        promise.resolve(true)
    }

    @ReactMethod fun create(ruleJson: String, promise: Promise) {
        Thread {
            try {
                require(ruleJson.length in 15..4200) { "Watch configuration too large" }
                val rule = JSONObject(ruleJson)
                val hours = validateRule(rule)
                require(!prefs.getBoolean("offGrid", false)) {
                    "Off-grid mode is enabled. Turn it off before scheduling internet checks."
                }
                if (Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    promise.reject("WATCH_NOTIFICATION_PERMISSION", "Allow notifications before creating watches")
                    return@Thread
                }
                // InputData and SharedPreferences contain only AES-GCM encrypted
                // configuration. Never store a query, page URL, or match terms as tags.
                val active = work.getWorkInfosByTag(tag).get()
                    .count { it.state in setOf(WorkInfo.State.ENQUEUED, WorkInfo.State.RUNNING, WorkInfo.State.BLOCKED) }
                require(active < 25) { "No more than 25 active conditional watches" }
                val encrypted = AtlasDraftCipher.encrypt(ruleJson)
                val request = PeriodicWorkRequestBuilder<AtlasConditionWatchWorker>(hours.toLong(), TimeUnit.HOURS)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setInputData(workDataOf("encryptedRule" to encrypted))
                    .addTag(tag)
                    .build()
                // Each watch is an independent item and has a unique UUID.
                work.enqueueUniquePeriodicWork("atlas-condition-" + request.id,
                    ExistingPeriodicWorkPolicy.KEEP, request).result.get()
                prefs.edit().putString("rule-" + request.id, encrypted).apply()
                promise.resolve(request.id.toString())
            } catch (e: Exception) {
                promise.reject("WATCH_CREATE", e.message ?: "Could not create watch", e)
            }
        }.start()
    }

    @ReactMethod fun list(promise: Promise) {
        Thread {
            try {
                val out = Arguments.createArray()
                val configs = prefs.all.filterKeys { it.startsWith("rule-") }
                    .entries.take(100)
                for ((key, secret) in configs) {
                    val uuid = try { UUID.fromString(key.removePrefix("rule-")) } catch (_: Exception) { continue }
                    val rule = try { JSONObject(AtlasDraftCipher.decrypt(secret as String)) }
                        catch (_: Exception) { continue }
                    val status = try { work.getWorkInfoById(uuid).get()?.state?.name ?: "UNKNOWN" }
                        catch (_: Exception) { "UNKNOWN" }
                    val id = uuid.toString()
                    out.pushMap(Arguments.createMap().apply {
                        putString("id", id)
                        putString("name", rule.optString("name"))
                        putString("kind", rule.optString("kind"))
                        putString("sourceHost", URL(rule.optString("url")).host)
                        putInt("pollHours", rule.optInt("pollHours", 6))
                        putString("status", status.lowercase(Locale.ROOT))
                        putBoolean("triggered", prefs.getBoolean("triggered-" + id, false))
                        val checked = prefs.getLong("lastChecked-" + id, 0)
                        if (checked > 0) putDouble("lastCheckedAt", checked.toDouble())
                        putString("lastResult", prefs.getString("lastResult-" + id, "Awaiting first check"))
                    })
                }
                promise.resolve(out)
            } catch (e: Exception) { promise.reject("WATCH_LIST", e) }
        }.start()
    }

    @ReactMethod fun cancel(id: String, promise: Promise) {
        Thread {
            try {
                val uuid = UUID.fromString(id)
                require(prefs.contains("rule-" + uuid)) { "Unknown watch ID" }
                work.cancelWorkById(uuid).result.get()
                prefs.edit().remove("rule-" + uuid)
                    .remove("baseline-" + uuid).remove("consecutive-" + uuid)
                    .remove("triggered-" + uuid).remove("lastChecked-" + uuid)
                    .remove("lastResult-" + uuid).apply()
                promise.resolve(true)
            } catch (e: Exception) { promise.reject("WATCH_CANCEL", e) }
        }.start()
    }
}
