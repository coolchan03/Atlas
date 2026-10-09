package ai.offgridmobile.localdream

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AtlasVulkanProbeTest {
    @Test fun parsesRealSdCliTabDelimitedDeviceOutput() {
        val text = "cpu\tARM Cortex CPU\nvulkan0\tAdreno (TM) 830\n"
        val found = AtlasVulkanProbe.device(text)
        assertEquals("vulkan0", found?.name)
        assertEquals("Adreno (TM) 830", found?.description)
    }

    @Test fun parsesUppercaseAndAlternateVulkanIndex() {
        val output = "cpu\tCPU\nVulkan1\tQualcomm GPU\n"
        assertEquals("vulkan1", AtlasVulkanProbe.device(output)?.name)
    }

    @Test fun doesNotMistakeLogTextOrControlCharactersForDevices() {
        assertNull(AtlasVulkanProbe.device("ggml_vulkan: No devices found\ncpu\tCPU\n"))
        assertNull(AtlasVulkanProbe.device("\u0008vulkan0\u0008"))
        assertNull(AtlasVulkanProbe.device("some-error-message containing vulkan0"))
    }

    @Test fun preservesDiagnosticReasonsWithoutGuessingGpuStatus() {
        val failed = AtlasVulkanProbe.summary("ggml_vulkan: No devices found", 1, false)
        assertTrue(failed.contains("exit 1"))
        assertTrue(failed.contains("No devices found"))
        assertTrue(AtlasVulkanProbe.summary("", -1, true).contains("timed out"))
        assertFalse(AtlasVulkanProbe.summary("cpu\tCPU", 0, false).contains("timed out"))
    }
}
