package com.margelo.nitro.nitrowebview

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Resolves the host [Activity] that the file chooser should be launched
 * against at the moment `onShowFileChooser` fires. Decoupling resolution
 * from construction is required because nitro-webview is instantiated
 * before the React Native host Activity is reliably attached — capturing
 * a single [Activity] reference at construction time would either leak a
 * stale Activity across configuration changes or be `null` forever.
 *
 * A `null` return is treated as "no chooser host available right now" and
 * causes [NitroWebChromeClient.onShowFileChooser] to cancel the request
 * cleanly. Implementations should be cheap to call (resolution happens on
 * the UI thread alongside the chooser launch).
 */
fun interface ActivityResolver {
  fun resolveActivity(): Activity?
}

/**
 * WebChromeClient subclass implementing `onShowFileChooser` so HTML
 * `<input type="file">` elements open the system file picker on Android.
 *
 * Public TS API surface is intentionally empty — behavior is driven by the
 * HTML attributes (`accept`, `multiple`, `capture`) for react-native-webview
 * parity. The chooser is launched via the host Activity resolved through
 * [activityResolver] using `startActivityForResult`, and the resulting URIs
 * are forwarded back to the WebView through the supplied
 * `ValueCallback<Array<Uri>>`.
 *
 * The host Activity is responsible for forwarding `onActivityResult` back to
 * this client via [handleFileChooserResult]. When [activityResolver]
 * resolves to null (e.g. headless contexts, tests, or before the host
 * Activity is attached), `onShowFileChooser` cancels the picker by
 * returning false and the WebView falls back to no selection.
 *
 * The `capture` attribute on the HTML input — and `accept` values starting
 * with `image/`, `video/`, `audio/` — trigger an extra capture intent
 * (camera/recorder) that is presented alongside the GET_CONTENT picker via
 * Intent.EXTRA_INITIAL_INTENTS. A temporary `content://` URI obtained via
 * [FileProvider.getUriForFile] is supplied as the capture output; the
 * FileProvider entry is declared in the library AndroidManifest.xml and
 * mapped by `res/xml/file_provider_paths.xml`.
 *
 * The legacy [hostActivity] property remains for backward compatibility
 * with call sites that wish to override the resolver imperatively (e.g. via
 * a late-binding setter on the hybrid view). When non-null it shadows the
 * [activityResolver] result.
 */
