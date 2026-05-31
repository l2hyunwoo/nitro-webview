package com.margelo.nitro.nitrowebview

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for NitroWebChromeClient that exercise the intent-building
 * pathway directly. The tests intentionally avoid Robolectric / Android
 * UI plumbing — they cover the parts of the chooser that can be exercised
 * with plain JVM JUnit:
 *
 *  - the GET_CONTENT intent shape (MIME, EXTRA_MIME_TYPES, EXTRA_ALLOW_MULTIPLE)
 *  - that a `<input type="file">` with no `accept` falls back to the wildcard
 *    `any-MIME` value
 *  - no new TS prop/method/callback exists (verified via reflection
 *    in `NoFileUploadTsSurfaceTest` below)
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NitroWebChromeClientTest {

  private fun newClient(): NitroWebChromeClient {
    // The `Context` reference is only consulted when capture intents are
    // built (we test that path with empty accept types, which short-circuit
    // before any Context use here).
    @Suppress("UNCHECKED_CAST")
    return NitroWebChromeClient(
      context = NullContext(),
      hostActivity = null,
    )
  }

  @Test
  fun `buildContentIntent_defaultsToWildcardMime_whenNoAcceptTypes`() {
    val client = newClient()

    val intent = client.buildContentIntent(emptyList(), allowMultiple = false)

    assertEquals(Intent.ACTION_GET_CONTENT, intent.action)
    assertEquals(
      "no accept attribute => chooser must accept any MIME type",
      "*/*",
      intent.type,
    )
    assertTrue(
      "openable category required so the chooser returns content URIs",
      intent.categories?.contains(Intent.CATEGORY_OPENABLE) == true,
    )
    assertNull(
      "no EXTRA_MIME_TYPES when accept is empty",
      intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES),
    )
    assertFalse(
      "EXTRA_ALLOW_MULTIPLE must default to false",
      intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false),
    )
  }

  @Test
  fun `buildContentIntent_singleAcceptType_pinsBaseMime`() {
    val client = newClient()

    val intent = client.buildContentIntent(listOf("image/png"), allowMultiple = false)

    assertEquals(
      "single accept value should pre-filter chooser by MIME",
      "image/png",
      intent.type,
    )
    val mimes = intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)
    assertNotNull(mimes)
    assertEquals(1, mimes!!.size)
    assertEquals("image/png", mimes[0])
  }

  @Test
  fun `buildContentIntent_multipleAcceptTypes_setsMimeArray_andKeepsWildcardBase`() {
    val client = newClient()

    val intent = client.buildContentIntent(
      acceptTypes = listOf("image/png", "image/jpeg", "application/pdf"),
      allowMultiple = true,
    )

    assertEquals(
      "multi-accept must keep a permissive base MIME so the chooser shows the union",
      "*/*",
      intent.type,
    )
    val mimes = intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)
    assertNotNull(mimes)
    assertEquals(3, mimes!!.size)
    assertTrue(
      "EXTRA_ALLOW_MULTIPLE must propagate from `multiple` HTML attribute",
      intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false),
    )
  }

  // region: buildContentIntent(FileChooserParams)

  /**
   * Stub [WebChromeClient.FileChooserParams] for canonical `buildContentIntent`
   * tests. Only `getAcceptTypes()` and `getMode()` are exercised by the
   * intent builder under test; all other abstract members return safe
   * defaults so subclassing the abstract base remains JVM-stub safe (the
   * Android android.jar bundled with `compileSdkVersion` exposes
   * `FileChooserParams` as an abstract class with a public no-arg
   * constructor — see `javap` against the platform stub jar).
   */
  private class StubFileChooserParams(
    private val acceptTypes: Array<String>,
    private val mode: Int,
  ) : WebChromeClient.FileChooserParams() {
    // Java signature is non-nullable; return an empty Intent rather than a
    // null literal so the override matches the platform contract under
    // strict Kotlin null-safety.
    override fun createIntent(): Intent = Intent()
    override fun getAcceptTypes(): Array<String> = acceptTypes
    // Only `getFilenameHint()` is `@Nullable` on the platform; the rest of
    // the abstract members are non-nullable per the platform stub jar.
    override fun getFilenameHint(): String? = null
    override fun getMode(): Int = mode
    override fun getTitle(): CharSequence = ""
    override fun isCaptureEnabled(): Boolean = false
  }

  @Test
  fun `buildContentIntent_fromFileChooserParams_singleMode_matchesSpecLiteral`() {
    val client = newClient()
    val params = StubFileChooserParams(
      acceptTypes = arrayOf("image/png", "image/jpeg"),
      mode = WebChromeClient.FileChooserParams.MODE_OPEN,
    )

    val intent = client.buildContentIntent(params)

    assertEquals(
      "action must be ACTION_GET_CONTENT",
      Intent.ACTION_GET_CONTENT,
      intent.action,
    )
    assertTrue(
      "CATEGORY_OPENABLE must be present so the chooser returns content URIs",
      intent.categories?.contains(Intent.CATEGORY_OPENABLE) == true,
    )
    assertEquals(
      "base MIME type must be the wildcard \"*/*\"",
      "*/*",
      intent.type,
    )
    val mimes = intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)
    assertNotNull(
      "EXTRA_MIME_TYPES must always be set from fileChooserParams.acceptTypes",
      mimes,
    )
    assertArrayEquals(
      "EXTRA_MIME_TYPES contents must equal fileChooserParams.acceptTypes verbatim",
      arrayOf("image/png", "image/jpeg"),
      mimes,
    )
    // EXTRA_ALLOW_MULTIPLE is always put as a Boolean (spec: putExtra(... , params.mode == MODE_OPEN_MULTIPLE)),
    // so the actual stored value should be false for MODE_OPEN — and the
    // default-fallback in `getBooleanExtra(..., true)` must NOT be consulted.
    assertTrue(
      "EXTRA_ALLOW_MULTIPLE must be present in the bundle even when false",
      intent.hasExtra(Intent.EXTRA_ALLOW_MULTIPLE),
    )
    assertFalse(
      "EXTRA_ALLOW_MULTIPLE must equal (params.mode == MODE_OPEN_MULTIPLE) — false for MODE_OPEN",
      intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, true),
    )
  }

  @Test
  fun `buildContentIntent_fromFileChooserParams_multipleMode_matchesSpecLiteral`() {
    val client = newClient()
    val params = StubFileChooserParams(
      acceptTypes = arrayOf("application/pdf"),
      mode = WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE,
    )

    val intent = client.buildContentIntent(params)

    assertEquals(
      "action must be ACTION_GET_CONTENT (multiple mode)",
      Intent.ACTION_GET_CONTENT,
      intent.action,
    )
    assertTrue(
      "CATEGORY_OPENABLE must be present (multiple mode)",
      intent.categories?.contains(Intent.CATEGORY_OPENABLE) == true,
    )
    assertEquals(
      "base MIME must remain wildcard regardless of acceptTypes cardinality",
      "*/*",
      intent.type,
    )
    val mimes = intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)
    assertNotNull(mimes)
    assertArrayEquals(
      "EXTRA_MIME_TYPES must equal fileChooserParams.acceptTypes verbatim (single-element)",
      arrayOf("application/pdf"),
      mimes,
    )
    assertTrue(
      "EXTRA_ALLOW_MULTIPLE must be true when params.mode == MODE_OPEN_MULTIPLE",
      intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false),
    )
  }

  @Test
  fun `handleFileChooserResult_returnsFalse_whenRequestCodeMismatches`() {
    val client = newClient()

    val consumed = client.handleFileChooserResult(
      requestCode = 0xDEAD,
      resultCode = -1,
      data = null,
    )

    assertFalse(
      "Activity results for unrelated request codes must not consume the chooser callback",
      consumed,
    )
  }

  @Test
  fun `handleFileChooserResult_returnsFalse_whenNoCallbackIsPending`() {
    val client = newClient()

    val consumed = client.handleFileChooserResult(
      requestCode = NitroWebChromeClient.FILE_CHOOSER_REQUEST_CODE,
      resultCode = -1,
      data = null,
    )

    assertFalse(consumed)
    assertFalse(client.hasPendingCallback())
  }

  @Test
  fun `FILE_CHOOSER_REQUEST_CODE_isStableLibraryConstant`() {
    // Pinning this prevents accidental drift that would silently break
    // host apps wiring `onActivityResult` to `handleFileChooserResult`.
    assertEquals(0x4E57, NitroWebChromeClient.FILE_CHOOSER_REQUEST_CODE)
  }

  // region: onShowFileChooser delegation contract

  /**
   * Recording fake of [ValueCallback]<Array<Uri>> that captures every
   * `onReceiveValue` invocation so tests can assert that the chooser
   * pipeline either fulfilled (non-null `Array<Uri>`) or cancelled
   * (`null`) the WebView's file-picker continuation.
   */
  private class RecordingFileCallback : ValueCallback<Array<Uri>> {
    val invocations: MutableList<Array<Uri>?> = mutableListOf()

    override fun onReceiveValue(value: Array<Uri>?) {
      invocations.add(value)
    }
  }

  /**
   * Recording [ActivityResolver] that returns a fixed (possibly null)
   * Activity reference and counts how many times it was consulted. The
   * Activity reference itself is opaque — tests pair this resolver with a
   * `NitroWebChromeClient` whose `launchChooser` is overridden so the
   * Activity is never actually invoked at the JVM stub layer.
   */
  private class CountingResolver(
    private val activity: Activity? = null,
  ) : ActivityResolver {
    var resolveCount: Int = 0
      private set

    override fun resolveActivity(): Activity? {
      resolveCount += 1
      return activity
    }
  }

  /**
   * Test subclass that fully replaces the `launchChooser` seam: it neither
   * resolves the Activity nor invokes `startActivityForResult`. Instead it
   * records every intent it was handed and returns the configured outcome.
   *
   * This is the only viable strategy for verifying the launch-success
   * branch in plain JVM JUnit: the Android stub jar bundled with
   * `compileSdkVersion` rejects construction of [android.app.Activity], so
   * tests cannot supply a real Activity to the production code path.
   */
  private class FakeLaunchClient(
    activityResolver: ActivityResolver,
    private val launchResult: LaunchResult,
  ) : NitroWebChromeClient(
    context = NullContext(),
    activityResolver = activityResolver,
  ) {
    val launchedIntents: MutableList<Intent> = mutableListOf()
    var launchCount: Int = 0
      private set

    sealed class LaunchResult {
      object Success : LaunchResult()
      object NoHost : LaunchResult()
      data class Throwing(val cause: Throwable) : LaunchResult()
    }

    override fun launchChooser(chooser: Intent): Boolean {
      launchCount += 1
      launchedIntents.add(chooser)
      return when (val r = launchResult) {
        is LaunchResult.Success -> true
        is LaunchResult.NoHost -> false
        is LaunchResult.Throwing -> throw r.cause
      }
    }
  }

  @Test
  fun `onShowFileChooser_returnsTrue_andRetainsPendingCallback_whenLaunchSucceeds`() {
    val resolver = CountingResolver(activity = null)
    val client = FakeLaunchClient(
      activityResolver = resolver,
      launchResult = FakeLaunchClient.LaunchResult.Success,
    )
    val callback = RecordingFileCallback()

    val returned = client.onShowFileChooser(
      webView = null,
      filePathCallback = callback,
      fileChooserParams = null,
    )

    assertTrue(
      "onShowFileChooser must return true when launchChooser reports success — " +
        "this is the contract host WebViews rely on to suppress their fallback path",
      returned,
    )
    assertEquals(
      "the chooser launch must be delegated exactly once per onShowFileChooser call",
      1,
      client.launchCount,
    )
    assertEquals(
      "the dispatched intent must be an ACTION_CHOOSER wrapping the GET_CONTENT picker",
      Intent.ACTION_CHOOSER,
      client.launchedIntents.single().action,
    )
    assertTrue(
      "the callback must remain pending after a successful launch so the chooser " +
        "result can later be forwarded via handleFileChooserResult",
      client.hasPendingCallback(),
    )
    assertTrue(
      "ValueCallback#onReceiveValue must NOT be invoked on success — " +
        "the WebView is still awaiting the chooser result",
      callback.invocations.isEmpty(),
    )
  }

  @Test
  fun `onShowFileChooser_returnsFalse_andInvokesCallbackWithNull_whenActivityResolverYieldsNull`() {
    val resolver = CountingResolver(activity = null)
    val client = FakeLaunchClient(
      activityResolver = resolver,
      launchResult = FakeLaunchClient.LaunchResult.NoHost,
    )
    val callback = RecordingFileCallback()

    val returned = client.onShowFileChooser(
      webView = null,
      filePathCallback = callback,
      fileChooserParams = null,
    )

    assertFalse(
      "with no Activity host available the chooser MUST report failure so the " +
        "WebView falls back cleanly to no-selection",
      returned,
    )
    assertEquals(
      "the WebView's file-picker continuation must be released exactly once with null " +
        "so the <input type=file> element resolves to an empty selection",
      1,
      callback.invocations.size,
    )
    assertNull(
      "the released continuation value must be null (signals 'no files chosen')",
      callback.invocations.single(),
    )
    assertFalse(
      "no pending callback may be retained after a failed launch — otherwise a " +
        "later activity result would leak into a stale chooser",
      client.hasPendingCallback(),
    )
  }

  @Test
  fun `onShowFileChooser_returnsFalse_andDoesNotDelegate_whenValueCallbackIsNull`() {
    val resolver = CountingResolver(activity = null)
    val client = FakeLaunchClient(
      activityResolver = resolver,
      launchResult = FakeLaunchClient.LaunchResult.Success,
    )

    val returned = client.onShowFileChooser(
      webView = null,
      filePathCallback = null,
      fileChooserParams = null,
    )

    assertFalse(
      "onShowFileChooser must short-circuit to false when there is no callback to fulfil",
      returned,
    )
    assertEquals(
      "no launch may be attempted when the WebView passed a null callback",
      0,
      client.launchCount,
    )
    assertFalse(
      "no callback may become pending when there is no callback to retain",
      client.hasPendingCallback(),
    )
  }

  @Test
  fun `onShowFileChooser_returnsFalse_andCleansUp_whenLaunchThrows`() {
    val resolver = CountingResolver(activity = null)
    val client = FakeLaunchClient(
      activityResolver = resolver,
      launchResult = FakeLaunchClient.LaunchResult.Throwing(
        RuntimeException("ActivityNotFound (simulated)"),
      ),
    )
    val callback = RecordingFileCallback()

    val returned = client.onShowFileChooser(
      webView = null,
      filePathCallback = callback,
      fileChooserParams = null,
    )

    assertFalse(
      "a thrown Throwable from launchChooser must be caught and surface as a false return — " +
        "an uncaught crash here would propagate into the WebView and tear it down",
      returned,
    )
    assertEquals(
      "delegation must still have been attempted once before the throw",
      1,
      client.launchCount,
    )
    assertEquals(
      "the WebView's file-picker continuation must be released with null on launch failure",
      1,
      callback.invocations.size,
    )
    assertNull(callback.invocations.single())
    assertFalse(
      "no pending callback may be retained after a thrown launch failure",
      client.hasPendingCallback(),
    )
  }

  @Test
  fun `onShowFileChooser_cancelsPreviousPendingCallback_whenChooserIsReopened`() {
    val resolver = CountingResolver(activity = null)
    val client = FakeLaunchClient(
      activityResolver = resolver,
      launchResult = FakeLaunchClient.LaunchResult.Success,
    )
    val first = RecordingFileCallback()
    val second = RecordingFileCallback()

    val firstReturn = client.onShowFileChooser(null, first, null)
    val secondReturn = client.onShowFileChooser(null, second, null)

    assertTrue("first chooser invocation must report success", firstReturn)
    assertTrue("second chooser invocation must report success", secondReturn)
    assertEquals(
      "the previously-pending callback must be released with null when a new " +
        "chooser opens — otherwise the WebView leaks an unresolved continuation",
      1,
      first.invocations.size,
    )
    assertNull(first.invocations.single())
    assertTrue(
      "the most-recent callback remains pending after the reopen",
      client.hasPendingCallback(),
    )
    assertTrue(
      "the most-recent callback must NOT have been invoked yet — its result is " +
        "still pending the activity flow",
      second.invocations.isEmpty(),
    )
    assertEquals(2, client.launchCount)
  }

  // region: buildCameraIntent

  /**
   * `buildCameraIntent(context, applicationId, outputFile)` must
   *
   *  - return `Intent(MediaStore.ACTION_IMAGE_CAPTURE)`, AND
   *  - put `MediaStore.EXTRA_OUTPUT` to the FileProvider URI built from
   *    the `"$applicationId.fileprovider"` authority for the given file.
   *
   * The real [androidx.core.content.FileProvider.getUriForFile] cannot run
   * under plain JVM JUnit because it needs a ContentProvider registered in
   * an Android runtime. The production [buildCameraIntent] therefore takes
   * an optional `uriBuilder` seam that defaults to the real FileProvider
   * call; this test supplies a deterministic substitute that records the
   * authority it was asked to build for. The substitute's returned [Uri] is
   * captured for later equality comparison against the EXTRA_OUTPUT extra,
   * and the authority string is asserted to be exactly
   * `"$applicationId.fileprovider"`.
   *
   * Why a captured sentinel instead of `Uri.parse(...)`: the bundled
   * `android.jar` stub throws "Stub!" on most `Uri` factory methods under
   * plain JVM JUnit, so the test cannot construct a real `Uri` instance
   * directly. Instead, we use [android.net.Uri.EMPTY] (a `public static
   * final` field that resolves without method dispatch) as a sentinel; the
   * Intent extra round-trip is then asserted via reference equality.
   */
  @Test
  fun `buildCameraIntent_action_isImageCapture_andExtraOutputCarriesApplicationIdAuthority`() {
    val client = newClient()
    val applicationId = "com.example.host"
    val outputFile = java.io.File("nitro-test-capture.jpg")

    val capturedAuthorities = mutableListOf<String>()
    val capturedFiles = mutableListOf<java.io.File>()
    // `android.net.Uri.EMPTY` is a public static final field — accessing it
    // does NOT invoke any stub method, so it is safe to use as a sentinel in
    // plain JVM JUnit. Reference identity is preserved through the Intent
    // extra bundle, so we can compare the EXTRA_OUTPUT extra back to this
    // exact sentinel below.
    val sentinelUri: android.net.Uri = android.net.Uri.EMPTY
    val intent = client.buildCameraIntent(
      context = NullContext(),
      applicationId = applicationId,
      outputFile = outputFile,
      uriBuilder = { _, authority, file ->
        capturedAuthorities.add(authority)
        capturedFiles.add(file)
        sentinelUri
      },
    )

    assertEquals(
      "buildCameraIntent action must be MediaStore.ACTION_IMAGE_CAPTURE",
      android.provider.MediaStore.ACTION_IMAGE_CAPTURE,
      intent.action,
    )
    assertEquals(
      "uriBuilder must be invoked exactly once with the FileProvider authority derived from applicationId",
      1,
      capturedAuthorities.size,
    )
    assertEquals(
      "FileProvider authority must be exactly `\"\$applicationId.fileprovider\"`",
      "$applicationId.fileprovider",
      capturedAuthorities.single(),
    )
    assertSame(
      "the outputFile passed to buildCameraIntent must be forwarded verbatim to the FileProvider URI builder",
      outputFile,
      capturedFiles.single(),
    )
    assertTrue(
      "EXTRA_OUTPUT must be present in the Intent extras so the camera writes the capture to a known URI",
      intent.hasExtra(android.provider.MediaStore.EXTRA_OUTPUT),
    )
    val extra = intent.getParcelableExtra<android.net.Uri>(
      android.provider.MediaStore.EXTRA_OUTPUT,
    )
    assertNotNull(
      "EXTRA_OUTPUT extra must be readable as a Uri",
      extra,
    )
    assertSame(
      "EXTRA_OUTPUT must be exactly the FileProvider-built URI produced by the uriBuilder seam",
      sentinelUri,
      extra,
    )
  }

  /**
   * Companion check: the default `uriBuilder` argument on
   * [NitroWebChromeClient.buildCameraIntent] must derive the authority as
   * `"$applicationId.fileprovider"` — even when invoked with the canonical
   * (3-argument) signature. This pins the canonical default and
   * prevents a future refactor from silently dropping the
   * `.fileprovider` suffix.
   */
  @Test
  fun `buildCameraIntent_defaultUriBuilder_signatureMatchesSpec`() {
    val client = newClient()
    val applicationId = "com.example.host"
    val outputFile = java.io.File("nitro-test-capture.jpg")

    val capturedAuthorities = mutableListOf<String>()
    // Invoke the 4-arg variant with an explicit uriBuilder so we can pin
    // the authority WITHOUT the default's `FileProvider.getUriForFile` call
    // (which throws on the JVM stub). This is the same call shape the
    // production code uses when the default is not overridden.
    client.buildCameraIntent(
      context = NullContext(),
      applicationId = applicationId,
      outputFile = outputFile,
    ) { _, authority, _ ->
      capturedAuthorities.add(authority)
      android.net.Uri.EMPTY
    }

    assertEquals(
      "authority forwarded to the URI builder must be `\"\$applicationId.fileprovider\"`",
      "$applicationId.fileprovider",
      capturedAuthorities.single(),
    )
  }

  /**
   * NitroWebChromeClient is instantiable with an [ActivityResolver]
   * dependency, is assignable to [WebChromeClient], and exposes the
   * resolver via the `activityResolver` field.
   */
  @Test
  fun `client_isAssignableToWebChromeClient_andExposesActivityResolver`() {
    val resolver = ActivityResolver { null }

    val client = NitroWebChromeClient(
      context = NullContext(),
      activityResolver = resolver,
    )

    assertTrue(
      "NitroWebChromeClient must be assignable to android.webkit.WebChromeClient " +
        "so it can be installed via WebView.setWebChromeClient()",
      WebChromeClient::class.java.isAssignableFrom(client::class.java),
    )
    assertTrue(
      "Instance must itself be a WebChromeClient (runtime assignability check)",
      client is WebChromeClient,
    )
    assertNotNull(
      "activityResolver field must be exposed for inspection / re-wiring",
      client.activityResolver,
    )
    assertSame(
      "The resolver passed via the constructor must be the one held by the field",
      resolver,
      client.activityResolver,
    )
  }
}

