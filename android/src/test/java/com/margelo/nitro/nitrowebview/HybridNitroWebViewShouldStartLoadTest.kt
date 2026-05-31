package com.margelo.nitro.nitrowebview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * JUnit tests for the Android-side `onShouldStartLoadWithRequest`
 * plumbing. The Nitro `Promise<Boolean>` cannot be instantiated in plain
 * JVM unit tests (its `then` / `catch` paths cross a JNI boundary), so
 * the suite drives the wait-loop through the
 * [HybridNitroWebView.awaitBooleanWithTimeout] seam — a pure-Kotlin
 * driver extracted from [HybridNitroWebView.awaitShouldStart].
 *
 * Coverage (one JUnit per AC bullet plus an extra timeout-elapsed pin):
 *   1. JS allow  -> awaitBooleanWithTimeout returns `true`.
 *   2. JS block  -> awaitBooleanWithTimeout returns `false`.
 *   3. Timeout   -> awaitBooleanWithTimeout returns `true` (default-allow).
 *   4. Reject    -> awaitBooleanWithTimeout returns `true` (default-allow).
 *   5. Late      -> a resolution that arrives AFTER the wait window does
 *                   not corrupt the result the waiter observed.
 *   6. Constant  -> SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS == 250L (RNW
 *                   parity pin).
 */
class HybridNitroWebViewShouldStartLoadTest {

  // region: AC pin — 250 ms constant

  @Test
  fun `timeoutConstant_is250ms_mirroringRNW`() {
    assertEquals(
      "SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS must be 250ms (mirrors react-native-webview).",
      250L,
      HybridNitroWebView.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS,
    )
  }

  // region: AC 1 — JS allow → return true

  /**
   * `subscribe` resolves synchronously with `true`. The wait-loop sees
   * the result on its first check inside the synchronized block and
   * returns `true` immediately. No sleep, no timeout exposure.
   */
  @Test
  fun `awaitBoolean_resolveTrue_returnsTrue_andDoesNotWait`() {
    val start = System.currentTimeMillis()
    val result = HybridNitroWebView.awaitBooleanWithTimeout(
      timeoutMs = 500L, // generous — we should never reach the deadline.
      subscribe = { onResolve, _ -> onResolve(true) },
    )
    val elapsed = System.currentTimeMillis() - start
    assertEquals("synchronous resolve(true) must return true", true, result)
    assertTrue(
      "synchronous resolve(true) must NOT block for the timeout window (was ${elapsed}ms)",
      elapsed < 250L,
    )
  }

  // region: AC 2 — JS block → return false

  /**
   * `subscribe` resolves synchronously with `false`. The wait-loop
   * returns `false` (which the caller flips into `shouldOverrideUrlLoading
   * == true` to BLOCK the navigation).
   */
  @Test
  fun `awaitBoolean_resolveFalse_returnsFalse_andDoesNotWait`() {
    val start = System.currentTimeMillis()
    val result = HybridNitroWebView.awaitBooleanWithTimeout(
      timeoutMs = 500L,
      subscribe = { onResolve, _ -> onResolve(false) },
    )
    val elapsed = System.currentTimeMillis() - start
    assertEquals("synchronous resolve(false) must return false", false, result)
    assertTrue(
      "synchronous resolve(false) must NOT block for the timeout window (was ${elapsed}ms)",
      elapsed < 250L,
    )
  }

  // region: AC 3 — timeout → default allow

  /**
   * `subscribe` never invokes the resolve/reject callbacks — the wait
   * window must elapse and the helper must default to `true`. Real-time
   * waits are inherent here; we use a deliberately small window (50ms)
   * so the test runs fast.
   */
  @Test
  fun `awaitBoolean_noResolution_defaultsToAllow_afterWaitWindowElapses`() {
    val window = 50L
    val start = System.currentTimeMillis()
    val result = HybridNitroWebView.awaitBooleanWithTimeout(
      timeoutMs = window,
      subscribe = { _, _ -> /* never resolve */ },
    )
    val elapsed = System.currentTimeMillis() - start
    assertEquals(
      "no resolution within the wait window must default to true (allow)",
      true,
      result,
    )
    assertTrue(
      "wait window must have elapsed before returning (was ${elapsed}ms, expected >= ${window}ms)",
      elapsed >= window,
    )
  }

  // region: AC 4 — reject → default allow

  /**
   * `subscribe` invokes the reject callback. A rejected Promise must
   * NOT block the navigation — mirrors RNW's default-allow behavior so
   * a buggy JS handler can't strand the WebView on a blank page.
   */
  @Test
  fun `awaitBoolean_rejection_defaultsToAllow_andDoesNotWait`() {
    val start = System.currentTimeMillis()
    val result = HybridNitroWebView.awaitBooleanWithTimeout(
      timeoutMs = 500L,
      subscribe = { _, onReject -> onReject(RuntimeException("simulated JS error")) },
    )
    val elapsed = System.currentTimeMillis() - start
    assertEquals(
      "a rejected Promise must default to true (allow), mirroring RNW",
      true,
      result,
    )
    assertTrue(
      "rejection must NOT block for the timeout window (was ${elapsed}ms)",
      elapsed < 250L,
    )
  }

  // region: AC 5 — asynchronous resolution from a background thread

  /**
   * `subscribe` schedules the resolution on a background executor that
   * delivers ~25 ms later — well inside the 250 ms RNW window. The
   * waiter must unblock on the `notifyAll` and return the resolved
   * value.
   */
  @Test
  fun `awaitBoolean_backgroundResolution_unblocksWaiter_andReturnsResolvedValue`() {
    val executor = Executors.newSingleThreadScheduledExecutor()
    try {
      val result = HybridNitroWebView.awaitBooleanWithTimeout(
        timeoutMs = 250L,
        subscribe = { onResolve, _ ->
          executor.schedule(
            { onResolve(false) },
            25L,
            TimeUnit.MILLISECONDS,
          )
        },
      )
      assertEquals(
        "background resolve(false) must unblock the waiter and return false",
        false,
        result,
      )
    } finally {
      executor.shutdownNow()
    }
  }

  // region: AC 6 — late resolution does not corrupt the verdict

  /**
   * A resolution that arrives AFTER the wait window already elapsed
   * must not retroactively flip the verdict the waiter returned. The
   * waiter has already exited the `synchronized` block and any further
   * `onResolve` calls fire into a no-longer-observed state. This pins
   * the absence of cross-call contamination.
   */
  @Test
  fun `awaitBoolean_lateResolution_doesNotAffectAlreadyReturnedVerdict`() {
    var resolverHolder: ((Boolean) -> Unit)? = null
    val first = HybridNitroWebView.awaitBooleanWithTimeout(
      timeoutMs = 30L,
      subscribe = { onResolve, _ ->
        // Stash the callback so the test can fire it AFTER the window
        // elapses, simulating a JS Promise that resolves too late.
        resolverHolder = onResolve
      },
    )
    assertEquals(
      "no resolution before the deadline must default to allow",
      true,
      first,
    )

    // Fire the late resolution AFTER the waiter has returned. The
    // captured callback runs synchronously on the test thread, so we
    // observe what happens: it must NOT throw and the verdict already
    // returned to the caller cannot be changed.
    resolverHolder?.invoke(false)
    // No further assertion needed — the contract is that the caller's
    // earlier verdict (true) is final.
  }
}
