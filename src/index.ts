import { getHostComponent, type HybridView } from 'react-native-nitro-modules'
import type {
  NitroWebViewMethods,
  NitroWebViewProps as NativeNitroWebViewProps,
} from './specs/NitroWebView.nitro'
import NitroWebViewConfig from '../nitrogen/generated/shared/json/NitroWebViewConfig.json'
import type { OnShouldStartLoadWithRequest } from './originWhitelist'

/** Public callback type; the codegen declaration retains its native ABI. */
export interface NitroWebViewProps extends Omit<
  NativeNitroWebViewProps,
  'onShouldStartLoadWithRequest'
> {
  onShouldStartLoadWithRequest?: OnShouldStartLoadWithRequest
}

export type NitroWebViewType = HybridView<
  NitroWebViewProps,
  NitroWebViewMethods
>

/** React component for the Nitro-backed WebView. */
export const NitroWebView = getHostComponent<
  NitroWebViewProps,
  NitroWebViewMethods
>('NitroWebView', () => NitroWebViewConfig)

export { callback } from 'react-native-nitro-modules'

export type {
  HtmlSource,
  UriSource,
  WebViewSource,
  WebViewSourceMethod,
} from './specs/WebViewSource'

export type {
  NitroWebViewMethods,
  WebViewLoadEvent,
  WebViewLoadProgressEvent,
  WebViewLoadProgressNativeEvent,
  WebViewMessageEvent,
  WebViewMessageNativeEvent,
  WebViewNavigationState,
  WebViewNavigationType,
  ShouldStartLoadRequest,
  NitroWebViewErrorEvent,
  NitroWebViewErrorNativeEvent,
  WebViewErrorEvent,
  NitroWebViewHttpErrorEvent,
  NitroWebViewHttpErrorNativeEvent,
  NitroWebViewRenderProcessGoneEvent,
  NitroWebViewRenderProcessGoneNativeEvent,
  NitroWebViewScrollEvent,
  NitroWebViewScrollNativeEvent,
  WebViewPoint,
  OpenWindowEvent,
  OpenWindowNativeEvent,
  Cookie,
  FileDownload,
  FileDownloadEvent,
} from './specs/NitroWebView.nitro'

export {
  originMatches,
  createOriginWhitelistGuard,
  wrapWithOriginWhitelist,
  DEFAULT_ORIGIN_WHITELIST,
} from './originWhitelist'
export type {
  OriginWhitelistGuard,
  OnShouldStartLoadWithRequest,
} from './originWhitelist'

export {
  isHtmlSource,
  isUriSource,
  normalizeHtmlSource,
  sourceToCommand,
} from './sourceToCommand'

export type {
  LoadHtmlCommand,
  LoadUrlCommand,
  NativeViewCommand,
} from './nativeCommands'

export { createLoadStartDispatcher } from './events'
export type {
  LoadStartDispatcher,
  NativeLoadStartPayload,
  OnLoadStart,
} from './events'

export { createLoadDispatcher } from './events'
export type { LoadDispatcher, NativeLoadPayload, OnLoad } from './events'

export { createLoadEndDispatcher } from './events'
export type {
  LoadEndDispatcher,
  LoadEndOutcome,
  NativeLoadEndPayload,
  OnLoadEnd,
} from './events'

export {
  ANDROID_NATIVE_BRIDGE_NAME,
  BRIDGE_NAME,
  buildBridgeScript,
  buildPostMessageScript,
  encodeJsStringLiteral,
  evaluateBridgeScript,
} from './bridgeScript'
export type {
  AndroidBridgeSandbox,
  AndroidNativeBridge,
  BridgePlatform,
  IosBridgeSandbox,
  WebKitMessageHandler,
} from './bridgeScript'
