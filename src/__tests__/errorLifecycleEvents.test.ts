/**
 * Dispatcher contract tests for the error & lifecycle events group:
 * `onHttpError`, `onRenderProcessGone`, and `onScroll`.
 *
 * http-error and process-gone dedupe by `navigationId` (matching
 * `createErrorDispatcher`); scroll is explicitly NOT deduped — every native
 * tick is a distinct user-visible event.
 *
 * Run via `node --test --experimental-strip-types` (package.json:scripts.test).
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createHttpErrorDispatcher,
  createRenderProcessGoneDispatcher,
  createScrollDispatcher,
  type NativeHttpErrorPayload,
  type NativeRenderProcessGonePayload,
  type NativeScrollPayload,
} from '../events.ts'
import type {
  NitroWebViewHttpErrorEvent,
  NitroWebViewRenderProcessGoneEvent,
  NitroWebViewScrollEvent,
} from '../specs/NitroWebView.nitro.ts'

function makeHttpErrorPayload(
  overrides: Partial<NativeHttpErrorPayload> = {}
): NativeHttpErrorPayload {
  return {
    navigationId: 1,
    statusCode: 404,
    url: 'https://example.com/missing',
    description: 'not found',
    ...overrides,
  }
}

function makeScrollPayload(
  overrides: Partial<NativeScrollPayload> = {}
): NativeScrollPayload {
  return {
    contentOffset: { x: 0, y: 0 },
    contentSize: { x: 0, y: 0 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// onHttpError
// ---------------------------------------------------------------------------

test('onHttpError wraps the native payload under `nativeEvent`', () => {
  const calls: NitroWebViewHttpErrorEvent[] = []
  const dispatch = createHttpErrorDispatcher((e) => calls.push(e))

  dispatch(makeHttpErrorPayload({ statusCode: 500, description: 'server error' }))

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.nativeEvent, {
    statusCode: 500,
    url: 'https://example.com/missing',
    description: 'server error',
  })
})

test('onHttpError dedupes by navigationId (redirect hops coalesce)', () => {
  const calls: NitroWebViewHttpErrorEvent[] = []
  const dispatch = createHttpErrorDispatcher((e) => calls.push(e))

  dispatch(makeHttpErrorPayload({ navigationId: 7, statusCode: 404 }))
  dispatch(makeHttpErrorPayload({ navigationId: 7, statusCode: 500 }))

  assert.equal(calls.length, 1, 'a second fire for the same navigation is dropped')
  assert.equal(calls[0]?.nativeEvent.statusCode, 404)
})

test('onHttpError fires again for a new navigationId', () => {
  const calls: NitroWebViewHttpErrorEvent[] = []
  const dispatch = createHttpErrorDispatcher((e) => calls.push(e))

  dispatch(makeHttpErrorPayload({ navigationId: 1 }))
  dispatch(makeHttpErrorPayload({ navigationId: 2 }))

  assert.equal(calls.length, 2)
})

test('onHttpError is a safe no-op when no handler is subscribed', () => {
  const dispatch = createHttpErrorDispatcher(undefined)
  assert.doesNotThrow(() => dispatch(makeHttpErrorPayload()))
})

test('onHttpError throws on malformed payloads', () => {
  const dispatch = createHttpErrorDispatcher(() => {})
  assert.throws(
    () => dispatch(null as unknown as NativeHttpErrorPayload),
    TypeError
  )
  assert.throws(
    () => dispatch(makeHttpErrorPayload({ statusCode: '404' as unknown as number })),
    TypeError
  )
  assert.throws(
    () => dispatch(makeHttpErrorPayload({ url: 42 as unknown as string })),
    TypeError
  )
})

// ---------------------------------------------------------------------------
// onRenderProcessGone
// ---------------------------------------------------------------------------

test('onRenderProcessGone forwards didCrash (Android: real boolean)', () => {
  const calls: NitroWebViewRenderProcessGoneEvent[] = []
  const dispatch = createRenderProcessGoneDispatcher((e) => calls.push(e))

  dispatch({ navigationId: 1, didCrash: true })

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.nativeEvent.didCrash, true)
})

test('onRenderProcessGone allows undefined didCrash (iOS has no discriminator)', () => {
  const calls: NitroWebViewRenderProcessGoneEvent[] = []
  const dispatch = createRenderProcessGoneDispatcher((e) => calls.push(e))

  dispatch({ navigationId: 1 })

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.nativeEvent.didCrash, undefined)
})

test('onRenderProcessGone dedupes by navigationId', () => {
  const calls: NitroWebViewRenderProcessGoneEvent[] = []
  const dispatch = createRenderProcessGoneDispatcher((e) => calls.push(e))

  dispatch({ navigationId: 3, didCrash: false })
  dispatch({ navigationId: 3, didCrash: true })

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.nativeEvent.didCrash, false)
})

test('onRenderProcessGone throws on non-boolean didCrash', () => {
  const dispatch = createRenderProcessGoneDispatcher(() => {})
  assert.throws(
    () =>
      dispatch({
        navigationId: 1,
        didCrash: 'yes' as unknown as boolean,
      } as NativeRenderProcessGonePayload),
    TypeError
  )
})

// ---------------------------------------------------------------------------
// onScroll — NOT deduped
// ---------------------------------------------------------------------------

test('onScroll forwards the payload verbatim under `nativeEvent`', () => {
  const calls: NitroWebViewScrollEvent[] = []
  const dispatch = createScrollDispatcher((e) => calls.push(e))

  const payload = makeScrollPayload({
    contentOffset: { x: 10, y: 200 },
    contentSize: { x: 320, y: 4000 },
    contentInset: { x: 0, y: 44 },
    layoutMeasurement: { x: 320, y: 640 },
    zoomScale: 1,
  })
  dispatch(payload)

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.nativeEvent, payload)
})

test('onScroll is NOT deduped — 3 emits produce 3 callbacks in order', () => {
  const calls: NitroWebViewScrollEvent[] = []
  const dispatch = createScrollDispatcher((e) => calls.push(e))

  dispatch(makeScrollPayload({ contentOffset: { x: 0, y: 10 } }))
  dispatch(makeScrollPayload({ contentOffset: { x: 0, y: 20 } }))
  dispatch(makeScrollPayload({ contentOffset: { x: 0, y: 30 } }))

  assert.equal(calls.length, 3)
  assert.equal(calls[0]?.nativeEvent.contentOffset.y, 10)
  assert.equal(calls[1]?.nativeEvent.contentOffset.y, 20)
  assert.equal(calls[2]?.nativeEvent.contentOffset.y, 30)
})

test('onScroll is a safe no-op when no handler is subscribed', () => {
  const dispatch = createScrollDispatcher(undefined)
  assert.doesNotThrow(() => dispatch(makeScrollPayload()))
})

test('onScroll throws when contentOffset is missing', () => {
  const dispatch = createScrollDispatcher(() => {})
  assert.throws(
    () =>
      dispatch({
        contentSize: { x: 0, y: 0 },
      } as unknown as NativeScrollPayload),
    TypeError
  )
})
