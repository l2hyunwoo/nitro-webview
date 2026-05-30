import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createLoadEndDispatcher,
  type NativeLoadEndPayload,
} from '../events.ts'
import type { WebViewNavigationState } from '../specs/NitroWebView.nitro.ts'

function makePayload(
  overrides: Partial<NativeLoadEndPayload> = {}
): NativeLoadEndPayload {
  return {
    navigationId: 1,
    outcome: 'success',
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    ...overrides,
  }
}

function makeFailurePayload(
  overrides: Partial<NativeLoadEndPayload> = {}
): NativeLoadEndPayload {
  return {
    navigationId: 1,
    outcome: 'failure',
    url: 'https://example.com/missing',
    title: '',
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

test('onLoadEnd fires exactly once after a successful load completion', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 42,
      outcome: 'success',
      url: 'https://example.com',
      title: 'Example Domain',
    })
  )

  assert.equal(
    spy.calls.length,
    1,
    'onLoadEnd must fire exactly once per successful navigation-finish'
  )
})

test('onLoadEnd fires exactly once after a FAILED load completion', () => {
  // onLoadEnd is the terminal event — failure is still a completion.
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makeFailurePayload({
      navigationId: 7,
      outcome: 'failure',
      url: 'https://invalid.example.com/page',
      title: '',
    })
  )

  assert.equal(
    spy.calls.length,
    1,
    'onLoadEnd must fire exactly once per failed navigation, not zero times'
  )
})

test('onLoadEnd payload carries the correct url on success', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      outcome: 'success',
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

test('onLoadEnd payload carries the correct url on failure', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makeFailurePayload({
      navigationId: 1,
      url: 'https://invalid.example.com/page',
    })
  )

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.url,
    'https://invalid.example.com/page',
    'url must be forwarded verbatim even on failure'
  )
})

test('onLoadEnd payload carries the correct title on success', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      outcome: 'success',
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

test('onLoadEnd payload accepts empty title on failure (document never resolved)', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(makeFailurePayload({ navigationId: 1, title: '' }))

  assert.equal(spy.calls.length, 1)
  assert.equal(spy.calls[0]?.nativeEvent.title, '')
})

test('onLoadEnd payload has loading=false on success (load has completed)', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(makePayload({ navigationId: 1, outcome: 'success' }))

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.loading,
    false,
    'loading must be false at load-end'
  )
})

test('onLoadEnd payload has loading=false on failure (load has terminated)', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(makeFailurePayload({ navigationId: 1 }))

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.loading,
    false,
    'loading must be false at load-end on failure too — failure is terminal'
  )
})

test('payload is wrapped in `{ nativeEvent }` shape, not a plain string', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 7,
      outcome: 'success',
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

test('internal `navigationId` and `outcome` transport details are NOT leaked into nativeEvent', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 999,
      outcome: 'success',
      url: 'https://example.com',
    })
  )

  assert.equal(spy.calls.length, 1)
  const nativeEvent = spy.calls[0]?.nativeEvent ?? {}
  assert.equal(
    'navigationId' in nativeEvent,
    false,
    'navigationId is transport-internal and must not surface in the JS event'
  )
  assert.equal(
    'outcome' in nativeEvent,
    false,
    'outcome is transport-internal and must not surface in the JS event'
  )
})

test('duplicate native fires for the SAME navigation+outcome produce exactly ONE JS call', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  const payload = makePayload({
    navigationId: 100,
    outcome: 'success',
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

test('cross-outcome dedupe: failure then stray success for the SAME navigation fires onLoadEnd ONCE', () => {
  // The first observed terminal event wins. On iOS, a failure can be
  // followed by a stray `didFinishNavigation:` when part of the page
  // rendered before the error.
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makeFailurePayload({
      navigationId: 200,
      url: 'https://example.com/bad',
    })
  )
  dispatch(
    makePayload({
      navigationId: 200,
      outcome: 'success',
      url: 'https://example.com/bad',
      title: 'Bad',
    })
  )

  assert.equal(
    spy.calls.length,
    1,
    'a stray success after a failure (same navigationId) must NOT produce a duplicate onLoadEnd'
  )
  assert.equal(spy.calls[0]?.nativeEvent.url, 'https://example.com/bad')
  assert.equal(spy.calls[0]?.nativeEvent.title, '')
})

test('cross-outcome dedupe: success then stray failure for the SAME navigation fires onLoadEnd ONCE', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 201,
      outcome: 'success',
      url: 'https://example.com',
      title: 'Example Domain',
    })
  )
  dispatch(
    makeFailurePayload({
      navigationId: 201,
      url: 'https://example.com',
    })
  )

  assert.equal(
    spy.calls.length,
    1,
    'a stray failure after a success (same navigationId) must NOT produce a duplicate onLoadEnd'
  )
  assert.equal(spy.calls[0]?.nativeEvent.title, 'Example Domain')
})

