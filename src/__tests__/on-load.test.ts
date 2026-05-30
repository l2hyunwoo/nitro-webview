import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createLoadDispatcher,
  type NativeLoadPayload,
} from '../events.ts'
import type { WebViewNavigationState } from '../specs/NitroWebView.nitro.ts'

function makePayload(
  overrides: Partial<NativeLoadPayload> = {}
): NativeLoadPayload {
  return {
    navigationId: 1,
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
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

test('onLoad fires exactly once after a successful content load', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 42,
      url: 'https://example.com',
      title: 'Example Domain',
    })
  )

  assert.equal(
    spy.calls.length,
    1,
    'onLoad must fire exactly once per successful navigation-finish'
  )
})

test('onLoad payload carries the correct url', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      url: 'https://example.com/page',
      title: 'Page',
    })
  )

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.url,
    'https://example.com/page',
    'url must be forwarded verbatim from native to the JS event payload'
  )
})

test('onLoad payload carries the correct title (resolved off the document)', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      url: 'https://example.com',
      title: 'Example Domain',
    })
  )

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.title,
    'Example Domain',
    'title must be forwarded verbatim from native to the JS event payload'
  )
})

test('onLoad payload has loading=false (navigation has finished, not begun)', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 1 }))

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.loading,
    false,
    'loading must be false at load-end'
  )
})

test('payload is wrapped in `{ nativeEvent }` shape, not a plain string', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 7,
      url: 'https://example.com',
      title: 'Example Domain',
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
    title: 'Example Domain',
    loading: false,
    canGoBack: true,
    canGoForward: false,
  } satisfies WebViewNavigationState)
})

test('internal `navigationId` transport detail is NOT leaked into nativeEvent', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 999, url: 'https://example.com' }))

  assert.equal(spy.calls.length, 1)
  assert.equal(
    'navigationId' in (spy.calls[0]?.nativeEvent ?? {}),
    false,
    'navigationId is transport-internal and must not surface in the JS event'
  )
})

test('duplicate native fires for the SAME navigation produce exactly ONE JS call', () => {
  // WKWebView can re-trigger `didFinishNavigation:` on re-commit; Android's
  // System WebView can fire `onPageFinished` more than once across iframes.
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  const payload = makePayload({
    navigationId: 100,
    url: 'https://example.com',
    title: 'Example Domain',
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

test('a NEW navigation (different navigationId) DOES fire onLoad again', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      url: 'https://example.com',
      title: 'Example Domain',
    })
  )
  dispatch(
    makePayload({
      navigationId: 2,
      url: 'https://example.com/next',
      title: 'Next',
    })
  )

  assert.equal(
    spy.calls.length,
    2,
    'each distinct navigation must fire onLoad exactly once'
  )
  assert.equal(spy.calls[0]?.nativeEvent.url, 'https://example.com')
  assert.equal(spy.calls[0]?.nativeEvent.title, 'Example Domain')
  assert.equal(spy.calls[1]?.nativeEvent.url, 'https://example.com/next')
  assert.equal(spy.calls[1]?.nativeEvent.title, 'Next')
})

test('dispatcher is a safe no-op when no onLoad handler is subscribed', () => {
  const dispatch = createLoadDispatcher(undefined)

  assert.doesNotThrow(() =>
    dispatch(makePayload({ navigationId: 1, url: 'https://example.com' }))
  )
})

test('null/undefined native payload throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  assert.throws(
    () => dispatch(null as unknown as NativeLoadPayload),
    TypeError
  )
  assert.throws(
    () => dispatch(undefined as unknown as NativeLoadPayload),
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
  const dispatch = createLoadDispatcher(spy.handler)

  const badPayload = {
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  } as unknown as NativeLoadPayload

  assert.throws(() => dispatch(badPayload), TypeError)
  assert.equal(spy.calls.length, 0)
})

test('non-string url in payload throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        url: 42 as unknown as string,
        title: 'Example Domain',
        loading: false,
        canGoBack: false,
        canGoForward: false,
      }),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})

test('non-string title in payload throws TypeError', () => {
  // Empty string is valid; null/undefined/non-string is not.
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        url: 'https://example.com',
        title: null as unknown as string,
        loading: false,
        canGoBack: false,
        canGoForward: false,
      }),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})

test('empty-string title is accepted (some pages legitimately have no <title>)', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      url: 'https://example.com',
      title: '',
    })
  )

  assert.equal(spy.calls.length, 1)
  assert.equal(spy.calls[0]?.nativeEvent.title, '')
})

test('loading !== false in payload throws TypeError (this is onLoad, not onLoadStart)', () => {
  const spy = createSpy()
  const dispatch = createLoadDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        url: 'https://example.com',
        title: 'Example Domain',
        loading: true as unknown as false,
        canGoBack: false,
        canGoForward: false,
      }),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})
