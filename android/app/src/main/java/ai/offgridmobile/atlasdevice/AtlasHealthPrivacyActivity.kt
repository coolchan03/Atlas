package ai.offgridmobile.atlasdevice

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Health Connect privacy-policy/rationale destination. Only health data explicitly
 * requested by the user is read; it is returned to the current AI chat.
 */
class AtlasHealthPrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scale = resources.displayMetrics.density
        val padding = (24 * scale).toInt()
        val screen = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            gravity = Gravity.TOP
        }
        val heading = TextView(this).apply {
            text = "Atlas and Health Connect"
            textSize = 22f
            setPadding(0, 0, 0, (16 * scale).toInt())
        }
        val policy = TextView(this).apply {
            text = "Atlas requests permission to read step counts and recorded heart-rate data from Android Health Connect.\n\n" +
                "Atlas reads this information only when you ask and approve the read. It does not continuously monitor your health, automatically send messages, or cache the Health Connect records in this module.\n\n" +
                "The summary is returned to your active AI conversation. If your selected AI model is a remote/cloud provider, the summary can be transmitted to that provider as part of the conversation. Use a local AI model if you want to keep this information on your device.\n\n" +
                "You can revoke Atlas's Health Connect permissions at any time in Android settings. No diagnosis or emergency monitoring is provided."
            textSize = 16f
        }
        val close = Button(this).apply {
            text = "Close"
            setOnClickListener { finish() }
        }
        screen.addView(heading)
        screen.addView(policy, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        screen.addView(close, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(screen)
    }
}
