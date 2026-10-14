package ai.offgridmobile.localdream

import java.io.File
import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class AtlasNativeImageConfigTest {
    @get:Rule val temp = TemporaryFolder()

    private fun json(method: String = "euler", schedule: String = "discrete") =
        JSONObject().put("schema", AtlasNativeImageConfig.SCHEMA)
            .put("sampling_method", method).put("schedule", schedule)

    @Test fun acceptsKnownNativeSamplerAndSchedule() {
        val options = AtlasNativeImageConfig.parse(json("dpm++2m", "karras"))
        assertEquals("dpm++2m", options.samplingMethod)
        assertEquals("karras", options.schedule)
        val arguments = mutableListOf<String>()
        AtlasNativeImageConfig.addArguments(arguments, options, "sdxl")
        assertEquals(listOf("--sampling-method", "dpm++2m", "--scheduler", "karras"), arguments)
    }

    @Test fun aysScheduleOnlyRunsOnSdAndSdxl() {
        val options = AtlasNativeImageConfig.parse(json("euler", "ays"))
        val sdxl = mutableListOf<String>()
        AtlasNativeImageConfig.addArguments(sdxl, options, "sdxl")
        assertEquals(listOf("--sampling-method", "euler", "--scheduler", "ays"), sdxl)
        assertThrows(IOException::class.java) {
            AtlasNativeImageConfig.addArguments(mutableListOf(), options, "z_image")
        }
    }

    @Test fun rejectsUnknownFieldsAndInvalidCliArguments() {
        assertThrows(IOException::class.java) {
            AtlasNativeImageConfig.parse(json().put("tokenizer", "custom.json"))
        }
        assertThrows(IOException::class.java) {
            AtlasNativeImageConfig.parse(json("anything; rm -rf", "discrete"))
        }
        assertThrows(IOException::class.java) {
            AtlasNativeImageConfig.parse(json("euler", "unsupported"))
        }
        assertThrows(IOException::class.java) {
            AtlasNativeImageConfig.parse(JSONObject().put("sampling_method", "euler"))
        }
        assertThrows(IOException::class.java) {
            AtlasNativeImageConfig.parse(JSONObject().put("schema", AtlasNativeImageConfig.SCHEMA))
        }
    }

    @Test fun onlyVersionedAtlasFilenameIsExecutableOtherJsonIsMetadata() {
        AtlasNativeImageConfig.validateForAttachment("tokenizer_config.json",
            JSONObject().put("_class_name", "CLIPTokenizer"))
        assertThrows(IOException::class.java) {
            AtlasNativeImageConfig.validateForAttachment("atlas-runtime.json", JSONObject()
                .put("_class_name", "StableDiffusionPipeline"))
        }
    }

    @Test fun ignoresDisabledAndMetadataFilesAndPreservesModernModelDefaults() {
        val root = temp.newFolder("model")
        val attachments = JSONArray().put(JSONObject().put("kind", "config")
            .put("name", "scheduler_config.json").put("path", "/not/a/model/path")
            .put("enabled", true))
        assertNull(AtlasNativeImageConfig.resolve(root, attachments))
        assertEquals(listOf("--sampling-method", "euler"), mutableListOf<String>().apply {
            AtlasNativeImageConfig.addArguments(this, null, "anima")
        })
        assertTrue(mutableListOf<String>().apply {
            AtlasNativeImageConfig.addArguments(this, null, "sd15")
        }.isEmpty())
    }

    @Test fun readsEnabledConfigInsideModelLibraryAndRejectsEscapingPaths() {
        val root = temp.newFolder("model")
        val dir = File(root, "support/config").apply { mkdirs() }
        val config = File(dir, "atlas-runtime.json").apply { writeText(json("euler_a", "ays").toString()) }
        val files = JSONArray().put(JSONObject().put("kind", "config")
            .put("name", "atlas-runtime.json").put("path", config.absolutePath).put("enabled", true))
        assertEquals("euler_a", AtlasNativeImageConfig.resolve(root, files)?.samplingMethod)
        files.getJSONObject(0).put("enabled", false)
        assertNull(AtlasNativeImageConfig.resolve(root, files))
        files.getJSONObject(0).put("enabled", true).put("path", config.parentFile!!.parentFile!!.parentFile!!.absolutePath)
        assertThrows(IOException::class.java) { AtlasNativeImageConfig.resolve(root, files) }
    }

    @Test fun doesNotAllowMultipleEnabledRuntimeConfigs() {
        val root = temp.newFolder("model")
        val folder = File(root, "support/config").apply { mkdirs() }
        val config = File(folder, "atlas-runtime.json").apply { writeText(json().toString()) }
        val one = JSONObject().put("kind", "config").put("name", "atlas-runtime.json")
            .put("path", config.absolutePath).put("enabled", true)
        val files = JSONArray().put(one).put(JSONObject(one.toString()))
        assertThrows(IOException::class.java) { AtlasNativeImageConfig.resolve(root, files) }
    }
}
