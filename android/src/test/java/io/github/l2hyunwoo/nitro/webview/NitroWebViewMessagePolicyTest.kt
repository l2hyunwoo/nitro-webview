package io.github.l2hyunwoo.nitro.webview

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NitroWebViewMessagePolicyTest {
  @Test
  fun `compiled policy snapshots its input and fails closed until replaced`() {
    val values = arrayOf("HTTPS://Trusted.Test:443/")
    val cached = NitroWebViewMessagePolicy.compile(values, true)
    values[0] = "https://other.test"
    assertTrue(cached.allows("https://trusted.test"))
    assertFalse(cached.allows("https://other.test"))
    val updated = NitroWebViewMessagePolicy.compile(values, true)
    assertFalse(updated.allows("https://trusted.test"))
    assertTrue(updated.allows("https://other.test"))
    val invalid = NitroWebViewMessagePolicy.compile(arrayOf("https://trusted.test", "*"), true)
    assertNotNull(invalid.error)
    assertFalse(invalid.allows("https://trusted.test"))
    assertFalse(NitroWebViewMessagePolicy.compile(emptyArray(), true).allows("https://trusted.test"))
  }

  @Test
  fun `omitted policy preserves legacy delivery while opt in requires native identity`() {
    assertTrue(NitroWebViewMessagePolicy.allows(null, null, false))
    assertFalse(NitroWebViewMessagePolicy.allows(arrayOf("https://trusted.test"), null, false))
    assertNotNull(NitroWebViewMessagePolicy.configurationError(emptyArray(), false))
  }

  @Test
  fun `policy matches actual sender and canonicalizes case and default ports`() {
    val policy = arrayOf("HTTPS://Trusted.Test:443/")
    assertTrue(NitroWebViewMessagePolicy.allows(policy, "https://trusted.test", true))
    for (origin in listOf("https://other.test", "http://trusted.test", "https://trusted.test:444", "null")) {
      assertFalse(NitroWebViewMessagePolicy.allows(policy, origin, true))
    }
    assertTrue(NitroWebViewMessagePolicy.allows(arrayOf("http://[::1]:8098"), "http://[::1]:8098", true))
    assertFalse(NitroWebViewMessagePolicy.allows(emptyArray(), "https://trusted.test", true))
  }

  @Test
  fun `invalid entry denies the entire policy`() {
    for (invalid in listOf(
      "*",
      "https://*.test",
      "https://trusted.test/path",
      "https://u@trusted.test",
      "https://trusted.test?q=1",
      "https://trusted.test#x",
      "file:///tmp",
      "https://trusted.test:0",
      "https://trusted.test:65536",
    )) {
      val policy = arrayOf("https://trusted.test", invalid)
      assertNotNull(invalid, NitroWebViewMessagePolicy.configurationError(policy, true))
      assertFalse(invalid, NitroWebViewMessagePolicy.allows(policy, "https://trusted.test", true))
    }
  }
}
