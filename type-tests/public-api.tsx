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
    hybridRef={callback((ref: NitroWebViewType) => ref.reload())}
    source={publicProps[0]!.source}
    onShouldStartLoadWithRequest={callback(sync)}
  />,
  <NitroWebView
    key="async"
    source={publicProps[0]!.source}
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
