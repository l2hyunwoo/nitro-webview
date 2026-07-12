import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from 'react-native-nitro-modules'

import type { WebViewSource } from './WebViewSource'

export type { HtmlSource, UriSource, WebViewSource } from './WebViewSource'

/**
 * Enumerates the navigation kinds surfaced to JS through the
 * {@linkcode NitroWebViewProps.onShouldStartLoadWithRequest} hook. Mirrors
 * the string-literal union exposed by react-native-webview so existing RNW
 * call-sites compile unchanged.
 *
 * Platform mapping:
 *   - iOS (WKWebView): derived from `WKNavigationAction.navigationType`
 *     (`.linkActivated` → `'click'`, `.formSubmitted` → `'formsubmit'`,
 *     `.backForward` → `'backforward'`, `.reload` → `'reload'`,
 *     `.formResubmitted` → `'formresubmit'`, `.other` → `'other'`).
 *   - Android (WebViewClient.shouldOverrideUrlLoading): always `'other'`
 *     because Android does not surface a navigation-type discriminator at
 *     interception time.
 */
export type WebViewNavigationType =
  | 'click'
  | 'formsubmit'
  | 'backforward'
  | 'reload'
  | 'formresubmit'
  | 'other'

/**
 * Payload delivered to {@linkcode NitroWebViewProps.onShouldStartLoadWithRequest}
 * before the platform commits to a navigation.
 *
 * The handler returns `Promise<boolean>` — resolve with `true` to allow the
 * navigation, `false` to silently cancel it. Unlike react-native-webview the
 * payload does NOT include a `lockIdentifier`: Nitro's Promise return value
 * replaces RNW's round-trip through `shouldStartLoadWithLockIdentifier`.
 *
 * Optional iOS-only fields:
 *   - `mainDocumentURL` — `WKNavigationAction.request.mainDocumentURL`.
 *   - `isTopFrame`      — true when the navigation targets the main frame
 *                         (derived from `targetFrame?.isMainFrame`).
 *   - `hasTargetFrame`  — true when `WKNavigationAction.targetFrame` is not
 *                         nil (a `target=_blank` / new-window navigation
 *                         surfaces as `false`).
 *
 * Android leaves all three optional fields `undefined` because
 * `WebViewClient.shouldOverrideUrlLoading` does not expose them.
 */
