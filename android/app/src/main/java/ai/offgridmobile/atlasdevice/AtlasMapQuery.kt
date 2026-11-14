package ai.offgridmobile.atlasdevice

import android.content.Context
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.mapsforge.core.model.LatLong
import org.mapsforge.core.model.Tile
import org.mapsforge.map.reader.MapFile
import java.io.File
import java.io.FileInputStream
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Reads named places out of a Mapsforge .map file, so the AI can answer "what is near me" and "where is the nearest hospital" from the
 * map on the phone with no internet. Read-only, runs off the UI thread (the caller is a React method that resolves a promise).
 */
object AtlasMapQuery {
    private const val ZOOM: Byte = 13
    private const val TILE_SIZE = 256
    private const val MAX_TILES_PER_SIDE = 15
    private const val MAX_SCANNED = 6000

    private class Opened(val file: MapFile, val close: () -> Unit)

    private fun open(ctx: Context, path: String): Opened {
        if (path.startsWith("content://")) {
            val fd = ctx.contentResolver.openFileDescriptor(Uri.parse(path), "r") ?: throw IllegalStateException("Cannot open the map file")
            val stream = FileInputStream(fd.fileDescriptor)
            return Opened(MapFile(stream)) { try { fd.close() } catch (_: Exception) {} }
        }
        return Opened(MapFile(File(path.removePrefix("file://")))) {}
    }

    /** Where a map file covers, how big it is and when it was made. */
    fun info(ctx: Context, path: String): WritableMap {
        val opened = open(ctx, path)
        try {
            val box = opened.file.boundingBox()
            val out = Arguments.createMap()
            out.putDouble("minLat", box.minLatitude); out.putDouble("minLon", box.minLongitude)
            out.putDouble("maxLat", box.maxLatitude); out.putDouble("maxLon", box.maxLongitude)
            out.putDouble("mapDate", opened.file.mapFileInfo.mapDate.toDouble())
            return out
        } finally { opened.close(); opened.file.close() }
    }

    /** Web-mercator tile numbers at the zoom used for reading (the same tiling Mapsforge uses). */
    private fun tileX(lon: Double): Int = max(0, min((1 shl ZOOM.toInt()) - 1, floor((lon + 180.0) / 360.0 * (1 shl ZOOM.toInt())).toInt()))
    private fun tileY(lat: Double): Int {
        val r = Math.toRadians(max(-85.05, min(85.05, lat)))
        val y = (1.0 - ln(tan(r) + 1.0 / cos(r)) / Math.PI) / 2.0 * (1 shl ZOOM.toInt())
        return max(0, min((1 shl ZOOM.toInt()) - 1, floor(y).toInt()))
    }

    private fun nameOf(tags: List<org.mapsforge.core.model.Tag>): String? =
        tags.firstOrNull { it.key == "name" }?.value ?: tags.firstOrNull { it.key.startsWith("name:") }?.value

    /** A short plain word for what a place is: the value of the first tag that says so. */
    private fun kindOf(tags: List<org.mapsforge.core.model.Tag>): String {
        val keys = listOf("amenity", "tourism", "shop", "natural", "place", "leisure", "historic", "aeroway", "waterway", "highway", "railway", "building")
        for (key in keys) {
            val v = tags.firstOrNull { it.key == key }?.value
            if (v != null && v != "yes") return v.replace('_', ' ')
        }
        return "place"
    }

    private fun metres(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1) * cos(Math.toRadians((lat1 + lat2) / 2))
        return 6371000.0 * sqrt(dLat * dLat + dLon * dLon)
    }

    /** The named places within `radiusM` of a point, nearest first, optionally only those whose name or kind contains `query`. */
    fun places(ctx: Context, path: String, lat: Double, lon: Double, radiusM: Double, query: String, limit: Int): com.facebook.react.bridge.WritableArray {
        val opened = open(ctx, path)
        try {
            val box = opened.file.boundingBox()
            if (!box.contains(LatLong(lat, lon))) throw IllegalArgumentException("That point is outside this map")
            val radius = min(max(radiusM, 200.0), 30000.0)
            val dLat = radius / 111320.0
            val dLon = radius / (111320.0 * max(0.1, cos(Math.toRadians(lat))))
            val west = tileX(lon - dLon)
            val east = tileX(lon + dLon)
            val north = tileY(lat + dLat)
            val south = tileY(lat - dLat)
            val x0 = min(west, east); val x1 = min(max(west, east), x0 + MAX_TILES_PER_SIDE - 1)
            val y0 = min(north, south); val y1 = min(max(north, south), y0 + MAX_TILES_PER_SIDE - 1)
            val result = opened.file.readMapData(Tile(x0, y0, ZOOM, TILE_SIZE), Tile(x1, y1, ZOOM, TILE_SIZE))
            val wanted = query.trim().lowercase()
            val found = ArrayList<Triple<Double, String, WritableMap>>()
            var scanned = 0
            for (poi in result?.pointOfInterests ?: emptyList()) {
                if (++scanned > MAX_SCANNED) break
                val name = nameOf(poi.tags) ?: continue
                add(found, name, kindOf(poi.tags), poi.position.latitude, poi.position.longitude, lat, lon, radius, wanted)
            }
            for (way in result?.ways ?: emptyList()) {
                if (++scanned > MAX_SCANNED) break
                val name = nameOf(way.tags) ?: continue
                val at = way.labelPosition ?: way.latLongs.firstOrNull()?.firstOrNull() ?: continue
                add(found, name, kindOf(way.tags), at.latitude, at.longitude, lat, lon, radius, wanted)
            }
            found.sortBy { it.first }
            val out = Arguments.createArray()
            val seen = HashSet<String>()
            for (item in found) {
                if (!seen.add(item.second.lowercase())) continue
                out.pushMap(item.third)
                if (out.size() >= limit) break
            }
            return out
        } finally { opened.close(); opened.file.close() }
    }

    private fun add(list: ArrayList<Triple<Double, String, WritableMap>>, name: String, kind: String, pLat: Double, pLon: Double, lat: Double, lon: Double, radius: Double, wanted: String) {
        if (wanted.isNotEmpty() && !name.lowercase().contains(wanted) && !kind.lowercase().contains(wanted)) return
        val d = metres(lat, lon, pLat, pLon)
        if (d > radius) return
        val m = Arguments.createMap()
        m.putString("name", name); m.putString("kind", kind); m.putDouble("lat", pLat); m.putDouble("lon", pLon); m.putDouble("distanceM", abs(d))
        list.add(Triple(d, name, m))
    }
}
