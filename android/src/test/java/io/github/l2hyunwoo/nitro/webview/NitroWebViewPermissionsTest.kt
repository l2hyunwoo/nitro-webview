package io.github.l2hyunwoo.nitro.webview

import android.Manifest
import android.app.Application
import android.net.Uri
import android.webkit.PermissionRequest
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NitroWebViewPermissionsTest {
  private val app: Application = RuntimeEnvironment.getApplication()
  private val host = Host()
  private val handler = NitroWebViewPermissions(app) { host }.apply {
    mediaOrigins = arrayOf("https://trusted.test")
    locationOrigins = arrayOf("https://trusted.test")
  }

  private class Request(private val site: String, private vararg val kinds: String) : PermissionRequest() {
    var allowed: Array<String>? = null
    var denied = false
    override fun getOrigin() = Uri.parse(site)
    override fun getResources() = kinds.toList().toTypedArray()
    override fun grant(resources: Array<String>) { allowed = resources }
    override fun deny() { denied = true }
  }
  private class Host : PermissionAwareActivity {
    var listener: PermissionListener? = null
    var requested = emptyArray<String>()
    var code = 0
    override fun checkPermission(permission: String, pid: Int, uid: Int) = -1
    override fun checkSelfPermission(permission: String) = -1
    override fun shouldShowRequestPermissionRationale(permission: String) = false
    override fun requestPermissions(permissions: Array<String>, requestCode: Int, listener: PermissionListener?) {
      requested = permissions; code = requestCode; this.listener = listener
    }
    fun finish() { listener!!.onRequestPermissionsResult(code, requested, IntArray(requested.size) { -1 }) }
  }

  @Test fun `origin policy rejects lookalikes wildcard paths and opaque origins`() {
    for (origin in listOf("https://trusted.test.evil", "https://trusted.test:444", "null", "file:///x")) {
      assertFalse(NitroWebViewPermissions.allows(arrayOf("https://trusted.test"), origin))
    }
    assertFalse(NitroWebViewPermissions.allows(arrayOf("https://trusted.test/path", "*"), "https://trusted.test"))
    assertTrue(NitroWebViewPermissions.allows(arrayOf("https://TRUSTED.test:443/"), "https://trusted.test"))
    assertFalse(NitroWebViewPermissions.allows(null, "https://trusted.test"))
  }

  @Test fun `untrusted site denied even when app has camera`() {
    shadowOf(app).grantPermissions(Manifest.permission.CAMERA)
    val request = Request("https://evil.test", PermissionRequest.RESOURCE_VIDEO_CAPTURE)
    handler.requestMedia(request)
    assertTrue(request.denied)
    assertNull(host.listener)
  }

  @Test fun `partial OS grant returns only allowed known resources`() {
    val request = Request("https://trusted.test", PermissionRequest.RESOURCE_VIDEO_CAPTURE,
      PermissionRequest.RESOURCE_AUDIO_CAPTURE, "future-resource")
    handler.requestMedia(request)
    assertEquals(setOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO), host.requested.toSet())
    shadowOf(app).grantPermissions(Manifest.permission.CAMERA)
    host.finish()
    assertArrayEquals(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE), request.allowed)
  }

  @Test fun `unknown resources denied without OS prompt`() {
    val request = Request("https://trusted.test", "future-resource")
    handler.requestMedia(request)
    assertTrue(request.denied)
    assertNull(host.listener)
  }

  @Test fun `missing host denies missing runtime permission`() {
    val noHost = NitroWebViewPermissions(app) { null }.apply { mediaOrigins = handler.mediaOrigins }
    val request = Request("https://trusted.test", PermissionRequest.RESOURCE_VIDEO_CAPTURE)
    noHost.requestMedia(request)
    assertTrue(request.denied)
  }

  @Test fun `second WebView cannot replace pending runtime listener`() {
    val first = Request("https://trusted.test", PermissionRequest.RESOURCE_VIDEO_CAPTURE)
    handler.requestMedia(first)
    val listener = host.listener
    val secondHandler = NitroWebViewPermissions(app) { host }.apply { mediaOrigins = handler.mediaOrigins }
    val second = Request("https://trusted.test", PermissionRequest.RESOURCE_AUDIO_CAPTURE)
    secondHandler.requestMedia(second)
    assertTrue(second.denied)
    assertSame(listener, host.listener)
    host.finish()
    assertTrue(first.denied)
  }

  @Test fun `OS denial settles request`() {
    val request = Request("https://trusted.test", PermissionRequest.RESOURCE_AUDIO_CAPTURE)
    handler.requestMedia(request)
    host.finish()
    assertTrue(request.denied)
  }

  @Test fun `canceled request never granted after late OS result`() {
    val request = Request("https://trusted.test", PermissionRequest.RESOURCE_VIDEO_CAPTURE)
    handler.requestMedia(request)
    handler.cancelMedia(request)
    shadowOf(app).grantPermissions(Manifest.permission.CAMERA)
    host.finish()
    assertNull(request.allowed)
    assertFalse(request.denied)
  }

  @Test fun `drop denies pending request and late result cannot grant`() {
    val request = Request("https://trusted.test", PermissionRequest.RESOURCE_VIDEO_CAPTURE)
    handler.requestMedia(request)
    handler.dispose()
    shadowOf(app).grantPermissions(Manifest.permission.CAMERA)
    host.finish()
    assertTrue(request.denied)
    assertNull(request.allowed)
  }

  @Test fun `policy removal while prompting prevents grant`() {
    val request = Request("https://trusted.test", PermissionRequest.RESOURCE_VIDEO_CAPTURE)
    handler.requestMedia(request)
    handler.mediaOrigins = null
    shadowOf(app).grantPermissions(Manifest.permission.CAMERA)
    host.finish()
    assertTrue(request.denied)
  }

  @Test fun `approximate location accepted without persisting web origin grant`() {
    var allowed = false
    var retained = true
    handler.requestLocation("https://trusted.test") { _, allow, retain -> allowed = allow; retained = retain }
    assertEquals(setOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION), host.requested.toSet())
    shadowOf(app).grantPermissions(Manifest.permission.ACCESS_COARSE_LOCATION)
    host.finish()
    assertTrue(allowed)
    assertFalse(retained)
  }

  @Test fun `hidden location prompt ignores late callback`() {
    var called = false
    handler.requestLocation("https://trusted.test") { _, _, _ -> called = true }
    handler.cancelLocation()
    host.finish()
    assertFalse(called)
  }
}