export interface ShouldStartLoadRequest {
  /** Absolute URL the WebView is about to navigate to. */
  url: string
  /** Navigation kind. Always `'other'` on Android. */
  navigationType: WebViewNavigationType
  /** iOS-only: main-document URL associated with the navigation. */
  mainDocumentURL?: string
  /** iOS-only: true when the navigation targets the main frame. */
  isTopFrame?: boolean
  /**
   * iOS-only: true when the navigation has a target frame (false for
   * `target=_blank` / new-window navigations).
   */
  hasTargetFrame?: boolean
}

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

  /**
   * Overrides the User-Agent header for every request issued by the
   * WebView, including main-frame navigation, sub-frames, and
   * sub-resource fetches. Leaving this unset (or setting it to
   * `undefined` / empty string) keeps the platform default WebKit /
   * Chromium UA string.
   *
   * Forwarded to `WKWebView.customUserAgent` on iOS and
   * `WebSettings.userAgentString` on Android. Both platforms apply the
   * value immediately — subsequent navigations use it without
   * requiring a `source` update.
   */
  userAgent?: string

  /**
   * Enable JavaScript execution. Defaults to `true` (the file chooser needs
   * it; react-native-webview also defaults JS on).
   *
   *   - iOS (WKWebView): NO-OP. `WKPreferences.javaScriptEnabled` is only
   *     read when `WKWebView` is constructed, but Nitro delivers props
   *     strictly after `init()` runs - the view is always built with
   *     WebKit's default (JS on) before this prop's value is known. There is
   *     currently no way to honor this prop on iOS, on any render.
   *   - Android (WebSettings): `WebSettings.javaScriptEnabled`, mutable
   *     anytime.
   *
   * Turning JS off disables the `window.ReactNativeWebView` message bridge,
   * `injectedJavaScript`, and the `<input type="file">` chooser.
   */
  javaScriptEnabled?: boolean

  /**
   * Enable DOM storage (`localStorage` / `sessionStorage`). Defaults to
   * `true`.
   *
   *   - Android (WebSettings): `WebSettings.domStorageEnabled`, mutable.
   *   - iOS (WKWebView): always on, no toggle - accepted for cross-platform
   *     source parity and ignored (no-op).
   */
  domStorageEnabled?: boolean

  /**
   * Enable the HTTP resource cache.
   *
   *   - Android (WebSettings): `true` → `WebSettings.cacheMode =
   *     LOAD_DEFAULT`; `false` → `LOAD_NO_CACHE`. Mutable anytime.
   *   - iOS (WKWebView): consumed as `URLRequest.cachePolicy` on the next
   *     `source`-triggered navigation - `false` uses
   *     `.reloadIgnoringLocalCacheData`, otherwise `.useProtocolCachePolicy`.
   *     WKWebView has no global cache switch, so this only affects
   *     `source`-initiated loads.
   */
  cacheEnabled?: boolean

  /**
   * Non-persistent (incognito / private browsing) data store: cache and DOM
   * storage live only in memory. Defaults to `false`.
   *
   *   - iOS (WKWebView): NO-OP. `WKWebViewConfiguration.websiteDataStore`
   *     would need `.nonPersistent()` at construction, but Nitro delivers
   *     props strictly after `init()` runs - the view is always built with
   *     the default persistent store before this prop's value is known.
   *     There is currently no way to honor this prop on iOS, on any render
   *     (react-native-webview has the same limitation; there is no
   *     supported way to switch data stores post-init without a full
   *     remount, which Nitro's view lifecycle does not expose either).
   *   - Android (WebSettings/CookieManager): there is no first-class
   *     incognito mode. Cookies written through the cookie API remain
   *     process-global, so full data isolation is NOT guaranteed on Android.
   */
  incognito?: boolean

  /**
   * iOS-only. Enable user scrolling of the WebView contents. Defaults to
   * `true`.
   *
   *   - iOS (WKWebView): `webView.scrollView.isScrollEnabled`, mutable.
   *   - Android: no-op. react-native-webview does not implement scroll
   *     disabling on Android (an `OnTouchListener` that ate touch-move
   *     events would regress link taps / the file chooser), so this prop is
   *     accepted for source parity and ignored there.
   */
  scrollEnabled?: boolean

  /**
   * iOS-only. Control the bounce (rubber-band) effect when scrolling past
   * the content edges. Defaults to `true`.
   *
   *   - iOS (WKWebView): `webView.scrollView.bounces`, mutable.
   *   - Android: no-op (Android WebView uses overscroll glow, not bounce).
   */
  bounces?: boolean

  /**
   * Android-only. Legacy overview-mode / wide-viewport scaling. Defaults to
   * `false`.
   *
   *   - Android (WebSettings): sets both `WebSettings.loadWithOverviewMode`
   *     and `WebSettings.useWideViewPort` to the prop value.
   *   - iOS (WKWebView): no-op - WKWebView honors the page's own
   *     `<meta name="viewport">` and exposes no global scale toggle.
   */
  scalesPageToFit?: boolean

  /**
   * Require a user gesture before HTML5 media can play. Defaults to `true`
   * (react-native-webview parity - block autoplay).
   *
   *   - iOS (WKWebView): NO-OP.
   *     `WKWebViewConfiguration.mediaTypesRequiringUserActionForPlayback`
   *     is only read at construction, but Nitro delivers props strictly
   *     after `init()` runs - the view is always built with the default
   *     (`.all`, gesture required) before this prop's value is known. There
   *     is currently no way to honor this prop on iOS, on any render.
   *   - Android (WebSettings): `WebSettings.mediaPlaybackRequiresUserGesture`,
   *     mutable anytime.
   */
  mediaPlaybackRequiresUserAction?: boolean

  /**
   * iOS-only. Play HTML5 video inline instead of forcing the native
   * fullscreen player. Defaults to `false` (WKWebView default).
   *
   *   - iOS (WKWebView): NO-OP.
   *     `WKWebViewConfiguration.allowsInlineMediaPlayback` is only read at
   *     construction, but Nitro delivers props strictly after `init()` runs
   *     - the view is always built with the default (`false`, fullscreen
   *     player) before this prop's value is known. There is currently no
   *     way to honor this prop on iOS, on any render.
   *   - Android: no-op (Android WebView already plays video inline).
   */
  allowsInlineMediaPlayback?: boolean

  /**
   * iOS-only. Enable the horizontal swipe gestures that navigate
   * back/forward in history. Defaults to `false` (WKWebView default).
   *
   *   - iOS (WKWebView): `webView.allowsBackForwardNavigationGestures`,
   *     mutable anytime.
   *   - Android: no-op (no system back/forward swipe on Android WebView).
   */
  allowsBackForwardNavigationGestures?: boolean

  /**
   * Android-only. Accept third-party (cross-site) cookies for this WebView.
   *
   *   - Android (CookieManager): `CookieManager.setAcceptThirdPartyCookies(
   *     webView, value)` - scoped to THIS WebView, mutable anytime.
   *   - iOS (WKWebView): no-op - the third-party cookie policy is governed
   *     by the website data store / Intelligent Tracking Prevention, not a
   *     per-WebView boolean.
   */
  thirdPartyCookiesEnabled?: boolean

  /**
   * iOS-only. Share the app-wide `HTTPCookieStorage` cookies (those set by
   * `NSURLSession`) into the WebView's data store at construction, so a
   * login established outside the WebView is visible inside it. Defaults to
   * `false`.
   *
   *   - iOS (WKWebView): NO-OP. Sharing `HTTPCookieStorage` into the data
   *     store would need to happen at construction, but Nitro delivers
   *     props strictly after `init()` runs - the view is always built
   *     before this prop's value is known. There is currently no way to
   *     honor this prop on iOS, on any render.
   *   - Android: no-op - Android WebView already shares one process-wide
   *     `CookieManager`; there is nothing to opt into.
   */
  sharedCookiesEnabled?: boolean

  /** JavaScript auto-injected on every page load (fire-and-forget). */
  injectedJavaScript?: string

  /**
   * JavaScript injected **before** the page's own content/scripts run, on
   * every main-frame load (fire-and-forget). Use this for shims a page
   * expects to exist at startup (feature detection, `window` globals).
   * `injectedJavaScript` (above) runs at document-END instead.
   *
   * Timing guarantee (differs by platform — read carefully):
   *   - iOS (WKWebView): injected as a `WKUserScript` with
   *     `injectionTime = .atDocumentStart`, `forMainFrameOnly = true`.
   *     WebKit runs it after the document element exists but BEFORE any
   *     page script — a hard ordering guarantee.
   *   - Android (android.webkit.WebView): when the device's WebView supports
   *     the `DOCUMENT_START_SCRIPT` feature, injected via
   *     `WebViewCompat.addDocumentStartJavaScript` before `loadUrl` — the
   *     same before-any-page-script guarantee as iOS. On older WebViews
   *     lacking that feature it falls back to `WebView.evaluateJavascript`
   *     inside `WebViewClient.onPageStarted`, which is "early enough" for
   *     shim installation in practice but is NOT a strict
   *     before-first-script guarantee — a page whose very first inline
   *     `<script>` runs synchronously during initial parse can race it.
   *
   * Applied to the main frame only on both platforms. Changing this prop
   * takes effect on the next navigation (it is not re-run against the
   * currently-loaded page).
   */
  injectedJavaScriptBeforeContentLoaded?: string

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
   * Navigation-interception hook. Fired before the WebView commits to a
   * navigation. Return `true` to allow the navigation, `false` to silently
   * cancel it. JS implementations may be `async` — the bridge transparently
   * awaits any returned thenable before applying the decision, so the spec
   * declares the synchronous return type while still admitting an async
   * implementation.
   *
   *   - iOS (WKWebView): wired through
   *     `webView(_:decidePolicyFor:decisionHandler:)`. The native
   *     `decisionHandler` is stashed in an in-memory map keyed by request and
   *     resolved when the JS handler's return value settles. No timeout — the
   *     handler stays stashed indefinitely until JS resolves (mirrors
   *     react-native-webview).
   *   - Android (WebViewClient): wired through
   *     `shouldOverrideUrlLoading(WebView, WebResourceRequest)`. The native
   *     side blocks on a `synchronized.wait` with a 250 ms window. When JS
   *     resolves inside the window, its boolean determines the return value.
   *     When the window elapses without a resolution the navigation defaults
   *     to allow (mirrors RNW's
   *     `SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS`).
   *
   * When the prop is unset every navigation is allowed (allow-all default).
   * Blocked navigations are silently cancelled — no new event is emitted
   * (`onError` stays scoped to network / SSL failures).
   *
   * Out of scope for the MVP: `history.pushState` interception, iframe
   * navigation, `target=_blank` / new-window handling, and per-request
   * `originWhitelist` override.
   */
  onShouldStartLoadWithRequest?: (event: ShouldStartLoadRequest) => boolean

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

  /**
   * Fired when the WebView receives an HTTP error status (4xx/5xx) for a
   * **main-frame** navigation. Sub-resource failures (images, scripts,
   * iframes) never surface here — Android's `onReceivedHttpError` fires per
   * sub-resource and is filtered to main-frame only.
   *
   * Disjoint from {@linkcode onError}: `onError` covers transport-level
   * failures (DNS/TLS/reset/timeout) which carry no HTTP status, while
   * `onHttpError` covers HTTP status codes from a response the server did
   * send. The two are mutually exclusive by construction.
   *
   *   - iOS (WKWebView): read from `HTTPURLResponse.statusCode` inside
   *     `decidePolicyFor navigationResponse`. A server-rendered 404 body
   *     still displays — the event fires but the navigation is not
   *     cancelled.
   *   - Android (WebViewClient): `onReceivedHttpError`, filtered to
   *     `request.isForMainFrame`.
   *
   * May fire more than once per navigation (redirect hops); it is NOT
   * deduped natively and does not suppress `onLoadEnd` / `onPageFinished`.
   */
  onHttpError?: (event: NitroWebViewHttpErrorEvent) => void

  /**
   * Fired when the WebView's renderer process is gone — a crash or an OS
   * reclaim leaving a blank page with no built-in recovery. JS typically
   * responds by calling {@linkcode NitroWebViewMethods.reload} or remounting.
   *
   *   - Android (`onRenderProcessGone`, API 26+): `nativeEvent.didCrash`
   *     mirrors `RenderProcessGoneDetail.didCrash()` (`false` = the OS
   *     reclaimed the renderer to free memory, not a crash). The native side
   *     unconditionally returns `true` so the host app survives. API < 26
   *     never emits.
   *   - iOS (`webViewWebContentProcessDidTerminate`): `nativeEvent.didCrash`
   *     is always `undefined` — WebKit exposes no crash-vs-reclaim
   *     discriminator. Fires on the main thread.
   */
  onRenderProcessGone?: (event: NitroWebViewRenderProcessGoneEvent) => void

  /**
   * Fired continuously as the WebView scrolls. High-frequency and NOT
   * throttled natively (react-native-webview parity) — throttle in JS if
   * needed. NOT deduped: every scroll tick is a distinct event.
   *
   *   - iOS (`UIScrollViewDelegate.scrollViewDidScroll`): all fields
   *     populated (`contentOffset`, `contentSize`, `contentInset`,
   *     `layoutMeasurement`, `zoomScale`).
   *   - Android (`View.OnScrollChangeListener`): only `contentOffset` is
   *     populated; `contentSize` is a zero point and the iOS-only fields
   *     are `undefined`. Android's `computeVerticalScrollRange()` /
   *     `computeHorizontalScrollRange()` are protected and unreachable from
   *     the listener lambda without subclassing `WebView`, which this
   *     library avoids everywhere.
   */
  onScroll?: (event: NitroWebViewScrollEvent) => void
}

