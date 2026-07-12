import type {
  NitroWebViewErrorEvent,
  NitroWebViewHttpErrorEvent,
  NitroWebViewProps,
  NitroWebViewRenderProcessGoneEvent,
  NitroWebViewScrollNativeEvent,
  WebViewNavigationState,
} from './specs/NitroWebView.nitro'

/**
 * Raw payload the native side hands the JS dispatcher when a navigation
 * begins. `navigationId` is a monotonically-increasing id stamped on each
 * new navigation and used to dedupe redundant native fires.
 */
export interface NativeLoadStartPayload {
  navigationId: number
  url: string
  title: string
  loading: true
  canGoBack: boolean
  canGoForward: boolean
}

export type OnLoadStart = NonNullable<NitroWebViewProps['onLoadStart']>

export type LoadStartDispatcher = (payload: NativeLoadStartPayload) => void

/**
 * Build a dispatcher that forwards native load-start events to the
 * user-supplied `onLoadStart` callback, firing exactly once per navigation
 * (keyed by `navigationId`).
 */
export function createLoadStartDispatcher(
  onLoadStart: OnLoadStart | undefined
): LoadStartDispatcher {
  const dispatched = new Set<number>()

  return function dispatchLoadStart(payload: NativeLoadStartPayload): void {
    if (payload == null) {
      throw new TypeError(
        'NitroWebView: onLoadStart native payload is required'
      )
    }
    if (typeof payload.navigationId !== 'number') {
      throw new TypeError(
        'NitroWebView: onLoadStart native payload must include a numeric `navigationId`'
      )
    }
    if (typeof payload.url !== 'string') {
      throw new TypeError(
        'NitroWebView: onLoadStart native payload must include a string `url`'
      )
    }
    if (payload.loading !== true) {
      throw new TypeError(
        'NitroWebView: onLoadStart native payload must have `loading: true` (navigation has begun, not finished)'
      )
    }

    if (dispatched.has(payload.navigationId)) {
      return
    }
    dispatched.add(payload.navigationId)

    if (onLoadStart === undefined) {
      return
    }

    const nativeEvent: WebViewNavigationState = {
      url: payload.url,
      title: payload.title,
      loading: payload.loading,
      canGoBack: payload.canGoBack,
      canGoForward: payload.canGoForward,
    }

    onLoadStart({ nativeEvent })
  }
}

/**
 * Raw payload the native side hands the JS dispatcher when a navigation
 * successfully completes. `loading` is `false`; `title` is resolved off the
 * live document.
 */
export interface NativeLoadPayload {
  navigationId: number
  url: string
  title: string
  loading: false
  canGoBack: boolean
  canGoForward: boolean
}

export type OnLoad = NonNullable<NitroWebViewProps['onLoadEnd']>

export type LoadDispatcher = (payload: NativeLoadPayload) => void

/**
 * Build a dispatcher that forwards native load events to the user-supplied
 * `onLoad` callback, firing exactly once per navigation.
 */
export function createLoadDispatcher(
  onLoad: OnLoad | undefined
): LoadDispatcher {
  const dispatched = new Set<number>()

  return function dispatchLoad(payload: NativeLoadPayload): void {
    if (payload == null) {
      throw new TypeError('NitroWebView: onLoad native payload is required')
    }
    if (typeof payload.navigationId !== 'number') {
      throw new TypeError(
        'NitroWebView: onLoad native payload must include a numeric `navigationId`'
      )
    }
    if (typeof payload.url !== 'string') {
      throw new TypeError(
        'NitroWebView: onLoad native payload must include a string `url`'
      )
    }
    if (typeof payload.title !== 'string') {
      throw new TypeError(
        'NitroWebView: onLoad native payload must include a string `title`'
      )
    }
    if (payload.loading !== false) {
      throw new TypeError(
        'NitroWebView: onLoad native payload must have `loading: false` (navigation has finished, not begun)'
      )
    }

    if (dispatched.has(payload.navigationId)) {
      return
    }
    dispatched.add(payload.navigationId)

    if (onLoad === undefined) {
      return
    }

    const nativeEvent: WebViewNavigationState = {
      url: payload.url,
      title: payload.title,
      loading: payload.loading,
      canGoBack: payload.canGoBack,
      canGoForward: payload.canGoForward,
    }

    onLoad({ nativeEvent })
  }
}

/**
 * Outcome tag for a load-end native event. `onLoadEnd` fires identically
 * for both branches; the outcome is captured for invariant validation.
 */
export type LoadEndOutcome = 'success' | 'failure'

/**
 * Raw payload the native side hands the JS dispatcher when a navigation
 * completes — successfully or by failure.
 */
export interface NativeLoadEndPayload {
  navigationId: number
  outcome: LoadEndOutcome
  url: string
  title: string
  loading: false
  canGoBack: boolean
  canGoForward: boolean
}

export type OnLoadEnd = NonNullable<NitroWebViewProps['onLoadEnd']>

