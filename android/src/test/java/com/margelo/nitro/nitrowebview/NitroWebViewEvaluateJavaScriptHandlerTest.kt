package com.margelo.nitro.nitrowebview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private class StubJavaScriptEvaluator(
  var stubResult: String? = null,
  var throwOnEvaluate: Throwable? = null,
) : JavaScriptEvaluator {

  data class Invocation(val code: String)

  val invocations: MutableList<Invocation> = mutableListOf()

  override fun evaluateJavaScriptPayload(
    code: String,
    resultCallback: (String?) -> Unit,
  ) {
    invocations.add(Invocation(code = code))
    throwOnEvaluate?.let { throw it }
    resultCallback(stubResult)
  }
}

private class Outcome {
  var resolved: String? = null
  var rejected: Throwable? = null
  var resolveCount: Int = 0
  var rejectCount: Int = 0

  val resolve: (String) -> Unit = { value ->
    resolved = value
    resolveCount += 1
  }
  val reject: (Throwable) -> Unit = { t ->
    rejected = t
    rejectCount += 1
  }
}

class NitroWebViewEvaluateJavaScriptHandlerTest {

  @Test
  fun `evaluate_onePlusOne_resolvesToString2`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()
    val evaluator = StubJavaScriptEvaluator(stubResult = "2")
    val outcome = Outcome()

    handler.evaluate(
      code = "1+1",
      evaluator = evaluator,
      resolve = outcome.resolve,
      reject = outcome.reject,
    )

    assertEquals(
      "evaluating `1+1` must resolve the Promise with the string \"2\"",
      "2",
      outcome.resolved,
    )
    assertEquals("resolve must be called exactly once", 1, outcome.resolveCount)
    assertEquals("reject must not be called on success", 0, outcome.rejectCount)
    assertNull("reject must not receive a throwable on success", outcome.rejected)

