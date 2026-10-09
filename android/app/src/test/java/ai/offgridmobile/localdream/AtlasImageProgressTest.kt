package ai.offgridmobile.localdream

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AtlasImageProgressTest {
    @Test fun progressMustMatchRequestedStepCount() {
        assertEquals(1, AtlasImageProgress.parseStep("|== 1/28 - 22s/it", 28))
        assertEquals(11, AtlasImageProgress.parseStep("55% |########| 11/20 [time]", 20))
        assertNull(AtlasImageProgress.parseStep("attention layers: 1/28", 30))
        assertNull(AtlasImageProgress.parseStep("loading 1/2 modules", 28))
        assertNull(AtlasImageProgress.parseStep("loading checkpoint at /sdcard/1/28/model", 28))
        assertNull(AtlasImageProgress.parseStep("0/28", 28))
        assertNull(AtlasImageProgress.parseStep("29/28", 28))
    }

    @Test fun stageClassificationNeverExposesPromptOrPaths() {
        assertEquals("Encoding prompt", AtlasImageProgress.stage("encoding prompt embeddings"))
        assertEquals("Running diffusion", AtlasImageProgress.stage("sampling started"))
        assertEquals("Decoding image", AtlasImageProgress.stage("decoding VAE latents"))
        assertEquals("Decoding image", AtlasImageProgress.stage("decode latent"))
        assertEquals("Decoding image", AtlasImageProgress.stage("VAE decoder finished"))
        assertEquals("Writing PNG", AtlasImageProgress.stage("saving image"))
        assertNull(AtlasImageProgress.stage("user prompt: some private text"))
    }

    @Test fun cpuTickParserWorksWithSpacesInProcessName() {
        val fields = listOf("R") + List(10) { "0" } + listOf("120", "40") + List(10) { "0" }
        val stat = "2222 (sd cli worker) " + fields.joinToString(" ")
        assertEquals(160L, AtlasImageProgress.cpuTicks(stat))
        assertNull(AtlasImageProgress.cpuTicks("broken stat"))
    }
}
