package io.github.l2hyunwoo.nitro.webview

import android.webkit.WebSettings
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Robolectric test for [HybridNitroWebView.cacheModeFor], the helper that
 * maps the `cacheEnabled` settings prop to a `WebSettings.cacheMode`
 * constant.
 *
 * Robolectric (not plain JVM) is required because the module's unit tests
 * run with `returnDefaultValues = true`, under which the real
 * `WebSettings.LOAD_DEFAULT` / `LOAD_NO_CACHE` constants both stub to `0`
 * and the two branches would be indistinguishable. Under Robolectric the
 * constants resolve to their real, distinct values.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class HybridNitroWebViewCacheModeTest {

  @Test
  fun `cacheModeFor_true_isLoadDefault`() {
    assertEquals(
      WebSettings.LOAD_DEFAULT,
      HybridNitroWebView.cacheModeFor(true),
    )
  }

  @Test
  fun `cacheModeFor_false_isLoadNoCache`() {
    assertEquals(
      WebSettings.LOAD_NO_CACHE,
      HybridNitroWebView.cacheModeFor(false),
    )
  }
}
