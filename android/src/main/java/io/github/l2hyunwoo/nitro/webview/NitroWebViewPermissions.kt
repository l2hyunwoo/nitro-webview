package io.github.l2hyunwoo.nitro.webview

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import androidx.core.content.ContextCompat
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.net.URI
import java.util.WeakHashMap

/** Web-origin consent is separate from the application's Android permission. UI-thread only. */
internal class NitroWebViewPermissions(
  private val context: Context,
  private val activity: () -> PermissionAwareActivity?,
) {
  var mediaOrigins: Array<String>? = null
  var locationOrigins: Array<String>? = null
  private var media: PermissionRequest? = null
  private var location: Pair<String, GeolocationPermissions.Callback>? = null
  private var disposed = false

  fun requestMedia(request: PermissionRequest) {
    if (disposed || media != null || location != null || !allows(mediaOrigins, request.origin.toString())) {
      request.deny()
      return
    }
    val resources = request.resources.filter { permissionFor(it) != null }
    if (resources.isEmpty()) {
      request.deny()
      return
    }
    media = request
    requestRuntime(resources.mapNotNull(::permissionFor).distinct()) {
      if (media !== request) return@requestRuntime
      media = null
      val granted = resources.filter { granted(permissionFor(it)!!) }
      if (!disposed && allows(mediaOrigins, request.origin.toString()) && granted.isNotEmpty()) {
        request.grant(granted.toTypedArray())
      } else request.deny()
    }
  }

  fun cancelMedia(request: PermissionRequest) {
    if (media === request) media = null
  }

  fun requestLocation(origin: String, callback: GeolocationPermissions.Callback) {
    if (disposed || media != null || location != null || !allows(locationOrigins, origin)) {
      callback.invoke(origin, false, false)
      return
    }
    val pending = origin to callback
    location = pending
    // Request both together: Android 12+ lets the user choose approximate location.
    val permissions = if (hasLocation()) emptyList() else listOf(
      Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION,
    )
    requestRuntime(permissions) {
      if (location !== pending) return@requestRuntime
      location = null
      callback.invoke(origin, !disposed && allows(locationOrigins, origin) && hasLocation(), false)
    }
  }

  fun cancelLocation() { location = null }

  fun dispose() {
    disposed = true
    media?.deny()
    media = null
    location?.let { (origin, callback) -> callback.invoke(origin, false, false) }
    location = null
  }

  private fun granted(permission: String) =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun hasLocation() = granted(Manifest.permission.ACCESS_COARSE_LOCATION) ||
    granted(Manifest.permission.ACCESS_FINE_LOCATION)

  private fun requestRuntime(permissions: List<String>, complete: () -> Unit) {
    val missing = permissions.filterNot(::granted)
    if (missing.isEmpty()) { complete(); return }
    val host = activity()
    if (host == null || busy.containsKey(host)) { complete(); return }
    // ReactActivity owns one PermissionListener. Do not overwrite another WebView's request.
    val token = Any()
    busy[host] = token
    try {
      host.requestPermissions(missing.toTypedArray(), REQUEST_CODE, PermissionListener { code, _, _ ->
        if (code != REQUEST_CODE) false else {
          if (busy[host] === token) busy.remove(host)
          complete()
          true
        }
      })
    } catch (_: RuntimeException) {
      if (busy[host] === token) busy.remove(host)
      complete()
    }
  }

  companion object {
    private const val REQUEST_CODE = 0x4E58
    private val busy = WeakHashMap<PermissionAwareActivity, Any>()

    private fun permissionFor(resource: String): String? = when (resource) {
      PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
      PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
      else -> null
    }

    internal fun allows(origins: Array<String>?, origin: String): Boolean {
      val target = canonicalOrigin(origin) ?: return false
      return origins?.any { canonicalOrigin(it) == target } == true
    }

    private fun canonicalOrigin(value: String): String? = try {
      val uri = URI(value)
      val scheme = uri.scheme?.lowercase()
      val host = uri.host?.lowercase()
      if (scheme !in listOf("https", "http") || host == null || uri.userInfo != null ||
        uri.rawQuery != null || uri.rawFragment != null || uri.path !in listOf("", "/") ||
        uri.port < -1 || uri.port > 65535) null
      else "$scheme://$host:${if (uri.port == -1) { if (scheme == "https") 443 else 80 } else uri.port}"
    } catch (_: Exception) { null }
  }
}
