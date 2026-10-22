package ai.offgridmobile.atlasdevice

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale

/**
 * Evaluate an approved, objectively checkable condition in the background.
 *
 * No LLM prompts or entire conversations are sent anywhere. A single, explicitly
 * approved HTTPS source is polled by WorkManager; unconfirmed/failed checks do
 * not notify. Uses the Keystore cipher already used by Atlas scheduled drafts.
 */
class AtlasConditionWatchWorker(context: Context, params: WorkerParameters): Worker(context, params) {
    private val prefs = applicationContext.getSharedPreferences("atlas_condition_watches", Context.MODE_PRIVATE)
    private val watchId get() = id.toString()

    override fun doWork(): Result {
        if (prefs.getBoolean("offGrid", false)) return Result.success()
        if (prefs.getBoolean("triggered-" + watchId, false)) return Result.success()
        val encoded = inputData.getString("encryptedRule") ?: return Result.failure()
        val rule = try { JSONObject(AtlasDraftCipher.decrypt(encoded)) } catch (_: Exception) {
            return Result.failure()
        }
        val url = try { AtlasConditionWatchModule.requirePublicHttps(rule.getString("url")) } catch (_: Exception) {
            return Result.failure()
        }

        val now = System.currentTimeMillis()
        try {
            val (status, body) = load(url, rule.getString("kind") != "status")
            var matched = false
            val kind = rule.getString("kind")
            if (kind == "status") {
                matched = status == rule.getInt("status")
            } else if (status in 200..299) {
                matched = when (kind) {
                    "text" -> textMatches(body, rule)
                    "json" -> jsonMatches(body, rule)
                    "change" -> hasChanged(body)
                    else -> false
                }
            }
            val previous = prefs.getInt("consecutive-" + watchId, 0)
            val count = if (matched) (previous + 1).coerceAtMost(2) else 0
            val editor = prefs.edit()
                .putLong("lastChecked-" + watchId, now)
                .putString("lastResult-" + watchId,
                    if (matched) "Condition matched; awaiting confirmation" else "Condition not met")
                .putInt("consecutive-" + watchId, count)
            editor.apply()

            // Two separate checks are required to reduce one-off false positives.
            if (count >= 2 && !prefs.getBoolean("triggered-" + watchId, false)) {
                if (notifyMatched(rule, url)) {
                    prefs.edit().putBoolean("triggered-" + watchId, true)
                        .putString("lastResult-" + watchId, "Condition met; notification sent").apply()
                    // The watch is one-shot. Preserve its status in preferences
                    // for list/status views; stop its periodic network polling.
                    androidx.work.WorkManager.getInstance(applicationContext).cancelWorkById(id)
                } else {
                    prefs.edit().putString("lastResult-" + watchId,
                        "Condition confirmed; notification permission unavailable").apply()
                }
            }
        } catch (_: Exception) {
            // Never treat an unavailable source, redirect, timeout, parse failure,
            // login page, or network error as evidence that the condition is met.
            prefs.edit().putLong("lastChecked-" + watchId, now)
                .putString("lastResult-" + watchId, "Source unavailable or could not be evaluated")
                .putInt("consecutive-" + watchId, 0).apply()
        }
        return Result.success()
    }

    private fun load(source: URL, wantBody: Boolean): Pair<Int, String> {
        val conn = source.openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = false // Never follow redirects to private networks.
        conn.connectTimeout = 10000
        conn.readTimeout = 10000
        conn.setRequestProperty("User-Agent", "AtlasConditionalWatch/1.0")
        conn.setRequestProperty("Accept", "text/html, application/json, text/plain;q=0.9")
        try {
            val code = conn.responseCode
            if (code !in 200..299 || !wantBody) return Pair(code, "")
            val mime = (conn.contentType ?: "").lowercase(Locale.ROOT)
            if (!mime.contains("text/") && !mime.contains("application/json") &&
                !mime.contains("+json") && !mime.contains("application/xml")) {
                throw IllegalArgumentException("Unsupported content type")
            }
            // Bound both response bytes and reading time. Never download images,
            // PDFs, or unbounded files in the background.
            val bytes = conn.inputStream.use { stream ->
                val buffer = ByteArray(8192)
                val out = java.io.ByteArrayOutputStream()
                while (out.size() <= 192000) {
                    val read = stream.read(buffer)
                    if (read == -1) break
                    out.write(buffer, 0, read)
                }
                if (out.size() > 192000) throw IllegalArgumentException("Source response too large")
                out.toByteArray()
            }
            return Pair(code, String(bytes, Charsets.UTF_8))
        } finally {
            conn.disconnect()
        }
    }

    private fun textMatches(body: String, rule: JSONObject): Boolean {
        val haystack = body.lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")
        val allOf = rule.getJSONArray("allOf")
        if (allOf.length() == 0) return false
        for (i in 0 until allOf.length()) {
            if (!haystack.contains(allOf.getString(i).lowercase(Locale.ROOT))) return false
        }
        val noneOf = rule.optJSONArray("noneOf") ?: JSONArray()
        for (i in 0 until noneOf.length()) {
            if (haystack.contains(noneOf.getString(i).lowercase(Locale.ROOT))) return false
        }
        return true
    }

    private fun jsonMatches(body: String, rule: JSONObject): Boolean {
        var value: Any = JSONObject(body)
        val parts = rule.getString("path").split(".")
        for (part in parts) {
            value = when (value) {
                is JSONObject -> if (value.has(part)) value.get(part) else return false
                is JSONArray -> value.opt(part.toIntOrNull() ?: return false) ?: return false
                else -> return false
            }
        }
        if (value == JSONObject.NULL) return false
        val target = rule.get("target")
        return when (rule.getString("operator")) {
            "eq" -> value.toString().equals(target.toString(), ignoreCase = true)
            "neq" -> !value.toString().equals(target.toString(), ignoreCase = true)
            "gt", "gte", "lt", "lte" -> {
                val actual = value.toString().toDoubleOrNull() ?: return false
                val limit = target.toString().toDoubleOrNull() ?: return false
                when (rule.getString("operator")) {
                    "gt" -> actual > limit
                    "gte" -> actual >= limit
                    "lt" -> actual < limit
                    else -> actual <= limit
                }
            }
            else -> false
        }
    }

    private fun hasChanged(body: String): Boolean {
        val hash = MessageDigest.getInstance("SHA-256")
            .digest(body.replace(Regex("\\s+"), " ").trim().toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        val first = prefs.getString("baseline-" + watchId, null)
        if (first == null) {
            prefs.edit().putString("baseline-" + watchId, hash).apply()
            return false // First successful sample establishes the baseline.
        }
        return first != hash
    }

    private fun notifyMatched(rule: JSONObject, url: URL): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(applicationContext,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return try {
            val ctx = applicationContext
            val mgr = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) {
                mgr.createNotificationChannel(NotificationChannel(
                    "atlas_conditions", "Conditional alerts", NotificationManager.IMPORTANCE_HIGH))
            }
            val launch = Intent(Intent.ACTION_VIEW, Uri.parse(url.toString())).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val pending = PendingIntent.getActivity(ctx, id.hashCode(), launch,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            NotificationManagerCompat.from(ctx).notify(id.hashCode(),
                NotificationCompat.Builder(ctx, "atlas_conditions")
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("Condition met: " + rule.getString("name").take(70))
                    .setContentText("Verified in two checks of " + url.host + ". Tap to view the source.")
                    .setContentIntent(pending)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .build())
            true
        } catch (_: Exception) { false }
    }
}
