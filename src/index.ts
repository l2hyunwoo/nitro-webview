export type { HtmlSource } from './specs/WebViewSource'

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
export type {
  LoadDispatcher,
  NativeLoadPayload,
  OnLoad,
} from './events'

export { createLoadEndDispatcher } from './events'
export type {
  LoadEndDispatcher,
  LoadEndOutcome,
  NativeLoadEndPayload,
  OnLoadEnd,
} from './events'

export type {
  NitroWebViewErrorEvent,
  WebViewErrorEvent,
} from './specs/NitroWebView.nitro'

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
