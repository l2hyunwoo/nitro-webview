import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createLoadStartDispatcher,
  createLoadDispatcher,
  createLoadEndDispatcher,
  type NativeLoadStartPayload,
  type NativeLoadPayload,
  type NativeLoadEndPayload,
} from '../events.ts'
import type { WebViewNavigationState } from '../specs/NitroWebView.nitro.ts'

interface LedgerEntry {
  event: 'onLoadStart' | 'onLoad' | 'onLoadEnd'
  url: string
}

/**
 * Build a handler set whose every invocation appends to a shared ledger,
 * so tests can assert the interleaved order across all three lifecycle
 * dispatchers — not just per-handler counts.
 */
function createOrderedHarness() {
  const ledger: LedgerEntry[] = []

  const onLoadStart = (event: {
    nativeEvent: WebViewNavigationState
  }): void => {
    ledger.push({ event: 'onLoadStart', url: event.nativeEvent.url })
  }
  const onLoad = (event: { nativeEvent: WebViewNavigationState }): void => {
    ledger.push({ event: 'onLoad', url: event.nativeEvent.url })
  }
  const onLoadEnd = (event: { nativeEvent: WebViewNavigationState }): void => {
    ledger.push({ event: 'onLoadEnd', url: event.nativeEvent.url })
  }

  return {
    ledger,
    dispatchStart: createLoadStartDispatcher(onLoadStart),
    dispatchLoad: createLoadDispatcher(onLoad),
    dispatchLoadEnd: createLoadEndDispatcher(onLoadEnd),
  }
}

function startPayload(
  navigationId: number,
  url: string
): NativeLoadStartPayload {
  return {
    navigationId,
    url,
    title: '',
    loading: true,
    canGoBack: false,
    canGoForward: false,
  }
}

function loadPayload(
  navigationId: number,
  url: string,
  title: string
): NativeLoadPayload {
  return {
    navigationId,
    url,
    title,
    loading: false,
    canGoBack: false,
    canGoForward: false,
  }
}

function loadEndPayload(
  navigationId: number,
  url: string,
  title: string,
  outcome: 'success' | 'failure' = 'success'
): NativeLoadEndPayload {
  return {
    navigationId,
    outcome,
    url,
    title,
    loading: false,
    canGoBack: false,
    canGoForward: false,
  }
}

test('onLoadStart -> onLoad -> onLoadEnd fire in strict sequence for a single navigation', () => {
  const harness = createOrderedHarness()
  const navigationId = 1
  const url = 'https://example.com'
  const title = 'Example Domain'

  // Simulate the native side for one full navigation: start, then a single
  // successful finish fanned out to both `onLoad` and the terminal
  // `onLoadEnd` (in that order).
  harness.dispatchStart(startPayload(navigationId, url))
  harness.dispatchLoad(loadPayload(navigationId, url, title))
  harness.dispatchLoadEnd(loadEndPayload(navigationId, url, title, 'success'))

  assert.deepEqual(
    harness.ledger.map((entry) => entry.event),
    ['onLoadStart', 'onLoad', 'onLoadEnd'],
    'event order MUST be exactly onLoadStart -> onLoad -> onLoadEnd'
  )

  // All three events must reference the same navigation — guards against a
  // degenerate pass where the ledger interleaves events from different navs.
  assert.equal(harness.ledger.length, 3, 'exactly three events per nav')
  assert.equal(harness.ledger[0]?.url, url)
  assert.equal(harness.ledger[1]?.url, url)
  assert.equal(harness.ledger[2]?.url, url)
})
