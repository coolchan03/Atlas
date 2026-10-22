package ai.offgridmobile.atlasdevice

import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract.CommonDataKinds.Phone
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Searches by name after permission; does not enumerate or export all contacts. */
class AtlasContactsModule(private val ctx: ReactApplicationContext): ReactContextBaseJavaModule(ctx) {
    override fun getName(): String = "AtlasContacts"

    @ReactMethod
    fun lookupName(name: String, promise: Promise) {
        val query = name.trim().replace(Regex("[%_]"), "")
        if (query.length !in 2..80) {
            promise.reject("CONTACT_QUERY", "Enter between 2 and 80 letters of a contact name")
            return
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("CONTACT_PERMISSION", "Contacts access has not been granted")
            return
        }
        try {
            val results = Arguments.createArray()
            val seen = mutableSetOf<String>()
            val columns = arrayOf(Phone.DISPLAY_NAME_PRIMARY, Phone.NUMBER)
            ctx.contentResolver.query(Phone.CONTENT_URI, columns,
                "${Phone.DISPLAY_NAME_PRIMARY} LIKE ?", arrayOf("%$query%"), null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndexOrThrow(Phone.DISPLAY_NAME_PRIMARY)
                val numberIndex = cursor.getColumnIndexOrThrow(Phone.NUMBER)
                while (cursor.moveToNext() && results.size() < 10) {
                    val display = cursor.getString(nameIndex)?.trim() ?: continue
                    val rawNumber = cursor.getString(numberIndex)?.trim() ?: continue
                    val normalized = rawNumber.replace(Regex("[\\s().-]"), "")
                    if (!Regex("^\\+?[0-9]{3,20}$").matches(normalized)) continue
                    if (!seen.add("$display:$normalized")) continue
                    results.pushMap(Arguments.createMap().apply {
                        putString("name", display.take(90))
                        putString("number", normalized)
                    })
                }
            }
            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("CONTACT_LOOKUP", e)
        }
    }
}
