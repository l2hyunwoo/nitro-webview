/**
 * SPA history-shim demux and behavior tests.
 *
 * The history shim ({@linkcode buildHistoryShimScript}) hooks
 * `history.pushState` / `replaceState` / `popstate` and posts the mapped
 * nav-type to a DEDICATED sink ({@linkcode HISTORY_SHIM_NAME} on iOS /
 * {@linkcode ANDROID_HISTORY_SHIM_NAME} on Android) — a channel separate from
 * the page `postMessage` bridge ({@linkcode BRIDGE_NAME}).
 *
 * The load-bearing invariant these tests pin: a history event NEVER reaches
 * the `onMessage` sink, and a page `postMessage` NEVER reaches the history
 * sink (demux by channel identity, not payload inspection). Plus nav-type
 * mapping (pushState/replaceState → 'other', popstate → 'backforward') and
 * idempotence of re-injection.
 *
 * Same node:test harness / sandbox style as `bridge-script.test.ts`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ANDROID_HISTORY_SHIM_NAME,
  ANDROID_NATIVE_BRIDGE_NAME,
  BRIDGE_NAME,
  HISTORY_SHIM_NAME,
  buildHistoryShimScript,
  evaluateBridgeScript,
  evaluateHistoryShim,
  type AndroidHistorySandbox,
  type IosHistorySandbox,
} from '../bridgeScript.ts'

function historySink() {
  const calls: string[] = []
  return {
    postMessage: (t: string): void => {
      calls.push(t)
    },
    calls,
  }
}

/**
 * Minimal iOS history sandbox. `history.pushState`/`replaceState` are plain
 * no-ops that the shim wraps; `setTimeout` runs its callback inline so the
 * shim's `setTimeout(0)` fires synchronously within the test. `fireEvent`
 * lets a test dispatch the `popstate` listener the shim registered.
 */
function iosHistorySandbox(sink: ReturnType<typeof historySink>): {
  sandbox: IosHistorySandbox
  fireEvent: (type: string) => void
} {
  const listeners: Record<string, () => void> = {}
  const sandbox: IosHistorySandbox = {
    webkit: { messageHandlers: { [HISTORY_SHIM_NAME]: sink } },
    history: { pushState: () => {}, replaceState: () => {} },
    addEventListener: (t, cb) => {
      listeners[t] = cb
    },
    setTimeout: (cb) => {
      cb()
    },
  }
  return { sandbox, fireEvent: (t) => listeners[t]?.() }
}

function androidHistorySandbox(sink: ReturnType<typeof historySink>): {
  sandbox: AndroidHistorySandbox
  fireEvent: (type: string) => void
} {
  const listeners: Record<string, () => void> = {}
  const sandbox: AndroidHistorySandbox = {
    [ANDROID_HISTORY_SHIM_NAME]: sink,
    history: { pushState: () => {}, replaceState: () => {} },
    addEventListener: (t, cb) => {
      listeners[t] = cb
    },
    setTimeout: (cb) => {
      cb()
    },
  }
  return { sandbox, fireEvent: (t) => listeners[t]?.() }
}

test('pushState notifies the history sink with "other" — and NOTHING reaches onMessage', () => {
  const nav = historySink()
  const msg: string[] = []
  const { sandbox } = iosHistorySandbox(nav)
  // Give it the user-message bridge sink too, to prove isolation:
  ;(
    sandbox as unknown as {
      webkit: {
        messageHandlers: Record<string, { postMessage: (d: string) => void }>
      }
    }
  ).webkit.messageHandlers[BRIDGE_NAME] = {
    postMessage: (d: string) => msg.push(d),
  }

  evaluateHistoryShim('ios', sandbox)
  sandbox.history.pushState({}, '', '/route-a') // SPA route change

  assert.deepEqual(
    nav.calls,
    ['other'],
    'pushState must post "other" to the history sink'
  )
  assert.equal(
    msg.length,
    0,
    'a nav event must NEVER reach the ReactNativeWebView onMessage sink'
  )
})

