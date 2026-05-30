import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createLoadStartDispatcher,
  type NativeLoadStartPayload,
} from '../events.ts'
import type { WebViewNavigationState } from '../specs/NitroWebView.nitro.ts'

function makePayload(
  overrides: Partial<NativeLoadStartPayload> = {}
): NativeLoadStartPayload {
  return {
    navigationId: 1,
    url: 'https://example.com',
    title: '',
    loading: true,
    canGoBack: false,
    canGoForward: false,
    ...overrides,
  }
}

function createSpy() {
  const calls: Array<{ nativeEvent: WebViewNavigationState }> = []
  const handler = (event: { nativeEvent: WebViewNavigationState }): void => {
    calls.push(event)
  }
  return { handler, calls }
}

test('onLoadStart fires exactly once when navigation begins', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 42, url: 'https://example.com' }))

  assert.equal(
    spy.calls.length,
    1,
    'onLoadStart must fire exactly once per navigation-start'
  )
})

test('onLoadStart payload carries the correct url', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 1, url: 'https://example.com/page' }))

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.url,
    'https://example.com/page',
    'url must be forwarded verbatim from native to the JS event payload'
  )
})

test('onLoadStart payload has loading=true (navigation has begun, not finished)', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 1 }))

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.loading,
    true,
    'loading must be true at navigation start'
  )
})

test('payload is wrapped in `{ nativeEvent }` shape, not a plain string', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 7,
      url: 'https://example.com',
      title: 'Example',
      canGoBack: true,
      canGoForward: false,
    })
  )

  assert.equal(spy.calls.length, 1)
  const event = spy.calls[0]
  assert.ok(event, 'event must be captured')

  assert.equal(typeof event, 'object')
  assert.ok('nativeEvent' in event, '`nativeEvent` key must be present')
  assert.deepEqual(event.nativeEvent, {
    url: 'https://example.com',
    title: 'Example',
    loading: true,
    canGoBack: true,
    canGoForward: false,
  } satisfies WebViewNavigationState)
})

test('the internal `navigationId` transport detail is NOT leaked into nativeEvent', () => {
  // navigationId is a transport-layer dedupe key; it must not appear in
  // the public event schema.
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 999, url: 'https://example.com' }))

  assert.equal(spy.calls.length, 1)
  assert.equal(
    'navigationId' in (spy.calls[0]?.nativeEvent ?? {}),
    false,
    'navigationId is transport-internal and must not surface in the JS event'
  )
})

test('duplicate native fires for the SAME navigation produce exactly ONE JS call', () => {
  // WKWebView can deliver `didStartProvisionalNavigation:` and
  // `didCommitNavigation:` for the same navigation; android.webkit's
  // `onPageStarted` can fire multiple times for redirects.
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  const payload = makePayload({
    navigationId: 100,
    url: 'https://example.com',
  })

  dispatch(payload)
  dispatch(payload)
  dispatch(payload)

  assert.equal(
    spy.calls.length,
    1,
    'redundant native fires for the same navigation must NOT produce duplicate JS calls'
  )
})

test('a NEW navigation (different navigationId) DOES fire onLoadStart again', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 1, url: 'https://example.com' }))
  dispatch(makePayload({ navigationId: 2, url: 'https://example.com/next' }))

  assert.equal(
    spy.calls.length,
    2,
    'each distinct navigation must fire onLoadStart exactly once'
  )
  assert.equal(spy.calls[0]?.nativeEvent.url, 'https://example.com')
  assert.equal(spy.calls[1]?.nativeEvent.url, 'https://example.com/next')
})

test('dispatcher is a safe no-op when no onLoadStart handler is subscribed', () => {
  const dispatch = createLoadStartDispatcher(undefined)

  assert.doesNotThrow(() =>
    dispatch(makePayload({ navigationId: 1, url: 'https://example.com' }))
  )
})

test('null/undefined native payload throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  assert.throws(
    () => dispatch(null as unknown as NativeLoadStartPayload),
    TypeError
  )
  assert.throws(
    () => dispatch(undefined as unknown as NativeLoadStartPayload),
    TypeError
  )
  assert.equal(
    spy.calls.length,
    0,
    'handler must not fire when the native payload is malformed'
  )
})

test('missing navigationId throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  const badPayload = {
    url: 'https://example.com',
    title: '',
    loading: true,
    canGoBack: false,
    canGoForward: false,
  } as unknown as NativeLoadStartPayload

  assert.throws(() => dispatch(badPayload), TypeError)
  assert.equal(spy.calls.length, 0)
})

test('non-string url in payload throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        url: 42 as unknown as string,
        title: '',
        loading: true,
        canGoBack: false,
        canGoForward: false,
      }),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})

test('loading !== true in payload throws TypeError (this is onLoadStart, not onLoadEnd)', () => {
  const spy = createSpy()
  const dispatch = createLoadStartDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        url: 'https://example.com',
        title: '',
        loading: false as unknown as true,
        canGoBack: false,
        canGoForward: false,
      }),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})
