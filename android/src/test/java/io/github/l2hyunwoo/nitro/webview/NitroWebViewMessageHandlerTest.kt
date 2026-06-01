package io.github.l2hyunwoo.nitro.webview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Method

private class SpyMessageDispatcher : NitroWebViewMessageDispatcher {
  val events: MutableList<NitroWebViewMessageEvent> = mutableListOf()

  override fun dispatchMessage(event: NitroWebViewMessageEvent) {
    events.add(event)
  }
}

private class StubMessageWebView(override var currentURL: String?) : MessageWebView

class NitroWebViewMessageHandlerTest {

  @Test
  fun `postMessage_dispatchesEventWithDataAndUrl`() {
    val spy = SpyMessageDispatcher()
    val webView = StubMessageWebView(currentURL = "https://example.com/page")
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = spy)

    handler.postMessage("hello")

    assertEquals(
      "postMessage must dispatch exactly once per @JavascriptInterface call",
      1,
      spy.events.size,
    )
    val event = spy.events.single()
    assertEquals(
      "the dispatched event's data must be the verbatim JS argument",
      "hello",
      event.data,
    )
    assertEquals(
      "the dispatched event's url must be the current URL of the source web view",
      "https://example.com/page",
      event.url,
    )
  }

  @Test
  fun `postMessage_method_isAnnotatedWithJavascriptInterface`() {
    val method: Method = NitroWebViewMessageHandler::class.java
      .getDeclaredMethod("postMessage", String::class.java)
    val annotation = method.getAnnotation(android.webkit.JavascriptInterface::class.java)
    assertNotNull(
      "postMessage(String) must carry @JavascriptInterface so Android API 17+ exposes it to JS",
      annotation,
    )
  }

  @Test
  fun `postMessage_preservesDataVerbatim_includingJsonAndMultibyte`() {
    val spy = SpyMessageDispatcher()
    val webView = StubMessageWebView(currentURL = "https://x.test/")
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = spy)

    val cases = listOf(
      "",
      "  leading and trailing whitespace  ",
      "{\"k\":\"v\",\"n\":42}",
      "漢字 🎉 \n multiline\t tab",
      "</script><script>alert(1)</script>",
    )

    for (raw in cases) {
      handler.postMessage(raw)
    }

    assertEquals(cases.size, spy.events.size)
    for ((i, raw) in cases.withIndex()) {
      assertEquals(
        "data must be forwarded byte-for-byte (case index $i)",
        raw,
        spy.events[i].data,
      )
    }
  }

  @Test
  fun `postMessage_nullCurrentURL_dispatchesEmptyStringURL`() {
    val spy = SpyMessageDispatcher()
    val webView = StubMessageWebView(currentURL = null)
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = spy)

    handler.postMessage("x")

    assertEquals(1, spy.events.size)
    assertEquals(
      "null currentURL must collapse to an empty string, not null",
      "",
      spy.events.single().url,
    )
  }

  @Test
  fun `postMessage_readsCurrentURLLive_acrossNavigation`() {
    val spy = SpyMessageDispatcher()
    val webView = StubMessageWebView(currentURL = "https://a.test/")
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = spy)

    handler.postMessage("first")
    webView.currentURL = "https://b.test/?x=1"
    handler.postMessage("second")

    assertEquals(2, spy.events.size)
    assertEquals(
      NitroWebViewMessageEvent(data = "first", url = "https://a.test/"),
      spy.events[0],
    )
    assertEquals(
      NitroWebViewMessageEvent(data = "second", url = "https://b.test/?x=1"),
      spy.events[1],
    )
  }

  @Test
  fun `postMessage_dispatchesFullUrlIncludingQuery`() {
    val spy = SpyMessageDispatcher()
    val raw = "https://example.com/path?q=1&r=2"
    val webView = StubMessageWebView(currentURL = raw)
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = spy)

    handler.postMessage("ping")

    assertEquals(raw, spy.events.single().url)
  }

  @Test
  fun `postMessage_noDispatcher_isNoOp`() {
    val webView = StubMessageWebView(currentURL = "https://x.test/")
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = null)

    handler.postMessage("y")
  }

  @Test
  fun `postMessage_dispatcherAttachedAfterConstruction_receivesSubsequentCalls`() {
    val webView = StubMessageWebView(currentURL = "https://x.test/")
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = null)

    handler.postMessage("dropped")

    val spy = SpyMessageDispatcher()
    handler.dispatcher = spy
    handler.postMessage("delivered")

    assertEquals(
      "events fired before wiring must not retroactively land on the dispatcher",
      1,
      spy.events.size,
    )
    assertEquals("delivered", spy.events.single().data)
  }

  @Test
  fun `postMessage_invokesDispatcherOncePerCall`() {
    val spy = SpyMessageDispatcher()
    val webView = StubMessageWebView(currentURL = "https://x.test/")
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = spy)

    handler.postMessage("one")
    handler.postMessage("two")
    handler.postMessage("three")

    assertEquals(3, spy.events.size)
    assertEquals("one", spy.events[0].data)
    assertEquals("two", spy.events[1].data)
    assertEquals("three", spy.events[2].data)
  }

  @Test
  fun `JS_INTERFACE_NAME_matchesInjectedBridge`() {
    assertEquals(
      "ReactNativeWebView",
      NitroWebViewMessageHandler.JS_INTERFACE_NAME,
    )
  }

  @Test
  fun `event_isValueType_byDataAndUrl`() {
    val a = NitroWebViewMessageEvent(data = "x", url = "https://x.test/")
    val b = NitroWebViewMessageEvent(data = "x", url = "https://x.test/")
    val differentData = NitroWebViewMessageEvent(data = "y", url = "https://x.test/")
    val differentUrl = NitroWebViewMessageEvent(data = "x", url = "https://y.test/")

    assertEquals("two events with the same (data, url) must be equal", a, b)
    assertNotEquals("events differ when data differs", a, differentData)
    assertNotEquals("events differ when url differs", a, differentUrl)
    assertTrue(
      "data-class equality must not collapse separate instances to the same reference",
      a !== b,
    )
    assertSame("identity check: same reference is same reference", a, a)
    assertNull(null as String?)
  }

  @Test
  fun `acceptance_invokesPostMessageOnInstance_dispatchedEventContainsDataAndUrl`() {
    val spy = SpyMessageDispatcher()
    val webView = StubMessageWebView(currentURL = "https://acceptance.test/route")
    val handler = NitroWebViewMessageHandler(messageWebView = webView, dispatcher = spy)

    handler.postMessage("payload")

    assertEquals(1, spy.events.size)
    assertEquals(
      NitroWebViewMessageEvent(
        data = "payload",
        url = "https://acceptance.test/route",
      ),
      spy.events.single(),
    )
  }
}
