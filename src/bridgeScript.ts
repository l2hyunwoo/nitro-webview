/**
 * Identifier this bridge installs on `window`. Must match the registered
 * handler name on both platforms (iOS `WKUserContentController.add` /
 * Android `addJavascriptInterface`).
 */
export const BRIDGE_NAME: 'ReactNativeWebView' = 'ReactNativeWebView'

/**
 * Android JavascriptInterface name for the raw native bridge. Distinct from
 * `BRIDGE_NAME` so the JS shim can string-coerce arguments before
 * forwarding.
 */
export const ANDROID_NATIVE_BRIDGE_NAME: 'ReactNativeWebViewNative' =
  'ReactNativeWebViewNative'

export type BridgePlatform = 'ios' | 'android'

export interface WebKitMessageHandler {
  postMessage(data: unknown): void
}

export interface AndroidNativeBridge {
  postMessage(data: string): void
}

/**
 * Build the literal JavaScript source string for the injected bridge.
 *
 * The script:
 *   - Defines `window.ReactNativeWebView` (idempotent — preserves any
 *     pre-existing object the page author installed).
 *   - Defines `window.ReactNativeWebView.postMessage(data)` (also
 *     idempotent — never overwrites an existing function).
 *   - String-coerces `data` before routing.
 *   - Routes to the platform-native handler (WebKit messageHandler on iOS,
 *     `ReactNativeWebViewNative` on Android).
 *   - Swallows the call when no native sink is wired (no page-side throw).
 */
export function buildBridgeScript(platform: BridgePlatform): string {
  const routeToNative =
    platform === 'ios'
      ? `
        // routes to window.webkit.messageHandlers.${BRIDGE_NAME}
        var __wk = window.webkit;
        if (__wk && __wk.messageHandlers && __wk.messageHandlers.${BRIDGE_NAME}) {
          __wk.messageHandlers.${BRIDGE_NAME}.postMessage(__payload);
        }`
      : `
        var __native = window.${ANDROID_NATIVE_BRIDGE_NAME};
        if (__native && typeof __native.postMessage === 'function') {
          __native.postMessage(__payload);
        }`

  // IIFE-wrapped so helper locals never leak onto `window`.
  return `;(function () {
  var __bridge = window.${BRIDGE_NAME};
  if (__bridge && typeof __bridge.postMessage === 'function') {
    return;
  }

  if (!__bridge) {
    __bridge = {};
    window.${BRIDGE_NAME} = __bridge;
  }

  __bridge.postMessage = function (data) {
    var __payload = (typeof data === 'string') ? data : String(data);
${routeToNative}
  };
})();`
}

/**
 * Escape a string for safe embedding inside a JavaScript *source* string.
 *
 * `JSON.stringify` handles quotes, backslashes, newlines, and control chars,
 * and produces a valid double-quoted JS string literal for them. BUT it
 * leaves U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) RAW: they
 * are legal in JSON yet illegal *unescaped* inside a JS string literal on
 * pre-ES2019 engines (older Android System WebView / older iOS JSC will
 * throw a SyntaxError when the injected statement is parsed). We post-escape
 * those two code points so the emitted statement always parses.
 *
 * Returns a quoted JS string literal (includes the surrounding quotes).
 */
export function encodeJsStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Build the one-shot JS statement that delivers a native→web message as a
 * DOM `message` event, matching react-native-webview's drop-in contract.
 *
 *   - iOS     → dispatch on `window`   (RNCWebViewImpl.m:1113)
 *   - Android → dispatch on `document` (RNCWebViewManagerImpl.kt:335)
 *
 * `event.data` is `message` verbatim. The statement is self-contained and
 * fire-and-forget; the caller evaluates it with no completion handler.
 */
export function buildPostMessageScript(
  platform: BridgePlatform,
  message: string
): string {
  const target = platform === 'ios' ? 'window' : 'document'
  const data = encodeJsStringLiteral(message)
  return `${target}.dispatchEvent(new MessageEvent('message',{data:${data}}));`
}

/**
 * Reserved discriminator key for blob-download payloads posted back through
 * the existing `ReactNativeWebView.postMessage` bridge. A native message sink
 * peeks for this key before treating a payload as a normal `onMessage` string
 * — see {@linkcode parseBlobEnvelope}. Chosen to be collision-proof with a
 * real string payload (the `{"__nitro_blob__"` prefix).
 */
export const BLOB_ENVELOPE_KEY: '__nitro_blob__' = '__nitro_blob__'

/** Fields carried inside a {@linkcode BlobDownloadEnvelope}. */
export interface BlobDownloadPayload {
  /** The original `blob:` URL the download was requested for. */
  url: string
  /** `"data:<mime>;base64,<...>"` — the blob read to a data URL. */
  dataUrl: string
  /** MIME type from `Blob.type` (may be empty). */
  mimeType: string
  /** Best-effort suggested file name (native-derived; usually junk). */
  fileName: string
  /** Byte length from `Blob.size` (0 when unknown). */
  size: number
}

