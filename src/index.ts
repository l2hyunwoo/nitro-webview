import { getHostComponent } from 'react-native-nitro-modules'
import type {
  NitroWebViewMethods,
  NitroWebViewProps,
} from './specs/NitroWebView.nitro'
import NitroWebViewConfig from '../nitrogen/generated/shared/json/NitroWebViewConfig.json'

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
} from './specs/WebViewSource'

export type {
  NitroWebView as NitroWebViewType,
  NitroWebViewMethods,
  NitroWebViewProps,
  WebViewLoadEvent,
  WebViewMessageEvent,
  WebViewMessageNativeEvent,
  WebViewNavigationState,
  NitroWebViewErrorEvent,
  NitroWebViewErrorNativeEvent,
  WebViewErrorEvent,
} from './specs/NitroWebView.nitro'

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
  evaluateBridgeScript,
} from './bridgeScript'
export type {
  AndroidBridgeSandbox,
  AndroidNativeBridge,
  BridgePlatform,
  IosBridgeSandbox,
  WebKitMessageHandler,
} from './bridgeScript'