test('replaceState → "other", popstate → "backforward"', () => {
  const nav = historySink()
  const { sandbox, fireEvent } = iosHistorySandbox(nav)
  evaluateHistoryShim('ios', sandbox)

  sandbox.history.replaceState({}, '', '/b')
  fireEvent('popstate')

  assert.deepEqual(nav.calls, ['other', 'backforward'])
})

test('Android: pushState/replaceState/popstate route to the Android history sink', () => {
  const nav = historySink()
  const { sandbox, fireEvent } = androidHistorySandbox(nav)
  evaluateHistoryShim('android', sandbox)

  sandbox.history.pushState({}, '', '/a')
  sandbox.history.replaceState({}, '', '/b')
  fireEvent('popstate')

  assert.deepEqual(nav.calls, ['other', 'other', 'backforward'])
})

test('the wrapped history method still runs (return value + side effect preserved)', () => {
  const nav = historySink()
  const { sandbox } = iosHistorySandbox(nav)
  let pushed: unknown[] | null = null
  sandbox.history.pushState = ((...args: unknown[]) => {
    pushed = args
    return 'sentinel'
  }) as unknown as IosHistorySandbox['history']['pushState']

  evaluateHistoryShim('ios', sandbox)
  const rv = (
    sandbox.history.pushState as unknown as (...a: unknown[]) => unknown
  )({ s: 1 }, '', '/x')

  assert.deepEqual(
    pushed,
    [{ s: 1 }, '', '/x'],
    'original pushState must run with its args'
  )
  assert.equal(
    rv,
    'sentinel',
    'the wrapper must forward the original return value'
  )
  assert.deepEqual(nav.calls, ['other'])
})

test('re-injection is idempotent (guard) — pushState fires exactly ONE notification', () => {
  const nav = historySink()
  const { sandbox } = iosHistorySandbox(nav)
  evaluateHistoryShim('ios', sandbox)
  evaluateHistoryShim('ios', sandbox) // simulate onPageStarted re-inject
  sandbox.history.pushState({}, '', '/c')
  assert.deepEqual(
    nav.calls,
    ['other'],
    're-injection must not double-wrap pushState'
  )
})

test('reverse isolation: a page message on ReactNativeWebView never reaches the history sink', () => {
  const nav = historySink()
  const sandbox: {
    webkit: {
      messageHandlers: Record<string, { postMessage: (d: string) => void }>
    }
  } = {
    webkit: {
      messageHandlers: {
        [BRIDGE_NAME]: { postMessage: () => {} },
        [HISTORY_SHIM_NAME]: nav,
      },
    },
  }
  evaluateBridgeScript('ios', sandbox as never)
  // Even a payload that *looks* like a nav envelope must not spill over:
  ;(sandbox as never as Record<string, { postMessage: (d: string) => void }>)[
    BRIDGE_NAME
  ].postMessage('{"__nitro_nav__":"/x"}')
  assert.equal(
    nav.calls.length,
    0,
    'the user channel must not spill into the history sink'
  )
})

test('each platform shim targets its own sink and hooks all three history APIs', () => {
  const ios = buildHistoryShimScript('ios')
  assert.ok(ios.includes(`messageHandlers.${HISTORY_SHIM_NAME}`))
  assert.ok(!ios.includes(ANDROID_HISTORY_SHIM_NAME))
  assert.ok(!ios.includes(`messageHandlers.${BRIDGE_NAME}`))

  const android = buildHistoryShimScript('android')
  assert.ok(android.includes(`window.${ANDROID_HISTORY_SHIM_NAME}`))
  assert.ok(!android.includes('webkit.messageHandlers'))
  assert.ok(!android.includes(ANDROID_NATIVE_BRIDGE_NAME))

  for (const src of [ios, android]) {
    assert.ok(src.includes('history.pushState'))
    assert.ok(src.includes('history.replaceState'))
    assert.ok(src.includes("'popstate'"))
  }
})
