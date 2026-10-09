package io.github.l2hyunwoo.nitro.webview

import android.os.Looper
import android.webkit.CookieManager
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.uimanager.ThemedReactContext
import com.margelo.nitro.nitrowebview.UriSource
import com.margelo.nitro.nitrowebview.WebViewSource
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@LooperMode(LooperMode.Mode.PAUSED)
class HybridNitroWebViewInitialSettingsTest {
  private fun newView(): HybridNitroWebView {
    val app = RuntimeEnvironment.getApplication()
    return HybridNitroWebView(ThemedReactContext(BridgeReactContext(app), app, "test", 1))
  }

  @Test fun `source waits for the complete settings and callback batch`() {
    val hybrid = newView()
    val shadow = shadowOf(hybrid.view)
    hybrid.source = WebViewSource.create(UriSource("https://fixture.test", null, null, null))
    hybrid.javaScriptEnabled = false
    hybrid.defaultHeaders = mapOf("X-Fixture" to "installed")
    shadowOf(Looper.getMainLooper()).idle()
    assertNull(shadow.lastLoadedUrl)
    hybrid.afterUpdate()
    shadowOf(Looper.getMainLooper()).idle()
    assertFalse(hybrid.view.settings.javaScriptEnabled)
    assertEquals("https://fixture.test", shadow.lastLoadedUrl)
    assertEquals("installed", shadow.lastAdditionalHttpHeaders["X-Fixture"])
    hybrid.onDropView()
  }

  @Test fun `unsupported private session emits once and leaves shared cookies intact`() {
    val hybrid = newView()
    CookieManager.getInstance().setCookie("https://fixture.test", "existing=fixture")
    val errors = mutableListOf<String>()
    hybrid.source = WebViewSource.create(UriSource("https://fixture.test/private", null, null, null))
    hybrid.incognito = true
    hybrid.onError = { errors += it.nativeEvent.domain }
    hybrid.afterUpdate()
    hybrid.afterUpdate()
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(listOf("NitroWebViewConfiguration"), errors)
    assertNull(shadowOf(hybrid.view).lastLoadedUrl)
    assertEquals("existing=fixture", CookieManager.getInstance().getCookie("https://fixture.test"))
    hybrid.onDropView()
  }
}
