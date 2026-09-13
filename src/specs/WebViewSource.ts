export type WebViewSourceMethod = 'GET' | 'POST'

/**
 * URI source for the NitroWebView. Maps to `WKWebView.load(URLRequest)` on
 * iOS and `WebView.loadUrl(...)` / `postUrl(...)` on Android.
 *
 * `headers` are optional HTTP request headers applied only to the
 * **main-frame navigation** triggered by a `source` change. They are NOT
 * re-applied to subsequent redirects, link clicks, or sub-resource
 * requests. Per-request `headers` override any keys present in
 * `NitroWebViewProps.defaultHeaders` on conflict.
 */
export interface UriSource {
  uri: string
  headers?: Record<string, string>
  /** Defaults to GET. POST requires an HTTP(S) URI. */
  method?: WebViewSourceMethod
  /**
   * UTF-8 request body for POST; omitted means an empty body. Encode form
   * data yourself (application/x-www-form-urlencoded on Android).
   * A body with GET is invalid. Android POST cannot use source.headers or
   * defaultHeaders: nonempty maps emit onError and skip the navigation.
   * Invalid source combinations emit onError (domain NitroWebViewSource,
   * code -1) without starting a load.
   */
  body?: string
}

/**
 * Inline HTML source for the NitroWebView. `baseUrl` is used to resolve
 * relative paths referenced from within `html`.
 */
export interface HtmlSource {
  html: string
  baseUrl?: string
}

/**
 * Named-interface variant union for the NitroWebView `source` prop.
 * Variant discrimination happens structurally via the presence of `uri`
 * vs `html`.
 */
export type WebViewSource = UriSource | HtmlSource