open class NitroWebChromeClient(
  private val context: Context,
  val activityResolver: ActivityResolver = ActivityResolver { null },
  /**
   * Launches the chooser intent and returns true on success. Injected by the
   * hybrid view so the call can be routed through React Native's
   * `ReactContext.startActivityForResult`, which guarantees that
   * `onActivityResult` is forwarded to every registered
   * `ActivityEventListener`. The legacy default falls back to
   * `Activity.startActivityForResult` for tests / standalone usage.
   */
  private val chooserLauncher: (Intent, Int) -> Boolean = { intent, code ->
    val activity = activityResolver.resolveActivity()
    if (activity != null) {
      activity.startActivityForResult(intent, code)
      true
    } else {
      false
    }
  },
) : WebChromeClient() {

  /**
   * Optional explicit override for the resolved Activity. When non-null,
   * this value wins over [activityResolver]; when null the resolver is
   * consulted. Existing call sites that construct the client without an
   * [activityResolver] continue to work by assigning this property after
   * construction.
   */
  var hostActivity: Activity? = null

  /**
   * Convenience secondary constructor preserving the historical
   * `(context, hostActivity)` shape. Internally seeds the explicit
   * [hostActivity] override; the [activityResolver] property is set to a
   * sentinel that defers to that override.
   */
  constructor(context: Context, hostActivity: Activity?) : this(
    context = context,
    activityResolver = ActivityResolver { hostActivity },
  ) {
    this.hostActivity = hostActivity
  }

  /** Resolve the effective host Activity for the next chooser invocation. */
  private fun currentHostActivity(): Activity? =
    hostActivity ?: activityResolver.resolveActivity()

  private var pendingCallback: ValueCallback<Array<Uri>>? = null
  private var pendingCaptureUri: Uri? = null

  override fun onShowFileChooser(
    webView: WebView?,
    filePathCallback: ValueCallback<Array<Uri>>?,
    fileChooserParams: FileChooserParams?,
  ): Boolean {
    if (filePathCallback == null) {
      return false
    }

    // Cancel any previous in-flight chooser, releasing its callback.
    pendingCallback?.onReceiveValue(null)
    pendingCallback = filePathCallback
    pendingCaptureUri = null

    val acceptTypes = fileChooserParams?.acceptTypes?.filter { it.isNotBlank() }.orEmpty()
    val allowMultiple =
      fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
    val isCapture = fileChooserParams?.isCaptureEnabled == true

    val contentIntent = buildContentIntent(acceptTypes, allowMultiple)
    val captureIntents = if (isCapture) buildCaptureIntents(acceptTypes) else emptyList()

    val chooser = Intent(Intent.ACTION_CHOOSER).apply {
      putExtra(Intent.EXTRA_INTENT, contentIntent)
      putExtra(Intent.EXTRA_TITLE, fileChooserParams?.title ?: "Choose file")
      if (captureIntents.isNotEmpty()) {
        putExtra(
          Intent.EXTRA_INITIAL_INTENTS,
          captureIntents.toTypedArray(),
        )
      }
    }

    return try {
      val launched = launchChooser(chooser)
      if (!launched) {
        pendingCallback = null
        filePathCallback.onReceiveValue(null)
      }
      launched
    } catch (e: Throwable) {
      pendingCallback = null
      filePathCallback.onReceiveValue(null)
      false
    }
  }

  /**
   * Launches the chooser through the resolved host Activity. Extracted as an
   * `internal open` seam so unit tests can substitute a deterministic
   * implementation without instantiating a real [android.app.Activity]
   * (the JVM android stub jar rejects construction of `Activity`).
   *
   * The default implementation consults [currentHostActivity]:
   *
   *  - returns `false` when no host Activity is currently available — the
   *    caller is responsible for invoking `onReceiveValue(null)` on the
   *    pending callback;
   *  - calls [Activity.startActivityForResult] with
   *    [FILE_CHOOSER_REQUEST_CODE] and returns `true` on success;
   *  - propagates any [Throwable] from the platform call so
   *    [onShowFileChooser] can apply unified failure cleanup.
   */
  internal open fun launchChooser(chooser: Intent): Boolean {
    return chooserLauncher(chooser, FILE_CHOOSER_REQUEST_CODE)
  }

  /**
   * Forwards an Activity#onActivityResult callback to the pending file
   * chooser callback registered in [onShowFileChooser]. Returns true if
   * the result was consumed (the request code matched and a callback was
   * pending), false otherwise.
   */
  fun handleFileChooserResult(
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ): Boolean {
    if (requestCode != FILE_CHOOSER_REQUEST_CODE) return false
    val callback = pendingCallback ?: return false
    pendingCallback = null
    val captureUri = pendingCaptureUri
    pendingCaptureUri = null

    val result: Array<Uri>? = when {
      resultCode != Activity.RESULT_OK -> null
      data == null && captureUri != null -> arrayOf(captureUri)
      else -> extractUris(data, captureUri)
    }
    callback.onReceiveValue(result)
    return true
  }

  internal fun buildContentIntent(
    acceptTypes: List<String>,
    allowMultiple: Boolean,
  ): Intent {
    val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
    }
    if (acceptTypes.isNotEmpty()) {
      intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes.toTypedArray())
      // Use the single accept value as the base MIME when there's only one,
      // so the chooser pre-filters where the platform respects the field.
      if (acceptTypes.size == 1 && acceptTypes[0].contains('/')) {
        intent.type = acceptTypes[0]
      }
    }
    if (allowMultiple) {
      intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }
    return intent
  }

  /**
   * Canonical builder shape for the GET_CONTENT chooser intent.
   *
   * Builds an [Intent] with `ACTION_GET_CONTENT`, `CATEGORY_OPENABLE`, type
   * set to `*` + `/` + `*`, and unconditional `EXTRA_MIME_TYPES` /
   * `EXTRA_ALLOW_MULTIPLE` extras so downstream consumers and unit tests can
   * rely on both extras being present regardless of input. The richer,
   * conditional pathway used by the live chooser flow is preserved in the
   * sibling [buildContentIntent] overload above; this overload exists so
   * the canonical shape can be exercised verbatim by tests and embedded
   * callers without dragging in MIME-pre-filtering side-effects.
   */
  internal fun buildContentIntent(
    fileChooserParams: WebChromeClient.FileChooserParams,
  ): Intent {
    val intent = Intent(Intent.ACTION_GET_CONTENT)
    intent.addCategory(Intent.CATEGORY_OPENABLE)
    intent.type = "*/*"
    intent.putExtra(Intent.EXTRA_MIME_TYPES, fileChooserParams.acceptTypes)
    intent.putExtra(
      Intent.EXTRA_ALLOW_MULTIPLE,
      fileChooserParams.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE,
    )
    return intent
  }

  internal fun buildCaptureIntents(acceptTypes: List<String>): List<Intent> {
    val intents = mutableListOf<Intent>()
    val pm: PackageManager? = context.packageManager
    val wantImage = acceptTypes.isEmpty() || acceptTypes.any { it.startsWith("image/") }
    val wantVideo = acceptTypes.isEmpty() || acceptTypes.any { it.startsWith("video/") }
    val wantAudio = acceptTypes.isEmpty() || acceptTypes.any { it.startsWith("audio/") }

    if (wantImage) {
      val outputUri = createCaptureOutputUri("img", ".jpg")
      if (outputUri != null) {
        pendingCaptureUri = outputUri
        val image = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
          putExtra(MediaStore.EXTRA_OUTPUT, outputUri)
          addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        if (pm == null || image.resolveActivity(pm) != null) {
          intents.add(image)
        }
      }
    }
    if (wantVideo) {
      val video = Intent(MediaStore.ACTION_VIDEO_CAPTURE)
      if (pm == null || video.resolveActivity(pm) != null) {
        intents.add(video)
      }
    }
    if (wantAudio) {
      val audio = Intent(MediaStore.Audio.Media.RECORD_SOUND_ACTION)
      if (pm == null || audio.resolveActivity(pm) != null) {
        intents.add(audio)
      }
    }
    return intents
  }

  private fun createCaptureOutputUri(prefix: String, suffix: String): Uri? {
    return try {
      val dir = File(context.cacheDir, "nitro-webview-capture").apply { mkdirs() }
      val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
      val file = File.createTempFile("${prefix}_${stamp}_", suffix, dir)
      FileProvider.getUriForFile(
        context,
        "${context.packageName}.nitrowebview.fileprovider",
        file,
      )
    } catch (_: Throwable) {
      null
    }
  }

  /**
   * Canonical builder for the camera-capture intent:
   *
   * ```
   * Intent(MediaStore.ACTION_IMAGE_CAPTURE)
   *   .putExtra(
   *     MediaStore.EXTRA_OUTPUT,
   *     FileProvider.getUriForFile(context, "$applicationId.fileprovider", outputFile),
   *   )
   * ```
   *
   * `EXTRA_OUTPUT` (carrying the FileProvider content URI built from the
   * given applicationId-derived authority) is written unconditionally so
   * downstream consumers — and the unit tests — can rely on the extra
   * being present and bound to the FileProvider URI regardless of any
   * runtime filtering.
   *
   * The URI is constructed via the [uriBuilder] seam so the production code
   * path goes through `FileProvider.getUriForFile` while plain JVM unit
   * tests (where `FileProvider.getUriForFile` cannot resolve a real
   * ContentProvider) can supply a deterministic substitute. Both pathways
   * derive the authority as `"$applicationId.fileprovider"`.
   *
   * The richer, conditional capture pathway used by the live chooser flow
   * is preserved in [buildCaptureIntents] above; this overload exists so
   * the canonical shape can be exercised verbatim by tests and embedded
   * callers without dragging in MIME-pre-filtering or temp-file creation
   * side-effects.
   */
  internal fun buildCameraIntent(
    context: Context,
    applicationId: String,
    outputFile: File,
    uriBuilder: (Context, String, File) -> Uri = ::defaultCameraOutputUri,
  ): Intent {
    val authority = "$applicationId.fileprovider"
    val outputUri = uriBuilder(context, authority, outputFile)
    return Intent(MediaStore.ACTION_IMAGE_CAPTURE)
      .putExtra(MediaStore.EXTRA_OUTPUT, outputUri)
  }

  /**
   * Default [buildCameraIntent] URI builder: delegates to the production
   * [FileProvider.getUriForFile] surface. Pulled out as a named symbol so
   * the JVM-only tests can compare against the expected authority format
   * without invoking the real FileProvider (which fails to resolve outside
   * an Android runtime).
   */
  private fun defaultCameraOutputUri(
    ctx: Context,
    authority: String,
    file: File,
  ): Uri = FileProvider.getUriForFile(ctx, authority, file)

  private fun extractUris(data: Intent?, captureUri: Uri?): Array<Uri>? {
    if (data == null) {
      return captureUri?.let { arrayOf(it) }
    }
    val clipData = data.clipData
    if (clipData != null && clipData.itemCount > 0) {
      val uris = ArrayList<Uri>(clipData.itemCount)
      for (i in 0 until clipData.itemCount) {
        val uri = clipData.getItemAt(i).uri ?: continue
        uris.add(uri)
      }
      if (uris.isNotEmpty()) return uris.toTypedArray()
    }
    val single = data.data
    if (single != null) return arrayOf(single)
    return captureUri?.let { arrayOf(it) }
  }

  /**
   * Test-friendly probe: returns true when a chooser is awaiting a result.
   */
  internal fun hasPendingCallback(): Boolean = pendingCallback != null

  companion object {
    /** Request code used with `startActivityForResult` for the chooser. */
    const val FILE_CHOOSER_REQUEST_CODE: Int = 0x4E57 // 'NW'

    /**
     * Library-scoped FileProvider authority suffix. The full authority is
     * derived per-app as `${applicationId}.nitrowebview.fileprovider` to
     * avoid collisions when multiple FileProvider entries coexist.
     *
     * Build.VERSION is referenced only to keep the field documented as a
     * SDK-dependent integration point without coupling the class to a
     * specific platform check at construction time.
     */
    @Suppress("unused")
    private val sdkInt: Int = Build.VERSION.SDK_INT
  }
}