export type LoadEndDispatcher = (payload: NativeLoadEndPayload) => void

/**
 * Build a dispatcher that forwards native load-end events to the
 * user-supplied `onLoadEnd` callback, firing exactly once per navigation
 * regardless of outcome (keyed by `navigationId`).
 */
export function createLoadEndDispatcher(
  onLoadEnd: OnLoadEnd | undefined
): LoadEndDispatcher {
  // Keyed purely by navigationId, NOT (navigationId, outcome) — one
  // terminal event per navigation, whatever the outcome.
  const dispatched = new Set<number>()

  return function dispatchLoadEnd(payload: NativeLoadEndPayload): void {
    if (payload == null) {
      throw new TypeError('NitroWebView: onLoadEnd native payload is required')
    }
    if (typeof payload.navigationId !== 'number') {
      throw new TypeError(
        'NitroWebView: onLoadEnd native payload must include a numeric `navigationId`'
      )
    }
    if (payload.outcome !== 'success' && payload.outcome !== 'failure') {
      throw new TypeError(
        "NitroWebView: onLoadEnd native payload must include `outcome: 'success' | 'failure'`"
      )
    }
    if (typeof payload.url !== 'string') {
      throw new TypeError(
        'NitroWebView: onLoadEnd native payload must include a string `url`'
      )
    }
    if (typeof payload.title !== 'string') {
      throw new TypeError(
        'NitroWebView: onLoadEnd native payload must include a string `title`'
      )
    }
    if (payload.loading !== false) {
      throw new TypeError(
        'NitroWebView: onLoadEnd native payload must have `loading: false` (this is a terminal lifecycle event)'
      )
    }

    if (dispatched.has(payload.navigationId)) {
      return
    }
    dispatched.add(payload.navigationId)

    if (onLoadEnd === undefined) {
      return
    }

    const nativeEvent: WebViewNavigationState = {
      url: payload.url,
      title: payload.title,
      loading: payload.loading,
      canGoBack: payload.canGoBack,
      canGoForward: payload.canGoForward,
    }

    onLoadEnd({ nativeEvent })
  }
}

/**
 * Raw payload the native side hands the JS error dispatcher when a
 * navigation fails. Maps directly onto `NitroWebViewErrorEvent.nativeEvent`,
 * plus a transport-only `navigationId` used for dedupe.
 */
export interface NativeErrorPayload {
  navigationId: number
  code: number
  description: string
  url: string
  domain: string
}

export type OnError = NonNullable<NitroWebViewProps['onError']>

export type ErrorDispatcher = (payload: NativeErrorPayload) => void

/**
 * Build a dispatcher that forwards native error events to the user-supplied
 * `onError` callback, firing exactly once per failed navigation (keyed by
 * `navigationId`).
 */
export function createErrorDispatcher(
  onError: OnError | undefined
): ErrorDispatcher {
  const dispatched = new Set<number>()

  return function dispatchError(payload: NativeErrorPayload): void {
    if (payload == null) {
      throw new TypeError('NitroWebView: onError native payload is required')
    }
    if (typeof payload.navigationId !== 'number') {
      throw new TypeError(
        'NitroWebView: onError native payload must include a numeric `navigationId`'
      )
    }
    if (typeof payload.code !== 'number') {
      throw new TypeError(
        'NitroWebView: onError native payload must include a numeric `code`'
      )
    }
    if (typeof payload.description !== 'string') {
      throw new TypeError(
        'NitroWebView: onError native payload must include a string `description`'
      )
    }
    if (typeof payload.url !== 'string') {
      throw new TypeError(
        'NitroWebView: onError native payload must include a string `url` (empty string when none is available)'
      )
    }
    if (typeof payload.domain !== 'string') {
      throw new TypeError(
        'NitroWebView: onError native payload must include a string `domain`'
      )
    }

    if (dispatched.has(payload.navigationId)) {
      return
    }
    dispatched.add(payload.navigationId)

    if (onError === undefined) {
      return
    }

    const event: NitroWebViewErrorEvent = {
      nativeEvent: {
        code: payload.code,
        description: payload.description,
        url: payload.url,
        domain: payload.domain,
      },
    }

    onError(event)
  }
}

/**
 * Raw payload the native side hands the JS HTTP-error dispatcher when a
 * main-frame navigation receives a 4xx/5xx status. Maps directly onto
 * `NitroWebViewHttpErrorEvent.nativeEvent`, plus a transport-only
 * `navigationId` used for dedupe.
 */
export interface NativeHttpErrorPayload {
  navigationId: number
  statusCode: number
  url: string
  description: string
}

export type OnHttpError = NonNullable<NitroWebViewProps['onHttpError']>

export type HttpErrorDispatcher = (payload: NativeHttpErrorPayload) => void

