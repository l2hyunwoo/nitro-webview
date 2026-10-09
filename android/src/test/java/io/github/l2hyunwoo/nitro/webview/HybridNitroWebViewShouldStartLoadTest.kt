package io.github.l2hyunwoo.nitro.webview

import com.margelo.nitro.nitrowebview.ShouldStartLoadRequest
import com.margelo.nitro.nitrowebview.WebViewNavigationType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Exercises the production wait helper without Nitro Promise JNI. */
class HybridNitroWebViewShouldStartLoadTest {
  private class Clock {
    var nanos = 0L
    var reads = 0
    val waits = mutableListOf<Long>()
    var duringWait: ((Long) -> Unit)? = null

    fun await(
      subscribe: (onResolve: (Boolean) -> Unit, onReject: (Throwable) -> Unit) -> Unit,
    ): Boolean = HybridNitroWebView.awaitBooleanWithTimeout(
      timeoutMs = 250L,
      nanoTime = { reads += 1; nanos },
      waitFor = { _, remaining ->
        waits += remaining
        val action = duringWait
        if (action == null) nanos += remaining else action(remaining)
      },
      subscribe = subscribe,
    )
  }

  @Test
  fun `nominal timeout remains 250ms`() {
    assertEquals(250L, HybridNitroWebView.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS)
  }

  @Test
  fun `immediate allow or block does not wait`() {
    for (value in listOf(true, false)) {
      val clock = Clock()
      assertEquals(value, clock.await { resolve, _ -> resolve(value) })
      assertTrue(clock.waits.isEmpty())
    }
  }

  @Test
  fun `response before deadline decides navigation`() {
    val clock = Clock()
    var resolve: ((Boolean) -> Unit)? = null
    clock.duringWait = {
      clock.nanos += TimeUnit.MILLISECONDS.toNanos(249L)
      resolve!!(false)
    }
    assertFalse(clock.await { onResolve, _ -> resolve = onResolve })
    assertEquals(listOf(TimeUnit.MILLISECONDS.toNanos(250L)), clock.waits)
  }

  @Test
  fun `callback and subscription time consume the same budget`() {
    val clock = Clock()
    assertTrue(clock.await { _, _ -> clock.nanos += TimeUnit.MILLISECONDS.toNanos(100L) })
    assertEquals(listOf(TimeUnit.MILLISECONDS.toNanos(150L)), clock.waits)
  }

  @Test
  fun `response at deadline fails open without another wait`() {
    val clock = Clock()
    assertTrue(clock.await { resolve, _ ->
      clock.nanos += TimeUnit.MILLISECONDS.toNanos(250L)
      resolve(false)
    })
    assertTrue(clock.waits.isEmpty())
  }

  @Test
  fun `spurious wakeups only wait the remaining budget`() {
    val clock = Clock()
    clock.duringWait = { remaining ->
      clock.nanos += minOf(remaining, TimeUnit.MILLISECONDS.toNanos(100L))
    }
    assertTrue(clock.await { _, _ -> })
    assertEquals(listOf(250L, 150L, 50L).map(TimeUnit.MILLISECONDS::toNanos), clock.waits)
  }

  @Test
  fun `rejection fails open without waiting`() {
    val clock = Clock()
    assertTrue(clock.await { _, reject -> reject(RuntimeException("JS rejection")) })
    assertTrue(clock.waits.isEmpty())
  }

  @Test
  fun `first completion is final`() {
    val clock = Clock()
    assertFalse(clock.await { resolve, reject ->
      resolve(false)
      reject(RuntimeException("duplicate"))
      resolve(true)
    })
    assertTrue(clock.waits.isEmpty())
  }

  @Test
  fun `subscription failure fails open and seals late completions`() {
    val clock = Clock()
    var resolve: ((Boolean) -> Unit)? = null
    assertTrue(clock.await { onResolve, _ ->
      resolve = onResolve
      throw Exception("subscription failed")
    })
    val reads = clock.reads
    resolve!!(false)
    assertEquals(reads, clock.reads)
    assertTrue(clock.waits.isEmpty())
  }

  @Test
  fun `hook invocation failure fails open`() {
    val payload = ShouldStartLoadRequest(
      "https://example.com/", WebViewNavigationType.OTHER, null, true, true,
    )
    assertTrue(HybridNitroWebView.awaitShouldStart(
      hook = { throw IllegalStateException("callback failed") },
      payload = payload,
    ))
  }

  @Test(expected = AssertionError::class)
  fun `fatal errors propagate`() {
    Clock().await { _, _ -> throw AssertionError("fatal native failure") }
  }

  @Test
  fun `timeout seals late resolution and rejection`() {
    val clock = Clock()
    var resolve: ((Boolean) -> Unit)? = null
    var reject: ((Throwable) -> Unit)? = null
    assertTrue(clock.await { onResolve, onReject ->
      resolve = onResolve
      reject = onReject
    })
    val reads = clock.reads
    resolve!!(false)
    reject!!(RuntimeException("too late"))
    assertEquals("sealed callbacks must not read or mutate decision state", reads, clock.reads)
  }

  @Test
  fun `interrupted wait fails open restores interrupt and seals completion`() {
    val clock = Clock()
    var resolve: ((Boolean) -> Unit)? = null
    clock.duringWait = { throw InterruptedException("wait interrupted") }
    try {
      assertTrue(clock.await { onResolve, _ -> resolve = onResolve })
      assertTrue(Thread.currentThread().isInterrupted)
      val reads = clock.reads
      resolve!!(false)
      assertEquals(reads, clock.reads)
    } finally {
      Thread.interrupted()
    }
  }

  @Test
  fun `interrupted callback fails open and restores interrupt`() {
    try {
      assertTrue(Clock().await { _, _ -> throw InterruptedException("callback interrupted") })
      assertTrue(Thread.currentThread().isInterrupted)
    } finally {
      Thread.interrupted()
    }
  }

  @Test
  fun `interruption fails open even if completion races with monitor wakeup`() {
    val clock = Clock()
    var resolve: ((Boolean) -> Unit)? = null
    clock.duringWait = {
      resolve!!(false)
      throw InterruptedException("interrupted while reacquiring monitor")
    }
    try {
      assertTrue(clock.await { onResolve, _ -> resolve = onResolve })
      assertTrue(Thread.currentThread().isInterrupted)
    } finally {
      Thread.interrupted()
    }
  }

  @Test
  fun `real background completion wakes the monitor`() {
    val executor = Executors.newSingleThreadScheduledExecutor()
    try {
      assertFalse(HybridNitroWebView.awaitBooleanWithTimeout(
        timeoutMs = 1000L,
        subscribe = { resolve, _ ->
          executor.schedule({ resolve(false) }, 10L, TimeUnit.MILLISECONDS)
        },
      ))
    } finally {
      executor.shutdownNow()
    }
  }
}
