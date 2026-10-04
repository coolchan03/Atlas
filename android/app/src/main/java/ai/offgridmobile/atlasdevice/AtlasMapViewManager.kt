package ai.offgridmobile.atlasdevice

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import org.mapsforge.core.graphics.Paint
import org.mapsforge.core.graphics.Style
import org.mapsforge.core.model.LatLong
import org.mapsforge.map.android.graphics.AndroidGraphicFactory
import org.mapsforge.map.android.util.AndroidUtil
import org.mapsforge.map.android.view.MapView
import org.mapsforge.map.layer.Layer
import org.mapsforge.map.layer.cache.TileCache
import org.mapsforge.map.layer.overlay.FixedPixelCircle
import org.mapsforge.map.layer.renderer.TileRendererLayer
import org.mapsforge.map.model.common.Observer
import org.mapsforge.map.reader.MapFile
import org.mapsforge.map.rendertheme.XmlRenderTheme
import java.io.File
import java.io.FileInputStream

/** Offline vector map (Mapsforge .map files). Fully offline: tiles are drawn on the phone. */
class AtlasMapView(val rctx: ThemedReactContext) : MapView(rctx) {
    var path: String? = null
    var mapFile: MapFile? = null
    var cache: TileCache? = null
    var renderer: TileRendererLayer? = null
    var pfd: ParcelFileDescriptor? = null
    val pins = mutableListOf<Layer>()
    var me: Layer? = null
    var lastNonce = -1.0
    private val handler = Handler(Looper.getMainLooper())
    private var queued = false

    init {
        isClickable = true
        mapScaleBar.isVisible = true
        setBuiltInZoomControls(true)
        model.mapViewPosition.addObserver(object : Observer {
            override fun onChange() {
                if (queued) return
                queued = true
                handler.postDelayed({ queued = false; emitCenter() }, 250)
            }
        })
    }

    fun emitCenter() {
        try {
            val c = model.mapViewPosition.center ?: return
            val m = Arguments.createMap()
            m.putDouble("lat", c.latitude); m.putDouble("lon", c.longitude)
            m.putInt("zoom", model.mapViewPosition.zoomLevel.toInt())
            rctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasMapCenter", m)
        } catch (_: Exception) {}
    }

    fun closeMap() {
        renderer?.let { layerManager.layers.remove(it) }
        try { renderer?.onDestroy() } catch (_: Exception) {}
        try { cache?.destroy() } catch (_: Exception) {}
        try { mapFile?.close() } catch (_: Exception) {}
        try { pfd?.close() } catch (_: Exception) {}
        renderer = null; cache = null; mapFile = null; pfd = null
    }
}

class AtlasMapViewManager : SimpleViewManager<AtlasMapView>() {
    override fun getName(): String = "AtlasMapView"

    override fun createViewInstance(ctx: ThemedReactContext): AtlasMapView {
        AndroidGraphicFactory.createInstance(ctx.applicationContext as android.app.Application)
        return AtlasMapView(ctx)
    }

    override fun onDropViewInstance(view: AtlasMapView) {
        try { view.closeMap(); view.destroyAll() } catch (_: Exception) {}
        super.onDropViewInstance(view)
    }

    private fun theme(): XmlRenderTheme {
        for (cn in listOf("org.mapsforge.map.rendertheme.internal.MapsforgeThemes", "org.mapsforge.map.rendertheme.InternalRenderTheme")) {
            try { return Class.forName(cn).getField("DEFAULT").get(null) as XmlRenderTheme } catch (_: Throwable) {}
        }
        throw IllegalStateException("No map style found")
    }

    private fun paint(color: Int, fill: Boolean, width: Float = 3f): Paint {
        val p = AndroidGraphicFactory.INSTANCE.createPaint()
        p.setColor(color)
        p.setStyle(if (fill) Style.FILL else Style.STROKE)
        p.setStrokeWidth(width)
        return p
    }

