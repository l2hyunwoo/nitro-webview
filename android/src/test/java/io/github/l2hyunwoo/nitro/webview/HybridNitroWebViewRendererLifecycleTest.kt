package io.github.l2hyunwoo.nitro.webview

import android.os.Looper
import android.webkit.RenderProcessGoneDetail
import android.widget.FrameLayout
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.uimanager.ThemedReactContext
import com.margelo.nitro.nitrowebview.UriSource
import com.margelo.nitro.nitrowebview.WebViewSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
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
class HybridNitroWebViewRendererLifecycleTest {
  private fun newView(): HybridNitroWebView {
    val app = RuntimeEnvironment.getApplication()
    return HybridNitroWebView(ThemedReactContext(BridgeReactContext(app), app, "test", 1))
  }

  private fun detail(crashed: Boolean) =
    object : RenderProcessGoneDetail() {
      override fun didCrash() = crashed

      override fun rendererPriorityAtExit() = 0
    }

  @Test
  fun `renderer exit destroys before one notification and callback may unmount`() {
    val hybrid = newView()
    val view = hybrid.view
    val parent = FrameLayout(view.context).apply { addView(view) }
    val client = view.webViewClient
    var exits = 0
    var loads = 0
    hybrid.onLoad = { loads++ }
    hybrid.onLoadEnd = { loads++ }
    hybrid.onError = { fail("Renderer exit must not become a load error") }
    hybrid.onRenderProcessGone = { event ->
      exits++
      assertEquals(true, event.nativeEvent.didCrash)
      assertNull(view.parent)
      assertTrue(shadowOf(view).wasDestroyCalled())
      assertNull(hybrid.onMessage)
      hybrid.onDropView()
    }
    assertTrue(client.onRenderProcessGone(view, detail(true)))
    assertEquals(0, parent.childCount)
    assertTrue(client.onRenderProcessGone(view, detail(true)))
    hybrid.onDropView()
    client.onPageStarted(view, "https://late.test", null)
    client.onPageFinished(view, "https://late.test")
    assertEquals(1, exits)
    assertEquals(0, loads)
  }

  @Test
  fun `queued and stale methods cannot touch a destroyed WebView`() {
    val hybrid = newView()
    val shadow = shadowOf(hybrid.view)
    val settings = hybrid.view.settings
    hybrid.javaScriptEnabled = false
    hybrid.reload()
    hybrid.injectJavaScript("queued()")
    hybrid.source = WebViewSource.create(UriSource("https://queued.test", null, null, null))
    hybrid.onDropView()
    hybrid.goBack()
    hybrid.goForward()
    hybrid.reload()
    hybrid.stopLoading()
    hybrid.injectJavaScript("stale()")
    hybrid.postMessage("stale")
    hybrid.javaScriptEnabled = false
    shadowOf(Looper.getMainLooper()).idle()
    assertTrue(settings.javaScriptEnabled)
    assertEquals(0, shadow.reloadInvocations)
    assertEquals(0, shadow.goBackInvocations)
    assertNull(shadow.lastEvaluatedJavascript)
    assertNull(shadow.lastLoadedUrl)
    assertNull(shadow.getJavascriptInterface("ReactNativeWebView"))
    assertNull(shadow.getJavascriptInterface("ReactNativeHistoryShimNative"))
    assertTrue(shadow.wasDestroyCalled())
  }

  @Test
  fun `shared renderer notifications only clean up their own instance`() {
    val first = newView()
    val second = newView()
    val firstClient = first.view.webViewClient
    val secondClient = second.view.webViewClient
    var firstExits = 0
    var secondExits = 0
    first.onRenderProcessGone = { firstExits++ }
    second.onRenderProcessGone = { event ->
      assertEquals(false, event.nativeEvent.didCrash)
      secondExits++
    }
    assertTrue(firstClient.onRenderProcessGone(first.view, detail(false)))
    assertFalse(shadowOf(second.view).wasDestroyCalled())
    assertTrue(secondClient.onRenderProcessGone(second.view, detail(false)))
    assertEquals(1, firstExits)
    assertEquals(1, secondExits)
    first.onDropView()
    second.onDropView()
  }

  @Test
  fun `drop before renderer callback suppresses notification`() {
    val hybrid = newView()
    val client = hybrid.view.webViewClient
    hybrid.onRenderProcessGone = { fail("Dropped view must not emit") }
    hybrid.onDropView()
    assertTrue(client.onRenderProcessGone(hybrid.view, detail(true)))
  }
}