/** Reserved envelope shape wrapping a {@linkcode BlobDownloadPayload}. */
export interface BlobDownloadEnvelope {
  [BLOB_ENVELOPE_KEY]: BlobDownloadPayload
}

/**
 * Build the JS source injected into the page to resolve a `blob:` URL that
 * the native download hook cannot fetch (blobs live only in the web context).
 *
 * Reads the blob in-page via `fetch(blobUrl) → .blob() → FileReader
 * .readAsDataURL` and posts a reserved {@linkcode BlobDownloadEnvelope}
 * through the EXISTING `ReactNativeWebView.postMessage` bridge. The native
 * side demuxes it (see {@linkcode parseBlobEnvelope}) and emits
 * `onFileDownload`. No new bridge name is introduced.
 *
 * `suggestedName` is native-derived (Android: `guessFileName` off the blob
 * URL — usually junk). The page's real download name is not recoverable from
 * a bare `blob:` URL, so callers treat `fileName` as best-effort.
 *
 * This path is Android-only: iOS uses `WKDownloadDelegate` to stream the blob
 * to a temp file natively (no base64-over-bridge).
 */
export function buildBlobReaderScript(
  blobUrl: string,
  suggestedName: string
): string {
  // JSON-encode inputs so quotes/backslashes in the URL can't break out of
  // the source-string literal.
  const urlLit = JSON.stringify(blobUrl)
  const nameLit = JSON.stringify(suggestedName)
  const keyLit = JSON.stringify(BLOB_ENVELOPE_KEY)
  // IIFE-wrapped; every failure path swallows so the page never throws.
  return `;(function () {
  try {
    fetch(${urlLit}).then(function (r) { return r.blob(); }).then(function (b) {
      var reader = new FileReader();
      reader.onloadend = function () {
        var dataUrl = String(reader.result || '');
        var envelope = {};
        envelope[${keyLit}] = {
          url: ${urlLit},
          dataUrl: dataUrl,
          mimeType: b.type || '',
          fileName: ${nameLit},
          size: b.size || 0
        };
        var br = window.${BRIDGE_NAME};
        if (br && typeof br.postMessage === 'function') {
          br.postMessage(JSON.stringify(envelope));
        }
      };
      reader.readAsDataURL(b);
    })["catch"](function () { /* blob gone / cross-origin: swallow */ });
  } catch (e) { /* no fetch/FileReader: swallow, no page throw */ }
})();`
}

/**
 * Parse a raw `postMessage` string and return the blob payload, or `null`
 * when the string is a normal `onMessage` payload. A cheap prefix peek runs
 * before the `JSON.parse` cost so ordinary payloads are forwarded untouched.
 * This is the single canonical demux, ported verbatim into each native sink.
 */
export function parseBlobEnvelope(raw: string): BlobDownloadPayload | null {
  if (typeof raw !== 'string') return null
  // Prefix peek: only a payload literally starting with the reserved key can
  // be ours. A user string that merely contains the key elsewhere is not.
  if (raw.indexOf(`{"${BLOB_ENVELOPE_KEY}"`) !== 0) return null
  try {
    const obj = JSON.parse(raw) as Partial<BlobDownloadEnvelope>
    const b = obj?.[BLOB_ENVELOPE_KEY]
    if (!b || typeof b.url !== 'string' || typeof b.dataUrl !== 'string') {
      return null
    }
    return {
      url: b.url,
      dataUrl: b.dataUrl,
      mimeType: typeof b.mimeType === 'string' ? b.mimeType : '',
      fileName: typeof b.fileName === 'string' ? b.fileName : '',
      size: typeof b.size === 'number' ? b.size : 0,
    }
  } catch {
    return null
  }
}

/**
 * Sandbox shape for evaluating the iOS bridge script.
 */
export interface IosBridgeSandbox {
  webkit?: {
    messageHandlers?: {
      [BRIDGE_NAME]?: WebKitMessageHandler
    }
  }
  [BRIDGE_NAME]?: {
    postMessage?: (data: unknown) => void
    [key: string]: unknown
  }
}

/**
 * Sandbox shape for evaluating the Android bridge script.
 */
export interface AndroidBridgeSandbox {
  [ANDROID_NATIVE_BRIDGE_NAME]?: AndroidNativeBridge
  [BRIDGE_NAME]?: {
    postMessage?: (data: unknown) => void
    [key: string]: unknown
  }
}

/**
 * Evaluate the bridge script for `platform` against `sandbox`. `window` is
 * aliased to `sandbox` inside the script so the install mutates the
 * sandbox rather than the host's globals.
 */
export function evaluateBridgeScript<
  S extends IosBridgeSandbox | AndroidBridgeSandbox,
>(platform: BridgePlatform, sandbox: S): void {
  const source = buildBridgeScript(platform)
  // eslint-disable-next-line no-new-func
  const evaluate = new Function('window', source) as (window: S) => void
  evaluate(sandbox)
}
