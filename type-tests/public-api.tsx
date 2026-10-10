import React from 'react'
import {
  NitroWebView,
  callback,
  createOriginWhitelistGuard,
  wrapWithOriginWhitelist,
} from 'nitro-webview'
import type {
  NitroWebViewProps,
  NitroWebViewType,
  NitroWebViewMethods,
  ShouldStartLoadRequest,
  WebViewNavigationState,
  WebViewNavigationType,
  WebViewLoadEvent,
  WebViewLoadProgressEvent,
  WebViewLoadProgressNativeEvent,
  WebViewMessageEvent,
  WebViewMessageNativeEvent,
  NitroWebViewErrorEvent,
  NitroWebViewErrorNativeEvent,
  WebViewErrorEvent,
  FileDownload,
  FileDownloadEvent,
  OnShouldStartLoadWithRequest,
  OriginWhitelistGuard,
  NitroWebViewHttpErrorEvent,
  NitroWebViewHttpErrorNativeEvent,
  NitroWebViewRenderProcessGoneEvent,
  NitroWebViewRenderProcessGoneNativeEvent,
  NitroWebViewScrollEvent,
  NitroWebViewScrollNativeEvent,
  WebViewPoint,
  OpenWindowEvent,
  OpenWindowNativeEvent,
} from 'nitro-webview'

const sync: OnShouldStartLoadWithRequest = (event) => event.isTopFrame !== false
const asyncDecision: OnShouldStartLoadWithRequest = async (event) =>
  event.url.startsWith('https:')
const guard: OriginWhitelistGuard = wrapWithOriginWhitelist(sync)
const nativeRef = React.createRef<React.ComponentRef<typeof NitroWebView>>()
nativeRef.current?.measure(() => undefined)
nativeRef.current?.setNativeProps({ accessible: true })
// @ts-expect-error - WebView methods belong to hybridRef, not the React ref.
nativeRef.current?.reload()

export const publicRefHasNoProps: Extract<
  keyof NitroWebViewType,
  keyof NitroWebViewProps
> extends never
  ? true
  : false = true

export function publicHybridRef(ref: NitroWebViewType) {
  // @ts-expect-error - Navigation callbacks must go through React props.
  ref.onShouldStartLoadWithRequest = () => Promise.resolve(false)
  // @ts-expect-error - View props are not part of the imperative ref.
  ref.source = { uri: 'https://example.com' }
  // @ts-expect-error - Ref methods cannot be replaced.
  ref.reload = () => undefined
  return {
    methods: ref satisfies NitroWebViewMethods,
    name: ref.name satisfies string,
    same: ref.equals(ref) satisfies boolean,
    description: ref.toString() satisfies string,
    dispose: ref.dispose satisfies () => void,
  }
}

export const publicProps: NitroWebViewProps[] = [
  {
    source: { uri: 'https://example.com' },
    onShouldStartLoadWithRequest: sync,
  },
  {
    source: { uri: 'https://example.com' },
    onShouldStartLoadWithRequest: asyncDecision,
  },
  {
    source: { uri: 'https://example.com' },
    onShouldStartLoadWithRequest: guard,
  },
]

export const publicJSX = [
  <NitroWebView
    key="sync"
    ref={nativeRef}
    hybridRef={callback((ref: NitroWebViewType) => ref.reload())}
    source={publicProps[0]!.source}
    onShouldStartLoadWithRequest={callback(sync)}
  />,
  <NitroWebView
    key="unset"
    source={publicProps[0]!.source}
    hybridRef={callback((ref: NitroWebViewMethods) => ref.reload())}
    onShouldStartLoadWithRequest={callback(undefined)}
  />,
  <NitroWebView
    key="async"
    source={publicProps[0]!.source}
    hybridRef={callback((ref) => {
      publicHybridRef(ref).methods.reload()
      // @ts-expect-error - Inferred refs must not expose writable callbacks.
      ref.onShouldStartLoadWithRequest = () => Promise.resolve(false)
      // @ts-expect-error - Inferred refs must not expose writable props.
      ref.source = { uri: 'https://example.com' }
      // @ts-expect-error - Inferred ref methods cannot be replaced.
      ref.reload = () => undefined
    })}
    onShouldStartLoadWithRequest={callback(asyncDecision)}
  />,
  <NitroWebView
    key="guard"
    source={publicProps[0]!.source}
    onShouldStartLoadWithRequest={callback(guard)}
  />,
  <NitroWebView
    key="create"
    source={publicProps[0]!.source}
    onShouldStartLoadWithRequest={callback(
      createOriginWhitelistGuard(undefined, asyncDecision)
    )}
  />,
]

export type PublicPayloads = [
  ShouldStartLoadRequest,
  WebViewNavigationState,
  WebViewNavigationType,
  WebViewLoadEvent,
  WebViewLoadProgressEvent,
  WebViewLoadProgressNativeEvent,
  WebViewMessageEvent,
  WebViewMessageNativeEvent,
  NitroWebViewErrorEvent,
  NitroWebViewErrorNativeEvent,
  WebViewErrorEvent,
  FileDownload,
  FileDownloadEvent,
  NitroWebViewHttpErrorEvent,
  NitroWebViewHttpErrorNativeEvent,
  NitroWebViewRenderProcessGoneEvent,
  NitroWebViewRenderProcessGoneNativeEvent,
  NitroWebViewScrollEvent,
  NitroWebViewScrollNativeEvent,
  WebViewPoint,
  OpenWindowEvent,
  OpenWindowNativeEvent,
]