/** A 2D point exchanged across the JS/native boundary (scroll geometry). */
export interface WebViewPoint {
  x: number
  y: number
}

/**
 * Inner payload of {@linkcode NitroWebViewHttpErrorEvent}.
 *
 * Field mapping:
 *   - `statusCode`  — `HTTPURLResponse.statusCode` (iOS) /
 *                     `WebResourceResponse.getStatusCode()` (Android).
 *   - `url`         — Failing URL. `navigationResponse.response.url` (iOS) /
 *                     `WebResourceRequest.getUrl()` (Android).
 *   - `description` — Human-readable reason. `HTTPURLResponse
 *                     .localizedString(forStatusCode:)` (iOS) /
 *                     `WebResourceResponse.getReasonPhrase()` (Android).
 */
export interface NitroWebViewHttpErrorNativeEvent {
  statusCode: number
  url: string
  description: string
}

export interface NitroWebViewHttpErrorEvent {
  nativeEvent: NitroWebViewHttpErrorNativeEvent
}

/**
 * Inner payload of {@linkcode NitroWebViewRenderProcessGoneEvent}.
 * `didCrash` is Android-only (`RenderProcessGoneDetail.didCrash()`); it is
 * always `undefined` on iOS.
 */
export interface NitroWebViewRenderProcessGoneNativeEvent {
  didCrash?: boolean
}