    private fun emitError(v: AtlasMapView, msg: String) {
        try {
            val m = Arguments.createMap(); m.putString("message", msg)
            v.rctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AtlasMapError", m)
        } catch (_: Exception) {}
    }

    @ReactProp(name = "mapPath")
    fun setMapPath(v: AtlasMapView, p: String?) {
        if (p == v.path) return
        v.path = p
        v.closeMap()
        if (p.isNullOrBlank()) return
        try {
            val mf = if (p.startsWith("content://")) {
                val fd = v.rctx.contentResolver.openFileDescriptor(Uri.parse(p), "r") ?: throw IllegalStateException("Cannot open map file")
                v.pfd = fd
                MapFile(FileInputStream(fd.fileDescriptor))
            } else MapFile(File(p.removePrefix("file://")))
            val cache = AndroidUtil.createTileCache(v.context, "atlasmap" + Integer.toHexString(p.hashCode()),
                v.model.displayModel.tileSize, 1f, v.model.frameBufferModel.overdrawFactor)
            val layer = TileRendererLayer(cache, mf, v.model.mapViewPosition, AndroidGraphicFactory.INSTANCE)
            layer.setXmlRenderTheme(theme())
            v.layerManager.layers.add(0, layer)
            v.mapFile = mf; v.cache = cache; v.renderer = layer
            val here = v.model.mapViewPosition.center
            if (v.lastNonce < 0 || here == null || !mf.boundingBox().contains(here)) {
                val start = mf.startPosition() ?: mf.boundingBox().centerPoint
                v.setCenter(start)
                v.setZoomLevel((mf.startZoomLevel() ?: 12.toByte()))
            }
        } catch (e: Throwable) {
            v.closeMap()
            emitError(v, e.message ?: e.toString())
        }
    }

    /** {lat, lon, zoom?, nonce}: moves the map when nonce changes. */
    @ReactProp(name = "center")
    fun setCenterProp(v: AtlasMapView, c: ReadableMap?) {
        if (c == null || !c.hasKey("lat") || !c.hasKey("lon")) return
        val nonce = if (c.hasKey("nonce")) c.getDouble("nonce") else 0.0
        if (nonce == v.lastNonce) return
        v.lastNonce = nonce
        v.setCenter(LatLong(c.getDouble("lat"), c.getDouble("lon")))
        if (c.hasKey("zoom")) v.setZoomLevel(c.getInt("zoom").toByte())
    }

    /** Saved places: [{lat, lon, color}] */
    @ReactProp(name = "markers")
    fun setMarkers(v: AtlasMapView, list: ReadableArray?) {
        v.pins.forEach { v.layerManager.layers.remove(it) }
        v.pins.clear()
        if (list == null) return
        for (i in 0 until list.size()) {
            val m = list.getMap(i) ?: continue
            val color = if (m.hasKey("color")) m.getInt("color") else 0xFFDC2626.toInt()
            val c = FixedPixelCircle(LatLong(m.getDouble("lat"), m.getDouble("lon")), 9f, paint(color, true), paint(0xFFFFFFFF.toInt(), false, 3f))
            v.pins.add(c); v.layerManager.layers.add(c)
        }
        v.layerManager.redrawLayers()
    }

    /** Your GPS position: {lat, lon} or null. */
    @ReactProp(name = "me")
    fun setMe(v: AtlasMapView, m: ReadableMap?) {
        v.me?.let { v.layerManager.layers.remove(it) }
        v.me = null
        if (m != null && m.hasKey("lat") && m.hasKey("lon")) {
            val c = FixedPixelCircle(LatLong(m.getDouble("lat"), m.getDouble("lon")), 10f, paint(0xFF2563EB.toInt(), true), paint(0xFFFFFFFF.toInt(), false, 4f))
            v.me = c; v.layerManager.layers.add(c)
        }
        v.layerManager.redrawLayers()
    }
}
