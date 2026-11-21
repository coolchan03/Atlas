package ai.offgridmobile.localdream

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AtlasImageArchitectureTest {
    @Test fun identifiesNewFamilies() {
        assertEquals("z_image", AtlasImageArchitecture.classify("z-image-Q4_K_M.gguf", "lumina2"))
        assertEquals("z_image", AtlasImageArchitecture.classify("unet.gguf", "lumina2"))
        assertEquals("anima", AtlasImageArchitecture.classify("anima-aesthetic-v1.1.safetensors"))
        assertEquals("chroma", AtlasImageArchitecture.classify("Chroma1-HD-Q4_K_M.gguf", "flux"))
        assertEquals("sdxl", AtlasImageArchitecture.classify("checkpoint.safetensors",
            tensorKeys = "conditioner.embedders.1.model.weight"))
        assertEquals("flux", AtlasImageArchitecture.classify("flux.gguf", "flux"))
        assertEquals("unknown", AtlasImageArchitecture.classify("qwen3-4b.gguf", "qwen3"))
    }

    @Test fun rejectsAuraFlowWithoutSilentlyTreatingPonyAsFluxOrText() {
        assertEquals("auraflow", AtlasImageArchitecture.classify("base-v7-Q4_0.gguf", "auraflow"))
        assertFalse(AtlasImageArchitecture.supported("auraflow"))
        assertTrue(AtlasImageArchitecture.supported("z_image"))
        assertTrue(AtlasImageArchitecture.supported("anima"))
        assertTrue(AtlasImageArchitecture.supported("chroma"))
    }

    @Test fun demandsMatchingTextEncodersAndVae() {
        assertEquals(listOf("vae", "llm"), AtlasImageArchitecture.missing("z_image", emptySet()))
        assertEquals(listOf("llm"), AtlasImageArchitecture.missing("anima", setOf("vae")))
        assertEquals(listOf("t5xxl"), AtlasImageArchitecture.missing("chroma", setOf("vae")))
        assertEquals(listOf("vae", "clip_l", "t5xxl"), AtlasImageArchitecture.missing("flux", emptySet()))
        assertEquals(emptyList<String>(), AtlasImageArchitecture.missing("sdxl", emptySet()))
    }

    @Test fun turboGuidanceAndVariant() {
        assertEquals("turbo", AtlasImageArchitecture.variant("z_image_turbo-Q4.gguf"))
        assertEquals("base", AtlasImageArchitecture.variant("anima-aesthetic.safetensors"))
        assertEquals(1.0, AtlasImageArchitecture.cfg("z_image", "turbo", 7.5), 0.01)
        assertEquals(5.0, AtlasImageArchitecture.cfg("z_image", "base", 5.0), 0.01)
    }
}
