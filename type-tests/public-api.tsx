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
    key="plain"
    {...publicProps[0]!}
    ref={nativeRef}
    hybridRef={(ref) => {
      publicHybridRef(ref)
    }}
    onLoadStart={(event) => {
      event.nativeEvent.url satisfies string
    }}
    onLoad={(event) => {
      event.nativeEvent.loading satisfies boolean
    }}
    onLoadProgress={(event) => {
      event.nativeEvent.progress satisfies number
    }}
    onLoadEnd={(event) => {
      event.nativeEvent.title satisfies string
    }}
    onNavigationStateChange={(state) => {
      state.canGoBack satisfies boolean
    }}
    onMessage={(event) => {
      event.nativeEvent.data satisfies string
    }}
    onError={(event) => {
      event.nativeEvent.description satisfies string
    }}
    onHttpError={(event) => {
      event.nativeEvent.statusCode satisfies number
    }}
    onFileDownload={(event) => {
      event.nativeEvent satisfies FileDownload
    }}
    onOpenWindow={(event) => {
      event.nativeEvent.url satisfies string
    }}
    onRenderProcessGone={(event) => {
      event.nativeEvent satisfies NitroWebViewRenderProcessGoneNativeEvent
    }}
    onScroll={(event) => {
      event.nativeEvent satisfies NitroWebViewScrollNativeEvent
    }}
    onShouldStartLoadWithRequest={async (request) =>
      request.isTopFrame !== false
    }
    onLayout={(event) => {
      event.nativeEvent.layout.width satisfies number
    }}
  />,
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

export const wrappedPublicProps: NitroWebViewProps = {
  source: { uri: 'https://example.com' },
  onMessage: callback((event) => {
    event.nativeEvent.data satisfies string
  }),
  onShouldStartLoadWithRequest: callback(asyncDecision),
}
export const spreadWrappedProps = <NitroWebView {...wrappedPublicProps} />
export const unsetCallbacks = (
  <NitroWebView
    {...publicProps[0]!}
    onMessage={undefined}
    hybridRef={undefined}
  />
)
export const wrongCallback = (
  <NitroWebView
    {...publicProps[0]!}
    // @ts-expect-error - A plain callback must receive the documented event.
    onMessage={(event: number) => {
      event.toFixed()
    }}
  />
)
export const wrongWrappedCallback = (
  <NitroWebView
    {...publicProps[0]!}
    // @ts-expect-error - Wrapping must not erase the event type.
    onMessage={callback((event: number) => {
      event.toFixed()
    })}
  />
)
export const wrongDecision = (
  <NitroWebView
    {...publicProps[0]!}
    // @ts-expect-error - Navigation decisions must resolve to booleans.
    onShouldStartLoadWithRequest={async () => 'allow'}
  />
)

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