    assertEquals(
      "the evaluator must receive exactly one invocation per evaluate call",
      1,
      evaluator.invocations.size,
    )
    assertEquals("1+1", evaluator.invocations.single().code)
  }

  @Test
  fun `evaluate_invokesEvaluatorExactlyOncePerCall`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()
    val evaluator = StubJavaScriptEvaluator(stubResult = "42")

    handler.evaluate(
      code = "21 * 2",
      evaluator = evaluator,
      resolve = {},
      reject = { fail("must not reject: $it") },
    )
    handler.evaluate(
      code = "21 * 2",
      evaluator = evaluator,
      resolve = {},
      reject = { fail("must not reject: $it") },
    )

    assertEquals(2, evaluator.invocations.size)
    assertEquals("21 * 2", evaluator.invocations[0].code)
    assertEquals("21 * 2", evaluator.invocations[1].code)
  }

  @Test
  fun `evaluate_forwardsCodeVerbatim_includingMultibyteAndScripts`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()
    val evaluator = StubJavaScriptEvaluator(stubResult = "\"ok\"")

    val cases = listOf(
      "",
      "1+1",
      "(function(){return 42})()",
      "document.title",
      "'漢字 🎉'",
      "</script><script>alert(1)</script>",
    )

    for (raw in cases) {
      handler.evaluate(
        code = raw,
        evaluator = evaluator,
        resolve = {},
        reject = { fail("must not reject: $it") },
      )
    }

    assertEquals(cases.size, evaluator.invocations.size)
    for ((i, raw) in cases.withIndex()) {
      assertEquals(
        "code must be forwarded byte-for-byte (case index $i)",
        raw,
        evaluator.invocations[i].code,
      )
    }
  }

  @Test
  fun `normalize_nullCollapsesToEmptyString`() {
    assertEquals(
      "undefined/void JS results must surface as \"\"",
      "",
      NitroWebViewEvaluateJavaScriptHandler.normalize(null),
    )
  }

  @Test
  fun `normalize_nonNullStringForwardedVerbatim`() {
    assertEquals("2", NitroWebViewEvaluateJavaScriptHandler.normalize("2"))
    assertEquals("true", NitroWebViewEvaluateJavaScriptHandler.normalize("true"))
    assertEquals("false", NitroWebViewEvaluateJavaScriptHandler.normalize("false"))
    assertEquals("\"hello\"", NitroWebViewEvaluateJavaScriptHandler.normalize("\"hello\""))
    assertEquals("{\"k\":1}", NitroWebViewEvaluateJavaScriptHandler.normalize("{\"k\":1}"))
    assertEquals("[1,2,3]", NitroWebViewEvaluateJavaScriptHandler.normalize("[1,2,3]"))
    assertEquals("", NitroWebViewEvaluateJavaScriptHandler.normalize(""))
    assertEquals(
      "\"漢字 🎉\"",
      NitroWebViewEvaluateJavaScriptHandler.normalize("\"漢字 🎉\""),
    )
  }

  @Test
  fun `evaluate_undefinedResult_resolvesToEmptyString`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()
    val evaluator = StubJavaScriptEvaluator(stubResult = null)
    val outcome = Outcome()

    handler.evaluate(
      code = "void 0",
      evaluator = evaluator,
      resolve = outcome.resolve,
      reject = outcome.reject,
    )

    assertEquals(
      "an undefined JS result (null callback value) must resolve to \"\"",
      "",
      outcome.resolved,
    )
    assertEquals(1, outcome.resolveCount)
    assertEquals(0, outcome.rejectCount)
    assertEquals("void 0", evaluator.invocations.single().code)
  }

  @Test
  fun `evaluate_stringResult_isForwardedVerbatim_includingJsonQuotes`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()
    val evaluator = StubJavaScriptEvaluator(stubResult = "\"document title\"")
    val outcome = Outcome()

    handler.evaluate(
      code = "document.title",
      evaluator = evaluator,
      resolve = outcome.resolve,
      reject = outcome.reject,
    )

    assertEquals(
      "JSON-encoded string results must round-trip with surrounding quotes",
      "\"document title\"",
      outcome.resolved,
    )
    assertEquals("document.title", evaluator.invocations.single().code)
  }

  @Test
  fun `evaluate_rejectsWhenEvaluatorThrows`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()
    val bang = RuntimeException("evaluator exploded")
    val evaluator = StubJavaScriptEvaluator(throwOnEvaluate = bang)
    val outcome = Outcome()

    handler.evaluate(
      code = "anything()",
      evaluator = evaluator,
      resolve = outcome.resolve,
      reject = outcome.reject,
    )

    assertEquals(
      "the evaluator must still record the invocation before throwing",
      1,
      evaluator.invocations.size,
    )
    assertEquals(0, outcome.resolveCount)
    assertEquals(1, outcome.rejectCount)
    assertNotNull(outcome.rejected)
    assertSame(
      "the exact throwable raised by the evaluator must reach `reject`",
      bang,
      outcome.rejected,
    )
  }

  @Test
  fun `evaluate_callsExactlyOneTerminalCallback_perCall`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()

    run {
      val outcome = Outcome()
      handler.evaluate(
        code = "1",
        evaluator = StubJavaScriptEvaluator(stubResult = "1"),
        resolve = outcome.resolve,
        reject = outcome.reject,
      )
      assertEquals(1, outcome.resolveCount)
      assertEquals(0, outcome.rejectCount)
    }

    run {
      val outcome = Outcome()
      handler.evaluate(
        code = "1",
        evaluator = StubJavaScriptEvaluator(throwOnEvaluate = IllegalStateException("nope")),
        resolve = outcome.resolve,
        reject = outcome.reject,
      )
      assertEquals(0, outcome.resolveCount)
      assertEquals(1, outcome.rejectCount)
      assertTrue(outcome.rejected is IllegalStateException)
    }
  }

  @Test
  fun `evaluate_handlerIsStateless_acrossMultipleEvaluators`() {
    val handler = NitroWebViewEvaluateJavaScriptHandler()
    val a = StubJavaScriptEvaluator(stubResult = "\"A\"")
    val b = StubJavaScriptEvaluator(stubResult = "\"B\"")

    val outA = Outcome()
    val outB = Outcome()

    handler.evaluate(code = "x", evaluator = a, resolve = outA.resolve, reject = outA.reject)
    handler.evaluate(code = "y", evaluator = b, resolve = outB.resolve, reject = outB.reject)

    assertEquals("\"A\"", outA.resolved)
    assertEquals("\"B\"", outB.resolved)
    assertEquals(1, a.invocations.size)
    assertEquals(1, b.invocations.size)
    assertEquals("x", a.invocations.single().code)
    assertEquals("y", b.invocations.single().code)
  }
}
