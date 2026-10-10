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
 * The public handler returns `boolean | Promise<boolean>`: `true` allows the
 * navigation and `false` silently cancels it. The React component settles the
 * result through an internal decision bridge. The payload has no public
 * `lockIdentifier` or decision command.
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
  /**
   * True when the navigation targets the main frame; false for iframe /
   * sub-frame navigations (which now also surface to this handler).
   *
   *   - iOS (WKWebView): derived from `targetFrame?.isMainFrame`. Sub-frame
   *     navigations always reach the handler.
   *   - Android (WebViewClient): derived from
   *     `WebResourceRequest.isForMainFrame`. Sub-frame navigations only
   *     reach the handler when
   *     {@linkcode NitroWebViewProps.interceptSubframeNavigation} is `true`
   *     (main-frame navigations always do).
   *
   * Previously always `undefined`; now populated on both platforms.
   */
  isTopFrame?: boolean
  /**
   * iOS-only: true when the navigation has a target frame (false for
   * `target=_blank` / new-window navigations).
   */
  hasTargetFrame?: boolean
}

/** Internal completion object; native owns the pending navigation decision. */
export interface ShouldStartLoadDecision {
  resolve: (allow: boolean | undefined) => void
}

/** Read-only navigation state surfaced to JS via callbacks. */
export interface WebViewNavigationState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** Payload of load lifecycle events (onLoadStart / onLoad / onLoadEnd). */
export interface WebViewLoadEvent {
  nativeEvent: WebViewNavigationState
}

/** Native loading estimate, normalized to 0..1; not a byte count. */
export interface WebViewLoadProgressNativeEvent extends WebViewNavigationState {
  progress: number
}

export interface WebViewLoadProgressEvent {
  nativeEvent: WebViewLoadProgressNativeEvent
}

/** Inner payload of `WebViewMessageEvent.nativeEvent`. */
export interface WebViewMessageNativeEvent {
  data: string
  /** Top-level page URL; never use this to authenticate the sender. */
  url: string
  /** Native sender origin, or "null" for an opaque origin. Absent on legacy Android WebViews. */
  sourceOrigin?: string
  /** Native frame identity. Absent when Android's WEB_MESSAGE_LISTENER is unavailable. */
  isMainFrame?: boolean
}

/**
 * Payload of an `onMessage` event. `nativeEvent.data` is the literal string
 * passed to `window.ReactNativeWebView.postMessage(...)` inside the page.
 */
export interface WebViewMessageEvent {
  nativeEvent: WebViewMessageNativeEvent
}