export interface NitroWebViewRenderProcessGoneEvent {
  nativeEvent: NitroWebViewRenderProcessGoneNativeEvent
}

/**
 * Inner payload of {@linkcode NitroWebViewScrollEvent}.
 *
 *   - `contentOffset`     — current scroll position (both platforms).
 *   - `contentSize`       — scrollable content size. iOS: real value.
 *                           Android: zero point (unreachable without
 *                           subclassing WebView).
 *   - `contentInset`      — iOS-only; `undefined` on Android.
 *   - `layoutMeasurement` — iOS-only viewport size; `undefined` on Android.
 *   - `zoomScale`         — iOS-only; `undefined` on Android.
 */
export interface NitroWebViewScrollNativeEvent {
  contentOffset: WebViewPoint
  contentSize: WebViewPoint
  contentInset?: WebViewPoint
  layoutMeasurement?: WebViewPoint
  zoomScale?: number
}

export interface NitroWebViewScrollEvent {
  nativeEvent: NitroWebViewScrollNativeEvent
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
   * Fire-and-forget JavaScript execution inside the WebView's main frame.
   * Unlike {@linkcode evaluateJavaScript}, this returns nothing and never
   * awaits a result — use it when you only need a side effect.
   *
   *   - iOS: `WKWebView.evaluateJavaScript(code, completionHandler: nil)`.
   *   - Android: `WebView.evaluateJavascript(code, null)`.
   *
   * `code` runs in the page's JS context at call time; if no page is
   * loaded yet the call is a no-op. No value, error, or completion signal
   * is surfaced to JS (react-native-webview `injectJavaScript` parity).
   */
  injectJavaScript(code: string): void

  /**
   * Push a string from native INTO the page. The page receives it as a
   * DOM `message` event whose `event.data` is `data` verbatim.
   *
   * Page-side contract (react-native-webview drop-in — platform-asymmetric,
   * so register on BOTH targets to be portable):
   *   - iOS delivers via `window.dispatchEvent(new MessageEvent('message', {data}))`
   *     → listen with `window.addEventListener('message', e => e.data)`.
   *   - Android delivers via `document.dispatchEvent(new MessageEvent('message', {data}))`
   *     → listen with `document.addEventListener('message', e => e.data)`.
   *
   * Delivery is fire-and-forget and synchronous-at-eval: it dispatches
   * once, immediately. A listener the page registers AFTER this call will
   * NOT receive the message (no buffering / replay). `data` may contain
   * any characters — quotes, newlines, `</script>`, and unicode are
   * escaped safely before injection (see native `postMessage` escaping).
   */
  postMessage(data: string): void

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
