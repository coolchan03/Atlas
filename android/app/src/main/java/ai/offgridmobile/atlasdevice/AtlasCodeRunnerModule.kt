package ai.offgridmobile.atlasdevice

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Approval-gated, dependency-free JavaScript runner in a restricted disposable WebView.
 * This is not a compiler for Java, Kotlin, Python or Rust. */
class AtlasCodeRunnerModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName() = "AtlasCodeRunner"
    private val main = Handler(Looper.getMainLooper())
    private val occupied = AtomicBoolean(false)

    @SuppressLint("SetJavaScriptEnabled")
    @ReactMethod
    fun runJavascript(source: String, testsJson: String, promise: Promise) {
        if (source.length !in 1..120000 || testsJson.length > 35000) {
            promise.reject("CODE_SIZE", "Source or tests too large")
            return
        }
        val tests = try { JSONArray(testsJson) } catch (_: Exception) {
            promise.reject("CODE_TESTS", "Tests must be a JSON array")
            return
        }
        if (tests.length() > 40) {
            promise.reject("CODE_TESTS", "40 tests maximum")
            return
        }
        val cases = StringBuilder()
        try {
            for (i in 0 until tests.length()) {
                val test = tests.getJSONObject(i)
                val name = test.getString("name").take(90)
                val code = test.getString("code")
                require(name.isNotBlank() && code.length in 1..2500) { "Invalid test entry" }
                cases.append("try{").append(code)
                    .append(";__results.push({name:").append(JSONObject.quote(name))
                    .append(",passed:true});}catch(e){__results.push({name:")
                    .append(JSONObject.quote(name)).append(",passed:false,error:String(e.message||e)});}\n")
            }
        } catch (e: Exception) {
            promise.reject("CODE_TESTS", e.message ?: "Invalid test entry", e)
            return
        }
        if (!occupied.compareAndSet(false, true)) {
            promise.reject("CODE_BUSY", "Another code run is active")
            return
        }
        main.post {
            var view: WebView? = null
            var watchdog: Runnable? = null
            val finished = AtomicBoolean(false)
            fun finish(error: String?, output: String?) {
                if (!finished.compareAndSet(false, true)) return
                watchdog?.let { main.removeCallbacks(it) }
                try { view?.stopLoading(); view?.destroy() } catch (_: Exception) {}
                view = null
                occupied.set(false)
                if (error != null) promise.reject("CODE_RUN", error)
                else promise.resolve(output ?: "{}")
            }
            try {
                val web = WebView(ctx)
                view = web
                web.settings.apply {
                    javaScriptEnabled = true
                    blockNetworkLoads = true
                    allowFileAccess = false
                    allowContentAccess = false
                    domStorageEnabled = false
                    databaseEnabled = false
                    javaScriptCanOpenWindowsAutomatically = false
                    setSupportMultipleWindows(false)
                }
                web.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView?, req: WebResourceRequest?) = true
                    override fun shouldInterceptRequest(v: WebView?, req: WebResourceRequest?) =
                        WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream(ByteArray(0)))
                            .apply { setStatusCodeAndReasonPhrase(403, "Blocked") }
                    override fun onPageFinished(v: WebView?, url: String?) {
                        if (finished.get()) return
                        val sourceCode = JSONObject.quote(source + "\n" + cases.toString())
                        val script = """
                          (function(){
                            var __logs=[],__results=[];
                            var console={log:function(){__logs.push([].slice.call(arguments).join(' '))},
                              error:function(){__logs.push('ERROR '+[].slice.call(arguments).join(' '))}};
                            var assert=function(v,m){if(!v)throw new Error(m||'Assertion failed')};
                            try{
                              new Function('console','assert','__results',CODE_GOES_HERE)(console,assert,__results);
                              return JSON.stringify({ok:__results.every(function(x){return x.passed}),
                                logs:__logs.slice(0,60),tests:__results});
                            }catch(e){
                              return JSON.stringify({ok:false,logs:__logs.slice(0,60),
                                tests:__results,error:String(e.stack||e)});
                            }
                          })()
                        """.trimIndent().replace("CODE_GOES_HERE", sourceCode)
                        web.evaluateJavascript(script) { raw ->
                            try {
                                val decoded = JSONTokener(raw).nextValue().toString()
                                finish(null, JSONObject(decoded).toString().take(24000))
                            } catch (e: Exception) { finish(e.message ?: "Invalid JavaScript output", null) }
                        }
                    }
                }
                watchdog = Runnable { finish("JavaScript timed out after 8 seconds", null) }
                main.postDelayed(watchdog!!, 8000L)
                web.loadUrl("about:blank")
            } catch (e: Exception) { finish(e.message ?: "JavaScript runner unavailable", null) }
        }
    }
}
