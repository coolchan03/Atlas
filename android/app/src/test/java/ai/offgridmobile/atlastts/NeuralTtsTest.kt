package ai.offgridmobile.atlastts

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class NeuralTtsTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun voice(name: String, vararg files: String): File {
        val dir = tmp.newFolder(name)
        files.forEach { File(dir, it).writeText("x") }
        return dir
    }

    @Test
    fun kittenFolderIsDetected() {
        assertTrue(NeuralTts.isKitten(voice("kitten-nano-en", "model.fp16.onnx", "voices.bin", "tokens.txt")))
    }

    @Test
    fun kokoroFolderWithVoicesBinIsNotKitten() {
        assertFalse(NeuralTts.isKitten(voice("kokoro-en", "model.onnx", "voices.bin", "tokens.txt")))
    }

    @Test
    fun kittenNamedFolderWithoutVoicesIsNotKitten() {
        assertFalse(NeuralTts.isKitten(voice("kitten-broken", "model.fp16.onnx", "tokens.txt")))
    }
}
