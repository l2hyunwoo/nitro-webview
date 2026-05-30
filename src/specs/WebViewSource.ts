/**
 * URI source for the NitroWebView. Maps to `WKWebView.load(URLRequest)` on
 * iOS and `WebView.loadUrl(...)` on Android.
 */
export interface UriSource {
  uri: string
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