/**
 * Build a dispatcher that forwards native HTTP-error events to the
 * user-supplied `onHttpError` callback, firing at most once per navigation
 * (keyed by `navigationId`) — a redirect chain that re-fires the same
 * navigation id is coalesced, matching `createErrorDispatcher`.
 */
export function createHttpErrorDispatcher(
  onHttpError: OnHttpError | undefined
): HttpErrorDispatcher {
  const dispatched = new Set<number>()

  return function dispatchHttpError(payload: NativeHttpErrorPayload): void {
    if (payload == null) {
      throw new TypeError(
        'NitroWebView: onHttpError native payload is required'
      )
    }
    if (typeof payload.navigationId !== 'number') {
      throw new TypeError(
        'NitroWebView: onHttpError native payload must include a numeric `navigationId`'
      )
    }
    if (typeof payload.statusCode !== 'number') {
      throw new TypeError(
        'NitroWebView: onHttpError native payload must include a numeric `statusCode`'
      )
    }
    if (typeof payload.url !== 'string') {
      throw new TypeError(
        'NitroWebView: onHttpError native payload must include a string `url`'
      )
    }
    if (typeof payload.description !== 'string') {
      throw new TypeError(
        'NitroWebView: onHttpError native payload must include a string `description`'
      )
    }

    if (dispatched.has(payload.navigationId)) {
      return
    }
    dispatched.add(payload.navigationId)

    if (onHttpError === undefined) {
      return
    }

    const event: NitroWebViewHttpErrorEvent = {
      nativeEvent: {
        statusCode: payload.statusCode,
        url: payload.url,
        description: payload.description,
      },
    }

    onHttpError(event)
  }
}

/**
 * Raw payload the native side hands the JS render-process-gone dispatcher.
 * `didCrash` is Android-only (`undefined` on iOS). `navigationId` is a
 * transport-only dedupe key.
 */
export interface NativeRenderProcessGonePayload {
  navigationId: number
  didCrash?: boolean
}

export type OnRenderProcessGone = NonNullable<
  NitroWebViewProps['onRenderProcessGone']
>

export type RenderProcessGoneDispatcher = (
  payload: NativeRenderProcessGonePayload
) => void

/**
 * Build a dispatcher that forwards native render-process-gone events to the
 * user-supplied `onRenderProcessGone` callback, firing at most once per
 * navigation (keyed by `navigationId`).
 */
export function createRenderProcessGoneDispatcher(
  onRenderProcessGone: OnRenderProcessGone | undefined
): RenderProcessGoneDispatcher {
  const dispatched = new Set<number>()

  return function dispatchRenderProcessGone(
    payload: NativeRenderProcessGonePayload
  ): void {
    if (payload == null) {
      throw new TypeError(
        'NitroWebView: onRenderProcessGone native payload is required'
      )
    }
    if (typeof payload.navigationId !== 'number') {
      throw new TypeError(
        'NitroWebView: onRenderProcessGone native payload must include a numeric `navigationId`'
      )
    }
    if (
      payload.didCrash !== undefined &&
      typeof payload.didCrash !== 'boolean'
    ) {
      throw new TypeError(
        'NitroWebView: onRenderProcessGone native payload `didCrash` must be a boolean or undefined'
      )
    }

    if (dispatched.has(payload.navigationId)) {
      return
    }
    dispatched.add(payload.navigationId)

    if (onRenderProcessGone === undefined) {
      return
    }

    const event: NitroWebViewRenderProcessGoneEvent = {
      nativeEvent: { didCrash: payload.didCrash },
    }

    onRenderProcessGone(event)
  }
}

/**
 * Raw payload the native side hands the JS scroll dispatcher on every scroll
 * tick. Mirrors `NitroWebViewScrollEvent.nativeEvent`. There is NO
 * `navigationId` because scroll events are NOT deduped — every tick is a
 * distinct user-visible event.
 */
export type NativeScrollPayload = NitroWebViewScrollNativeEvent

export type OnScroll = NonNullable<NitroWebViewProps['onScroll']>

export type ScrollDispatcher = (payload: NativeScrollPayload) => void

/**
 * Build a dispatcher that forwards native scroll events to the user-supplied
 * `onScroll` callback. Unlike every other dispatcher here it does NOT dedupe:
 * scroll is a high-frequency stream and each tick is delivered verbatim.
 */
export function createScrollDispatcher(
  onScroll: OnScroll | undefined
): ScrollDispatcher {
  return function dispatchScroll(payload: NativeScrollPayload): void {
    if (payload == null) {
      throw new TypeError('NitroWebView: onScroll native payload is required')
    }
    if (
      payload.contentOffset == null ||
      typeof payload.contentOffset.x !== 'number' ||
      typeof payload.contentOffset.y !== 'number'
    ) {
      throw new TypeError(
        'NitroWebView: onScroll native payload must include a `contentOffset` point'
      )
    }

    if (onScroll === undefined) {
      return
    }

    onScroll({ nativeEvent: payload })
  }
}
