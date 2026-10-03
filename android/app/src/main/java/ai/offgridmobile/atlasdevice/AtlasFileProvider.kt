package ai.offgridmobile.atlasdevice

import androidx.core.content.FileProvider

/** Atlas's own FileProvider subclass, so it does not clash with providers declared by libraries. */
class AtlasFileProvider : FileProvider()
