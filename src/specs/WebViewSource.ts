/**
 * URI source for the NitroWebView. Maps to `WKWebView.load(URLRequest)` on
 * iOS and `WebView.loadUrl(...)` on Android.
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