test('a NEW navigation (different navigationId) DOES fire onLoadEnd again', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      outcome: 'success',
      url: 'https://example.com',
      title: 'Example Domain',
    })
  )
  dispatch(
    makePayload({
      navigationId: 2,
      outcome: 'success',
      url: 'https://example.com/next',
      title: 'Next',
    })
  )

  assert.equal(
    spy.calls.length,
    2,
    'each distinct navigation must fire onLoadEnd exactly once'
  )
  assert.equal(spy.calls[0]?.nativeEvent.url, 'https://example.com')
  assert.equal(spy.calls[1]?.nativeEvent.url, 'https://example.com/next')
})

test('a NEW navigation that FAILS after a previous SUCCESS does fire onLoadEnd again', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  dispatch(
    makePayload({
      navigationId: 1,
      outcome: 'success',
      url: 'https://example.com',
      title: 'Example Domain',
    })
  )
  dispatch(
    makeFailurePayload({
      navigationId: 2,
      url: 'https://invalid.example.com',
    })
  )

  assert.equal(
    spy.calls.length,
    2,
    'distinct navigations must each produce exactly one onLoadEnd, regardless of outcome'
  )
  assert.equal(spy.calls[0]?.nativeEvent.url, 'https://example.com')
  assert.equal(spy.calls[1]?.nativeEvent.url, 'https://invalid.example.com')
})

test('dispatcher is a safe no-op when no onLoadEnd handler is subscribed', () => {
  const dispatch = createLoadEndDispatcher(undefined)

  assert.doesNotThrow(() =>
    dispatch(
      makePayload({ navigationId: 1, outcome: 'success', url: 'https://example.com' })
    )
  )
  assert.doesNotThrow(() =>
    dispatch(makeFailurePayload({ navigationId: 2, url: 'https://example.com' }))
  )
})

test('no-handler dispatcher still records navigationIds so later stray fires for the same nav are suppressed', () => {
  // Without a handler, the dispatcher must still consume navigationIds
  // for dedupe bookkeeping. Observed indirectly via no-throw behaviour.
  const dispatch = createLoadEndDispatcher(undefined)

  assert.doesNotThrow(() => {
    dispatch(makeFailurePayload({ navigationId: 50 }))
    dispatch(makePayload({ navigationId: 50, outcome: 'success' }))
    dispatch(makePayload({ navigationId: 50, outcome: 'success' }))
  })
})

test('null/undefined native payload throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  assert.throws(
    () => dispatch(null as unknown as NativeLoadEndPayload),
    TypeError
  )
  assert.throws(
    () => dispatch(undefined as unknown as NativeLoadEndPayload),
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
  const dispatch = createLoadEndDispatcher(spy.handler)

  const badPayload = {
    outcome: 'success',
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  } as unknown as NativeLoadEndPayload

  assert.throws(() => dispatch(badPayload), TypeError)
  assert.equal(spy.calls.length, 0)
})

test('missing outcome throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  const badPayload = {
    navigationId: 1,
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  } as unknown as NativeLoadEndPayload

  assert.throws(() => dispatch(badPayload), TypeError)
  assert.equal(spy.calls.length, 0)
})

test('unknown outcome value throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  const badPayload = {
    navigationId: 1,
    outcome: 'cancelled' as unknown as 'success',
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  } as unknown as NativeLoadEndPayload

  assert.throws(() => dispatch(badPayload), TypeError)
  assert.equal(spy.calls.length, 0)
})

test('non-string url in payload throws TypeError', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        outcome: 'success',
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
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        outcome: 'success',
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

test('loading !== false in payload throws TypeError (this is a terminal event)', () => {
  const spy = createSpy()
  const dispatch = createLoadEndDispatcher(spy.handler)

  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        outcome: 'failure',
        url: 'https://example.com',
        title: '',
        loading: true as unknown as false,
        canGoBack: false,
        canGoForward: false,
      }),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})
