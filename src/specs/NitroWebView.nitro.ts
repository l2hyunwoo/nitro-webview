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
}

export type NitroWebView = HybridView<NitroWebViewProps, NitroWebViewMethods>
