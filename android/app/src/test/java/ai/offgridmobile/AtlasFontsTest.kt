package ai.offgridmobile

import android.app.Application
import android.graphics.Typeface
import androidx.test.core.app.ApplicationProvider
import com.facebook.react.common.assets.ReactFontManager
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Checks asset provenance through RN's real font lookup; physical glyph rendering is device QA. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
class AtlasFontsTest {
    @Test
    fun selectedFamiliesKeepTheirBundledTypefaceForBoldAndItalicText() {
        val assets = ApplicationProvider.getApplicationContext<Application>().assets
        val files = assets.list("fonts").orEmpty().filter {
            it.startsWith("Atlas") && (it.endsWith(".ttf") || it.endsWith(".otf"))
        }
        assertEquals("Every selectable Android font is covered", 7, files.size)
        registerAtlasFonts(assets)
        registerAtlasFonts(assets) // Re-registration must keep the same family behavior.
        val fonts = ReactFontManager.getInstance()
        for (file in files) {
            val family = file.substringBeforeLast('.')
            val bundled = Typeface.createFromAsset(assets, "fonts/$file")
            for (weight in listOf(400, 700, 800)) {
                for (italic in listOf(false, true)) {
                    val expected = Typeface.create(bundled, weight, italic)
                    val actual = fonts.getTypeface(family, weight, italic, assets)
                    assertEquals("$family weight=$weight italic=$italic must use its bundled asset", expected, actual)
                }
            }
        }
    }
}