/**
 * Payload of navigation, configuration, or blob-download failures.
 * Blob operational errors use domain NitroWebViewDownload and code -1.
 * They do not change page-load success or emit load lifecycle events.
 *
 * Field mapping:
 *   - `code`        — `NSError.code` (iOS) / `WebResourceError.getErrorCode()` (Android).
 *   - `description` — `NSError.localizedDescription` (iOS) /
 *                     `WebResourceError.getDescription().toString()` (Android),
 *                     or an operational/configuration failure description.
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
  /** Exact HTTP(S) sender origins allowed to deliver onMessage. Omit to allow all;
   * [] denies all. Paths, credentials and wildcards are rejected. This is independent
   * of navigation. Android requires WEB_MESSAGE_LISTENER; unsupported or invalid
   * configuration emits NitroWebViewConfiguration and denies messages.
   */
  allowedMessageOrigins?: string[]

  /** Android only: exact HTTP(S) origins allowed to request camera/microphone.
   * Default denies all. No wildcards or paths. Android runtime consent is still required.
   * iOS ignores this prop and retains WKWebView's system permission prompts.
   */
  mediaCapturePermissionOrigins?: string[]
  /** Android only: exact HTTP(S) origins allowed to request location.
   * Default denies all; grants are not remembered by WebView. Accepts approximate location.
   * iOS ignores this prop and retains system permission prompts.
   */
  geolocationPermissionOrigins?: string[]

  /**
   * Content source for the WebView.
   * @see {@linkcode WebViewSource}
   */
  source: WebViewSource

  /**
   * Default HTTP headers applied to every main-frame navigation request
   * triggered by a `source` change. Per-request headers supplied via
   * `source.headers` override these on key conflict (case-insensitive on
   * both platforms). Duplicate logical keys within either map emit
   * NitroWebViewSource (-1) and prevent loading.
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
   *   - iOS: captured before the first load using allowsContentJavaScript.
   *     Remount with a new key to change it. When false, bridge/history/user
   *     scripts are not installed, evaluation rejects and injection is ignored.
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
   * Use a new, non-persistent data store on iOS. Defaults to false.
   * Captured before the first load; remount with a new key to change it.
   * Cannot be combined with sharedCookiesEnabled.
   * Android does not support isolated sessions: true emits a configuration
   * error and prevents source loading without clearing shared cookies.
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
   *   - iOS (WKWebView): applied before the first page loads. This is an
   *     initial-only setting; change the component `key` to apply a new value.
   *   - Android (WebSettings): `WebSettings.mediaPlaybackRequiresUserGesture`,
   *     mutable anytime.
   */
  mediaPlaybackRequiresUserAction?: boolean

  /**
   * iOS-only. Play HTML5 video inline instead of forcing the native
   * fullscreen player. Defaults to `false` (WKWebView default).
   *
   *   - iOS (WKWebView): applied before the first page loads. The HTML video
   *     must also have `playsinline`. Change the component `key` to apply a
   *     new value after mounting.
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
   * iOS-only. Import non-expired HTTPCookieStorage cookies into the chosen
   * WebView store once, before its first load. Same name/domain/path cookies
   * are overwritten by the imported cookies. Defaults to false. This is a
   * one-way import, not continuous synchronization. Remount to change it.
   * Cannot be combined with incognito. Android ignores this prop.
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

  /** Fired once on successful main-document completion, before onLoadEnd.
   * Transport failures and HTTP 4xx/5xx responses do not fire onLoad.
   */
  onLoad?: (event: WebViewLoadEvent) => void

  /** Native progress estimate (0..1). Updates may skip values; 1 is not success. */
  onLoadProgress?: (event: WebViewLoadProgressEvent) => void

  /** Fired once when the main-document load completes, including failures. */
  onLoadEnd?: (event: WebViewLoadEvent) => void

  /** Fired when navigation state changes (URL, title, back/forward, loading). */
  onNavigationStateChange?: (state: WebViewNavigationState) => void

  /** Fired when the web page calls `window.ReactNativeWebView.postMessage(...)`. */
  onMessage?: (event: WebViewMessageEvent) => void

  /** Navigation/configuration failures, or blob operational errors (domain NitroWebViewDownload, code -1). */
  onError?: (event: NitroWebViewErrorEvent) => void

  /**
   * Internal resolver bridge for requests delivered by the platform navigation
   * hook. The public component accepts boolean or Promise<boolean> and calls
   * `decision.resolve` after settlement. Undefined indicates a thrown/rejected
   * callback or invalid result; both platforms allow the request. The completion
   * object avoids nested function-parameter conversion in Nitrogen 0.35.9.
   *
   *   - iOS (WKWebView): wired through
   *     `webView(_:decidePolicyFor:decisionHandler:)`. The native
   *     `decisionHandler` is stored under a unique decision ID. There is no
   *     library timeout: an unresolved Promise can keep navigation pending
   *     while the view is active. `stopLoading()`, view removal and content
   *     process termination cancel pending decisions exactly once. Late
   *     results are ignored. Another navigation does not cancel pending
   *     iframe decisions.
   *   - Android (WebViewClient): wired through
   *     `shouldOverrideUrlLoading(WebView, WebResourceRequest)`. The native
   *     side uses a nominal 250 ms monotonic budget, starting before callback
   *     invocation and Promise subscription. An in-budget result decides.
   *     Timeout, interruption and recoverable callback/subscription failure
   *     allow the request. Late results are ignored. Callback execution and
   *     OS scheduling cannot be preempted, so total UI delay can exceed 250 ms.
   *
   * When the prop is unset every navigation is allowed (allow-all default).
   * Blocked navigations are silently cancelled and do not emit onError.
   *
   * Sub-frame (iframe) navigations surface here with `isTopFrame: false`;
   * on Android that only happens when
   * {@linkcode NitroWebViewProps.interceptSubframeNavigation} is `true`
   * for requests delivered by the platform hook. Android app-initiated
   * `source` loads and POST requests do not trigger this hook. Subresources
   * are outside its contract. Neither this callback nor the origin allowlist
   * helpers provide a complete network security boundary.
   * SPA `history.pushState` / `replaceState` route changes do NOT surface
   * here. The platform cannot veto them, so they surface via
   * {@linkcode NitroWebViewProps.onNavigationStateChange} instead.
   * `target=_blank` / `window.open` surfaces via
   * {@linkcode NitroWebViewProps.onOpenWindow}.
   *
   * Out of scope for the MVP: per-request `originWhitelist` override.
   */
  onShouldStartLoadWithRequest?: (
    event: ShouldStartLoadRequest,
    decision: ShouldStartLoadDecision
  ) => void

  /**
   * Opt-in: intercept sub-frame (iframe) navigations through
   * {@linkcode NitroWebViewProps.onShouldStartLoadWithRequest} too, not just
   * main-frame navigations. Default `false`.
   *
   * Android note: each intercepted sub-frame navigation uses a nominal
   * 250 ms wait budget (see `onShouldStartLoadWithRequest`). Callback execution
   * and scheduling can exceed that budget. On an iframe-heavy page these waits
   * stack serially and risk jank / ANR — which is why sub-frame
   * interception is off by default on Android. Main-frame navigation is
   * unaffected by this flag within the platform hook's coverage.
   *
   * iOS has no such cost: `decidePolicyFor` parks its decision handler
   * asynchronously per navigation action, so sub-frame navigations already
   * reach the handler and this flag has no effect there.
   */
  interceptSubframeNavigation?: boolean

  /**
   * Fired when the page requests a new window — `window.open(...)` or a
   * `<a target="_blank">` / `target="_new"` link activation.
   *
   * The WebView NEVER spawns a second native web view. `nativeEvent.url`
   * carries the URL the page asked to open; JS decides what to do with it
   * (open the system browser, load it in-place via a `source` update, or
   * ignore it).
   *
   * Default behavior when the prop is UNSET (react-native-webview parity):
   *   - iOS: the request is loaded in the current WebView (a `_blank`
   *     link's new-window request collapses into an in-place navigation);
   *     no second `WKWebView` is created.
   *   - Android: `onCreateWindow` loads the destination in the current
   *     WebView.
   *
   * When the prop IS set, the in-place fallback is suppressed on both
   * platforms — the event fires and nothing loads unless JS acts. The
   * callback is notify-only; its return value does not gate loading (the
   * native window-creation callbacks are synchronous and cannot await a JS
   * Promise, unlike `onShouldStartLoadWithRequest`). To load the URL
   * in-place, JS updates `source`.
   */
  onOpenWindow?: (event: OpenWindowEvent) => void

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
   *     emits HTTP(S) download metadata. Blob requests emit success or onError.
   *
   * The WebView itself never persists a normal (http/https) download to
   * disk: JS is solely responsible for handling the download metadata.
   *
   * Blob downloads (`blob:`) DO surface an `onFileDownload` event, resolved
   * to a local reference in `nativeEvent.url` (iOS: a `file://` URL written
   * natively via `WKDownloadDelegate`; Android: a `data:` URL read in-page
   * and bridged back). See {@linkcode FileDownload.url} for the platform
   * distinction. Android accepts one blob reader per view, up to 8 MiB,
   * with a 30-second timeout. Navigation/source replacement cancels the reader.
   * Both platforms cancel active blob downloads on disposal. Failures use
   * onError with domain NitroWebViewDownload and do not fail the page load.
   * Consumers own successful iOS temporary files and their UUID directories.
   * Move the file to persistent storage, or delete the file and directory after use.
   */
  onFileDownload?: (event: FileDownloadEvent) => void

  /**
   * Fired when the WebView receives an HTTP error status (4xx/5xx) for a
   * **main-frame** navigation. Sub-resource failures (images, scripts,
   * iframes) never surface here — Android's `onReceivedHttpError` fires per
   * sub-resource and is filtered to main-frame only.
   *
   * Transport failures (DNS/TLS/reset/timeout) use {@linkcode onError}.
   * HTTP status codes from server responses use onHttpError.
   * Configuration and blob-download operations also use onError.
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
   * reclaim. Recovery depends on the platform.
   *
   *   - Android (`onRenderProcessGone`, API 26+): `nativeEvent.didCrash`
   *     mirrors `RenderProcessGoneDetail.didCrash()` (`false` = the OS
   *     reclaimed the renderer to free memory, not a crash). The native side
   *     cleans up and destroys this WebView before delivering the event once.
   *     It returns `true` so the host app survives. Clear the old hybrid ref
   *     and remount with a new React `key` after an explicit retry action.
   *     Old void methods do nothing. Old Promise methods reject with
   *     `NitroWebViewState`. API < 26 never emits.
   *   - iOS (`webViewWebContentProcessDidTerminate`): `nativeEvent.didCrash`
   *     is always `undefined` — WebKit exposes no crash-vs-reclaim
   *     discriminator. Fires on the main thread. Call `reload()` to recover.
   *
   * Android remounts lose history and page input. Do not automatically
   * replay POST sources. Choose the retry data and timing in the app.
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
  /** Stop the current load. On iOS, also cancel current pending navigation decisions. */
  stopLoading(): void
  /**
   * Evaluate arbitrary JavaScript inside the WebView and resolve with the
   * JSON string result. Use JSON.parse once to recover the value.
   * Undefined and null return "null". Only JSON-compatible values are
   * supported. iOS rejects native evaluation/serialization errors. Android
   * cannot distinguish a page exception from a null result.
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
   * Return cookies for an absolute HTTP(S) URL; invalid URLs reject.
   *
   *   - iOS: queries this instance's selected store and filters host, path
   *     and secure scope. Unmounted instances reject, without a default fallback.
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
   * Persist a cookie into this instance's store (process-shared on Android). `url`
   * scopes the cookie and is also used to derive the default `domain`/`path`
   * when those fields are omitted from `cookie`.
   *
   *   - iOS: builds an `HTTPCookie` via `HTTPCookie(properties:)` and calls
   *     the selected store's `httpCookieStore.setCookie(_:)`.
   *   - Android: serialises `cookie` into a `Set-Cookie`-style string and
   *     calls `CookieManager.getInstance().setCookie(url, value)` followed
   *     by `flush()`.
   */
  setCookie(url: string, cookie: Cookie): Promise<void>

  /**
   * Remove every cookie from this instance's selected store on iOS, or the
   * process-wide CookieManager on Android. Persistent iOS views share the
   * default store; clearing it also affects other views using that store.
   * Private iOS stores are isolated. Unmounted iOS instances reject.
   * Resolves only after the platform completion callback (and Android flush).
   */
  clearCookies(): Promise<void>

  /**
   * Clear the WebView's resource cache (in-memory + on-disk fetched
   * responses). Does NOT clear cookies (use {@linkcode clearCookies}),
   * localStorage, or the back/forward history.
   *
   *   - iOS (WKWebView): removes only the cache-shaped record types from the
   *     view's `configuration.websiteDataStore` —
   *     `WKWebsiteDataTypeDiskCache` and `WKWebsiteDataTypeMemoryCache` — via
   *     `removeData(ofTypes:modifiedSince:)` with `modifiedSince:
   *     .distantPast`. Cookies and localStorage are left intact because their
   *     record types are excluded from the set (do NOT use
   *     `allWebsiteDataTypes()`, which would also wipe them).
   *   - Android (android.webkit.WebView): `WebView.clearCache(true)` on the
   *     UI thread (`true` also purges the on-disk cache files, not just the
   *     RAM cache).
   *
   * Resolves once the platform reports the removal is complete.
   */
  clearCache(): Promise<void>

  /**
   * Clear the WebView's back/forward navigation list.
   *
   *   - Android (android.webkit.WebView): `WebView.clearHistory()` on the UI
   *     thread. Clears the list except the current page.
   *   - iOS (WKWebView): **NO-OP.** WKWebView exposes no public API to mutate
   *     `backForwardList` (it is read-only with no clear/prune method). This
   *     method resolves WITHOUT clearing on iOS rather than reloading
   *     `about:blank` — a reload would change the current URL and drop
   *     forward entries as a side effect, which is surprising for a "clear
   *     history" call. Callers needing a pristine stack on iOS should
   *     remount the component with a new React `key`. Mirrors react-native-webview,
   *     which exposes `clearHistory` on Android only.
   */
  clearHistory(): Promise<void>

  /**
   * Move keyboard/input focus to the WebView so the next key event (or a
   * focused form field inside the page) receives input without a user tap.
   *
   *   - iOS (WKWebView): `becomeFirstResponder()` on the main thread. The
   *     Promise resolves regardless of the responder's own return value (a
   *     `false` return just means the view was already first responder or the
   *     window is not key — not an error).
   *   - Android (android.webkit.WebView): `WebView.requestFocus()` on the UI
   *     thread.
   */
  requestFocus(): Promise<void>
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
 * native client handles the request. Surfaced to JS via `onFileDownload`.
 * HTTP(S) downloads return metadata. Blob downloads return resolved bytes
 * on Android or a temporary file owned by the consumer on iOS.
 *
 * Field semantics:
 *   - `url`           — Absolute download URL. Required. For a normal
 *                       download this is the remote URL (http/https). For a
 *                       `blob:` download the field carries a resolved local
 *                       reference instead, and the shape differs by platform:
 *                       iOS delivers a local `file://` URL (the blob is
 *                       streamed to a temp file natively via
 *                       `WKDownloadDelegate`), while Android delivers a
 *                       `data:` URL (the blob is read in-page to a data URL
 *                       and bridged back). Either form can be `fetch()`-ed /
 *                       saved by the consumer. Android caps blobs at 8 MiB.
 *                       iOS consumers must move the file or delete it and its
 *                       parent UUID directory after use. The library retains
 *                       successful files after disposal, but the OS can purge them.
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

/**
 * Inner payload of an {@linkcode OpenWindowEvent}.
 *
 * Field mapping:
 *   - `url` — Absolute URL the page asked to open in a new window.
 *     iOS: `WKNavigationAction.request.url.absoluteString` (from
 *     `webView(_:createWebViewWith:for:windowFeatures:)` or the
 *     new-window branch of `decidePolicyForNavigationAction`).
 *     Android: the URL observed by a throwaway child-WebView's
 *     `shouldOverrideUrlLoading` inside `WebChromeClient.onCreateWindow`.
 */
export interface OpenWindowNativeEvent {
  url: string
}

/**
 * React-Native-style event wrapper for {@linkcode OpenWindowNativeEvent}.
 * Surfaced to JS via the {@linkcode NitroWebViewProps.onOpenWindow} prop.
 */
export interface OpenWindowEvent {
  nativeEvent: OpenWindowNativeEvent
}