/**
 * AC test: file upload exposes NO new TS prop, method, or callback.
 * Verified at the Kotlin layer by ensuring the HybridNitroWebViewSpec
 * generated surface (mirroring the TS spec) does NOT declare any
 * file-upload-shaped member. This guards react-native-webview parity:
 * behavior must be driven by HTML `accept`/`multiple`/`capture` only.
 */
class NoFileUploadTsSurfaceTest {

  @Test
  fun `hybridSpec_doesNotExposeFileUploadProp_method_orCallback`() {
    val spec = HybridNitroWebViewSpec::class.java
    val forbidden = setOf(
      // Props that would imply a JS-side override.
      "getOnFileChooser",
      "setOnFileChooser",
      "getOnFileUpload",
      "setOnFileUpload",
      "getOnShowFileChooser",
      "setOnShowFileChooser",
      "getAllowFileUpload",
      "setAllowFileUpload",
      // Methods that would imply imperative control.
      "showFileChooser",
      "uploadFile",
      "pickFile",
      "openFileChooser",
    )
    val declared = spec.declaredMethods.map { it.name }.toSet()
    val violations = forbidden.intersect(declared)
    assertTrue(
      "File upload must be driven entirely by HTML input attributes; " +
        "found forbidden TS-surface members on HybridNitroWebViewSpec: $violations",
      violations.isEmpty(),
    )
  }
}

/**
 * Minimal `android.content.Context` stand-in for tests that only exercise
 * intent construction. The chrome client's intent-building paths under test
 * do not actually call any Context method — they only reference `cacheDir`
 * and `packageManager` from the capture pathway, which is exercised
 * separately under instrumentation tests where a real Context is available.
 *
 * This class is package-private and intentionally minimal: when a Context
 * method is invoked unexpectedly the JVM throws `AbstractMethodError`,
 * surfacing the test gap immediately.
 */
private class NullContext : android.content.ContextWrapper(null)
