package io.github.l2hyunwoo.nitro.webview

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NitroWebChromeClientLifecycleTest {
  @Test fun `dispose cancels chooser once and late result cannot reach it`() {
    var launches = 0
    val client = NitroWebChromeClient(
      context = RuntimeEnvironment.getApplication(),
      chooserLauncher = { _, _ -> launches++; true },
    )
    val results = mutableListOf<Array<android.net.Uri>?>()
    assertTrue(client.onShowFileChooser(null, ValueCallback {
      results.add(it)
      client.dispose()
    }, null))
    client.dispose()
    client.dispose()
    assertEquals(1, results.size)
    assertNull(results.single())
    assertFalse(client.hasPendingCallback())
    assertFalse(client.handleFileChooserResult(NitroWebChromeClient.FILE_CHOOSER_REQUEST_CODE, Activity.RESULT_OK, null))
    assertFalse(client.onShowFileChooser(null, ValueCallback { results.add(it) }, null))
    assertEquals(2, results.size)
    assertEquals(1, launches)
  }

  @Test fun `dispose restores fullscreen and releases its callback once`() {
    val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
    val page = View(activity)
    activity.setContentView(page)
    val client = NitroWebChromeClient(context = activity, webViewProvider = { page })
    client.hostActivity = activity
    val video = FrameLayout(activity)
    var hidden = 0
    client.onShowCustomView(video) { hidden++ }
    assertEquals(View.INVISIBLE, page.visibility)
    client.dispose()
    client.dispose()
    client.onHideCustomView()
    assertEquals(1, hidden)
    assertNull(video.parent)
    assertNull(client.hostActivity)
    assertEquals(View.VISIBLE, page.visibility)
    client.onShowCustomView(FrameLayout(activity)) { hidden++ }
    assertEquals(2, hidden)
  }

  @Test fun `dispose destroys pending popup WebViews and detaches notifications`() {
    val app = RuntimeEnvironment.getApplication()
    val parent = WebView(app)
    val client = NitroWebChromeClient(context = app)
    val transport = parent.WebViewTransport()
    val message = Message.obtain(Handler(Looper.getMainLooper())).apply { obj = transport }
    client.onOpenWindow = { fail("Disposed popup must not emit") }
    client.onLoadProgress = { fail("Disposed client must not emit") }
    assertTrue(client.onCreateWindow(parent, false, true, message))
    val child = transport.webView
    client.dispose()
    client.dispose()
    assertTrue(shadowOf(child).wasDestroyCalled())
    assertNull(client.onOpenWindow)
    assertNull(client.onLoadProgress)
    client.onProgressChanged(parent, 50)
    assertFalse(client.onCreateWindow(parent, false, true, Message.obtain()))
    parent.destroy()
  }
}
