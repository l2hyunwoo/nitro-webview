import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from 'react-native-nitro-modules'

import type { WebViewSource } from './WebViewSource'

export type { HtmlSource, UriSource, WebViewSource } from './WebViewSource'

/** Read-only navigation state surfaced to JS via callbacks. */
export interface WebViewNavigationState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** Payload of load lifecycle events (onLoadStart / onLoadEnd). */
export interface WebViewLoadEvent {
  nativeEvent: WebViewNavigationState
}

/** Inner payload of `WebViewMessageEvent.nativeEvent`. */
export interface WebViewMessageNativeEvent {
  data: string
  url: string
}

/**
 * Payload of an `onMessage` event. `nativeEvent.data` is the literal string
 * passed to `window.ReactNativeWebView.postMessage(...)` inside the page.
 */
export interface WebViewMessageEvent {
  nativeEvent: WebViewMessageNativeEvent
}

/**
 * Payload of an `onError` event emitted when navigation fails on either
 * platform.
 *
 * Field mapping:
 *   - `code`        — `NSError.code` (iOS) / `WebResourceError.getErrorCode()` (Android).
 *   - `description` — `NSError.localizedDescription` (iOS) /
 *                     `WebResourceError.getDescription().toString()` (Android).
 *   - `url`         — Target URL at failure time. Always a string; empty
 *                     when neither the platform error metadata nor the
 *                     delegate had one in hand.
 *   - `domain`      — `NSError.domain` (iOS) / a stable string mirror (Android).
 */
/** Inner payload of `NitroWebViewErrorEvent.nativeEvent`. */
export interface NitroWebViewErrorNativeEvent {
  code: number
  description: string
  url: string
  domain: string
}

export interface NitroWebViewErrorEvent {
  nativeEvent: NitroWebViewErrorNativeEvent
}

/** Alias for {@linkcode NitroWebViewErrorEvent}. */
export type WebViewErrorEvent = NitroWebViewErrorEvent

export interface NitroWebViewProps extends HybridViewProps {
  /**
   * Content source for the WebView.
   * @see {@linkcode WebViewSource}
   */
  source: WebViewSource

  /**
   * Default HTTP headers applied to every main-frame navigation request
   * triggered by a `source` change. Per-request headers supplied via
   * `source.headers` override these on key conflict (case-insensitive on
   * iOS, exact-match on Android — callers should use a single canonical
   * casing per key).
   *
   * Scope and limitations:
   *   - Only applied on main-frame navigation initiated by a `source`
   *     update. Redirects, link clicks, sub-frames, and sub-resource
   *     requests do not re-apply these headers.
   *   - Changing `defaultHeaders` alone does not trigger a navigation;
   *     update `source` to issue a new request with the new headers.
   *   - Header values are forwarded as-is to the underlying platform
   *     loader (WKWebView `URLRequest` / Android `WebView.loadUrl(url,
   *     additionalHttpHeaders)`).
   */
  defaultHeaders?: Record<string, string>

  /** JavaScript auto-injected on every page load (fire-and-forget). */
  injectedJavaScript?: string

  /** Fired when the WebView begins loading content. */
  onLoadStart?: (event: WebViewLoadEvent) => void

  /** Fired when the WebView finishes loading content. */
  onLoadEnd?: (event: WebViewLoadEvent) => void

  /** Fired when navigation state changes (URL, title, back/forward, loading). */
  onNavigationStateChange?: (state: WebViewNavigationState) => void

  /** Fired when the web page calls `window.ReactNativeWebView.postMessage(...)`. */
  onMessage?: (event: WebViewMessageEvent) => void

  /** Fired when navigation fails on either platform. */
  onError?: (event: NitroWebViewErrorEvent) => void

  /**
   * Fired when the WebView detects a navigation that should be treated as a
   * file download instead of a page load.
   *
   * Detection rules (MVP):
   *   - iOS (WKWebView): in `decidePolicyFor navigationResponse` the policy
   *     resolves to `.cancel` whenever the response is **not** displayable
   *     in the WebView (i.e. `navigationResponse.canShowMIMEType == false`),
   *     and a {@linkcode FileDownloadEvent} is emitted with fields populated
   *     from the `HTTPURLResponse` headers.
   *   - Android (android.webkit.WebView): bound via
   *     `WebView.setDownloadListener` — every `onDownloadStart` invocation
   *     translates directly into a single `onFileDownload` emission.
   *
   * The WebView itself never persists the file to disk: JS is solely
   * responsible for handling the download metadata. Blob URLs (`blob:`)
   * are explicitly out of scope for this MVP and do not surface an event.
   */
  onFileDownload?: (event: FileDownloadEvent) => void
}

export interface NitroWebViewMethods extends HybridViewMethods {
  /** Navigate back in history. */
  goBack(): void
  /** Navigate forward in history. */
  goForward(): void
  /** Reload the current page. */
  reload(): void
  /** Stop loading the current page. */
  stopLoading(): void
  /**
   * Evaluate arbitrary JavaScript inside the WebView and resolve with the
   * serialized string result of the evaluation. On iOS the native side
   * uses `String(describing:)`; on Android the result is the JSON-encoded
   * string from `ValueCallback<String>`. An undefined/nil result surfaces
   * as the empty string.
   */
  evaluateJavaScript(code: string): Promise<string>

  /**
   * Return every cookie the platform's shared cookie store holds for the
   * origin of `url`.
   *
   *   - iOS: queries `WKWebsiteDataStore.default().httpCookieStore` and
   *     filters by host suffix match against `url`.
   *   - Android: parses the value returned by
   *     `CookieManager.getInstance().getCookie(url)` into individual
   *     `Cookie` objects (name/value only; `httpOnly`, `secure`, `expires`,
   *     `domain`, and `path` are not recoverable from the document cookie
   *     header on Android).
   *
   * Resolves with an empty array when no cookies are stored for the origin.
   */
  getCookies(url: string): Promise<Cookie[]>

  /**
   * Persist a single cookie into the platform's shared cookie store. `url`
   * scopes the cookie and is also used to derive the default `domain`/`path`
   * when those fields are omitted from `cookie`.
   *
   *   - iOS: builds an `HTTPCookie` via `HTTPCookie(properties:)` and calls
   *     `WKWebsiteDataStore.default().httpCookieStore.setCookie(_:)`.
   *   - Android: serialises `cookie` into a `Set-Cookie`-style string and
   *     calls `CookieManager.getInstance().setCookie(url, value)` followed
   *     by `flush()`.
   */
  setCookie(url: string, cookie: Cookie): Promise<void>

  /**
   * Remove every cookie from the platform's shared cookie store.
   *   - iOS: iterates `WKHTTPCookieStore.allCookies()` and removes each
   *     entry via `delete(_:)`.
   *   - Android: calls `CookieManager.getInstance().removeAllCookies(null)`
   *     followed by `flush()`.
   *
   * The promise resolves only after the platform reports completion.
   */
  clearCookies(): Promise<void>
}

export type NitroWebView = HybridView<NitroWebViewProps, NitroWebViewMethods>

/**
 * Structured cookie object exchanged across the JS/native boundary.
 *
 * Field semantics:
 *   - `name`     — Cookie name. Required.
 *   - `value`    — Cookie value. Required.
 *   - `domain`   — Cookie domain (e.g. `.example.com`). Optional; when
 *                  omitted the platform derives it from the supplied URL.
 *   - `path`     — Cookie path (e.g. `/`). Optional; defaults to `/`.
 *   - `expires`  — Expiry as milliseconds since the Unix epoch
 *                  (`Date.now()`-compatible). Optional; omitted means a
 *                  session cookie. Encoded as a JS `number` for Nitro
 *                  codegen compatibility (no `Date` / `bigint`).
 *   - `secure`   — When true, restrict to HTTPS. Optional; default false.
 *   - `httpOnly` — When true, hide from JavaScript `document.cookie`.
 *                  Optional; default false.
 */
export interface Cookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  secure?: boolean
  httpOnly?: boolean
}

/**
 * Metadata describing a file download intercepted by the WebView before the
 * native client commits to fetching/saving any bytes. Surfaced to JS via the
 * `onFileDownload` prop. The WebView itself never auto-saves on either
 * platform — JS decides what to do with the URL.
 *
 * Field semantics:
 *   - `url`           — Absolute download URL. Required. Always a remote
 *                       URL (http/https). Blob URLs are out of scope.
 *   - `mimeType`      — MIME type reported by the platform. Optional;
 *                       absent when neither the navigation response nor the
 *                       Android `DownloadListener` provided one.
 *   - `fileName`      — Suggested file name. Optional. On iOS derived from
 *                       `URLResponse.suggestedFilename`; on Android derived
 *                       from `Content-Disposition` via
 *                       `DownloadUtils.guessFileName` (from
 *                       `org.mozilla.components:support-utils`).
 *   - `contentLength` — Reported byte length. Optional; `-1` or absent when
 *                       the platform did not supply a length.
 *   - `userAgent`     — User agent associated with the download (Android
 *                       `DownloadListener` parameter). Optional; typically
 *                       absent on iOS.
 */
export interface FileDownload {
  url: string
  mimeType?: string
  fileName?: string
  contentLength?: number
  userAgent?: string
}

/**
 * React-Native-style event wrapper for {@linkcode FileDownload}. The native
 * payload is delivered under `nativeEvent` to mirror the shape of other
 * NitroWebView events (`onLoadStart`, `onLoadEnd`, `onMessage`, `onError`).
 */
export interface FileDownloadEvent {
  nativeEvent: FileDownload
}
