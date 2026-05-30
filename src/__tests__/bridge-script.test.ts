import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ANDROID_NATIVE_BRIDGE_NAME,
  BRIDGE_NAME,
  buildBridgeScript,
  evaluateBridgeScript,
  type AndroidBridgeSandbox,
  type IosBridgeSandbox,
} from '../bridgeScript.ts'

function createSpy() {
  const calls: unknown[] = []
  const postMessage = (data: unknown): void => {
    calls.push(data)
  }
  return { postMessage, calls }
}

function makeIosSandbox(spy: ReturnType<typeof createSpy>): IosBridgeSandbox {
  return {
    webkit: {
      messageHandlers: {
        [BRIDGE_NAME]: { postMessage: spy.postMessage },
      },
    },
  }
}

function makeAndroidSandbox(
  spy: ReturnType<typeof createSpy>
): AndroidBridgeSandbox {
  return {
    [ANDROID_NATIVE_BRIDGE_NAME]: { postMessage: spy.postMessage },
  }
}

test("iOS: evaluate script in JS sandbox, call window.ReactNativeWebView.postMessage('x'), assert correct native handler invocation", () => {
  const spy = createSpy()
  const sandbox = makeIosSandbox(spy)

  evaluateBridgeScript('ios', sandbox)

  const bridge = sandbox[BRIDGE_NAME]
  assert.ok(
    bridge,
    'evaluation must install `window.ReactNativeWebView` on the sandbox'
  )
  assert.equal(
    typeof bridge?.postMessage,
    'function',
    '`window.ReactNativeWebView.postMessage` must be a function the page can call'
  )

  bridge?.postMessage?.('x')

  assert.equal(
    spy.calls.length,
    1,
    'the iOS WKScriptMessageHandler spy must receive exactly one postMessage call'
  )
  assert.equal(
    spy.calls[0],
    'x',
    "the iOS native handler must receive the literal string 'x'"
  )
})

test("Android: evaluate script in JS sandbox, call window.ReactNativeWebView.postMessage('x'), assert correct native handler invocation", () => {
  const spy = createSpy()
  const sandbox = makeAndroidSandbox(spy)

  evaluateBridgeScript('android', sandbox)

  const bridge = sandbox[BRIDGE_NAME]
  assert.ok(
    bridge,
    'evaluation must install `window.ReactNativeWebView` on the sandbox'
  )
  assert.equal(
    typeof bridge?.postMessage,
    'function',
    '`window.ReactNativeWebView.postMessage` must be a function the page can call'
  )

  bridge?.postMessage?.('x')

  assert.equal(
    spy.calls.length,
    1,
    'the Android @JavascriptInterface spy must receive exactly one postMessage call'
  )
  assert.equal(
    spy.calls[0],
    'x',
    "the Android native handler must receive the literal string 'x'"
  )
})

test('iOS: payload routes ONLY to the WebKit messageHandler, never to the Android JS interface', () => {
  const wkSpy = createSpy()
  const androidSpy = createSpy()

  const sandbox: IosBridgeSandbox & AndroidBridgeSandbox = {
    webkit: {
      messageHandlers: {
        [BRIDGE_NAME]: { postMessage: wkSpy.postMessage },
      },
    },
    [ANDROID_NATIVE_BRIDGE_NAME]: { postMessage: androidSpy.postMessage },
  }

  evaluateBridgeScript('ios', sandbox)
  sandbox[BRIDGE_NAME]?.postMessage?.('hello')

  assert.equal(wkSpy.calls.length, 1, 'iOS routing must hit the WebKit sink')
  assert.equal(wkSpy.calls[0], 'hello')
  assert.equal(
    androidSpy.calls.length,
    0,
    'iOS routing MUST NOT touch the Android JS-interface sink'
  )
})

test('Android: payload routes ONLY to the JS-interface handler, never to the WebKit messageHandler', () => {
  const wkSpy = createSpy()
  const androidSpy = createSpy()

  const sandbox: IosBridgeSandbox & AndroidBridgeSandbox = {
    webkit: {
      messageHandlers: {
        [BRIDGE_NAME]: { postMessage: wkSpy.postMessage },
      },
    },
    [ANDROID_NATIVE_BRIDGE_NAME]: { postMessage: androidSpy.postMessage },
  }

  evaluateBridgeScript('android', sandbox)
  sandbox[BRIDGE_NAME]?.postMessage?.('hello')

  assert.equal(
    androidSpy.calls.length,
    1,
    'Android routing must hit the JS-interface sink'
  )
  assert.equal(androidSpy.calls[0], 'hello')
  assert.equal(
    wkSpy.calls.length,
    0,
    'Android routing MUST NOT touch the WebKit messageHandler sink'
  )
})

test('string payload is forwarded verbatim (no trimming, no parsing, no transformation)', () => {
  const cases: string[] = [
    '',
    '  leading and trailing whitespace  ',
    '{"k":"v","n":42}',
    '漢字 🎉 \n multiline\t tab',
    '</script><script>alert(1)</script>',
  ]

  for (const raw of cases) {
    const spy = createSpy()
    const sandbox = makeIosSandbox(spy)
    evaluateBridgeScript('ios', sandbox)
    sandbox[BRIDGE_NAME]?.postMessage?.(raw)
    assert.equal(spy.calls.length, 1)
    assert.equal(
      spy.calls[0],
      raw,
      `payload must be forwarded byte-for-byte (case: ${JSON.stringify(raw)})`
    )
  }
})

test('non-string payloads are string-coerced before routing', () => {
  // The onMessage contract requires `nativeEvent.data: string`. Android
  // would crash on a non-string JI argument; iOS would deliver an NSNumber
  // body that breaks downstream consumers.
  type Case = { input: unknown; expected: string }
  const cases: Case[] = [
    { input: 123, expected: '123' },
    { input: true, expected: 'true' },
    { input: null, expected: 'null' },
    { input: { a: 1 }, expected: '[object Object]' },
  ]

  for (const { input, expected } of cases) {
    const spy = createSpy()
    const sandbox = makeAndroidSandbox(spy)
    evaluateBridgeScript('android', sandbox)
    sandbox[BRIDGE_NAME]?.postMessage?.(input)
    assert.equal(spy.calls.length, 1)
    assert.equal(
      spy.calls[0],
      expected,
      `non-string input ${JSON.stringify(input)} must be coerced to ${JSON.stringify(expected)}`
    )
    assert.equal(
      typeof spy.calls[0],
      'string',
      'coerced payload must be a string'
    )
  }
})

test('N successive postMessage calls produce N native dispatches (no coalescing)', () => {
  const spy = createSpy()
  const sandbox = makeIosSandbox(spy)
  evaluateBridgeScript('ios', sandbox)

  const messages = ['one', 'two', 'three']
  for (const m of messages) {
    sandbox[BRIDGE_NAME]?.postMessage?.(m)
  }

  assert.equal(spy.calls.length, messages.length)
  assert.deepEqual(spy.calls, messages)
})

test('re-evaluating the script does NOT replace the postMessage function reference (idempotent install)', () => {
  // On Android the script is re-injected on every onPageStarted, including
  // iframe loads. Idempotence preserves any page-author shim and any
  // captured function references across re-injections.
  const spy = createSpy()
  const sandbox: AndroidBridgeSandbox = {
    [ANDROID_NATIVE_BRIDGE_NAME]: { postMessage: spy.postMessage },
  }

  evaluateBridgeScript('android', sandbox)
  const wiredOnce = sandbox[BRIDGE_NAME]?.postMessage
  assert.equal(typeof wiredOnce, 'function')

  evaluateBridgeScript('android', sandbox)
  assert.equal(
    sandbox[BRIDGE_NAME]?.postMessage,
    wiredOnce,
    're-evaluation must NOT replace the postMessage function reference'
  )

  sandbox[BRIDGE_NAME]?.postMessage?.('after-reinject')
  assert.equal(spy.calls.length, 1)
  assert.equal(spy.calls[0], 'after-reinject')
})

test('page-author preinstalled postMessage is preserved verbatim', () => {
  const authorSpy = createSpy()
  const nativeSpy = createSpy()

  const authorPostMessage = (d: unknown) => authorSpy.postMessage(d)

  const sandbox: IosBridgeSandbox = {
    webkit: {
      messageHandlers: {
        [BRIDGE_NAME]: { postMessage: nativeSpy.postMessage },
      },
    },
    [BRIDGE_NAME]: { postMessage: authorPostMessage },
  }

  evaluateBridgeScript('ios', sandbox)

  assert.equal(
    sandbox[BRIDGE_NAME]?.postMessage,
    authorPostMessage,
    "the script must NOT replace the page-author's postMessage shim"
  )

  sandbox[BRIDGE_NAME]?.postMessage?.('routed-to-author')
  assert.equal(authorSpy.calls.length, 1)
  assert.equal(authorSpy.calls[0], 'routed-to-author')
  assert.equal(
    nativeSpy.calls.length,
    0,
    'native sink must NOT be hit when a page-author shim owns postMessage'
  )
})

test('pre-existing window.ReactNativeWebView object (page-author config) is preserved when postMessage is missing', () => {
  // The bridge must augment — not replace — when the page author has
  // attached config to the object before injection.
  const spy = createSpy()
  const sandbox: IosBridgeSandbox & {
    [BRIDGE_NAME]: { customConfig: number; postMessage?: never }
  } = {
    webkit: {
      messageHandlers: {
        [BRIDGE_NAME]: { postMessage: spy.postMessage },
      },
    },
    [BRIDGE_NAME]: { customConfig: 42 },
  }

  evaluateBridgeScript('ios', sandbox)

  assert.equal(
    sandbox[BRIDGE_NAME].customConfig,
    42,
    'page-author config on window.ReactNativeWebView must be preserved'
  )
  assert.equal(
    typeof (sandbox[BRIDGE_NAME] as { postMessage?: unknown }).postMessage,
    'function',
    'the missing postMessage must be installed alongside the preserved config'
  )

  ;(sandbox[BRIDGE_NAME] as { postMessage: (d: string) => void }).postMessage(
    'cfg'
  )
  assert.equal(spy.calls.length, 1)
  assert.equal(spy.calls[0], 'cfg')
})

test('iOS: a missing window.webkit chain is silently absorbed (no page-side TypeError)', () => {
  const sandbox: IosBridgeSandbox = {}
  evaluateBridgeScript('ios', sandbox)

  assert.doesNotThrow(() => {
    sandbox[BRIDGE_NAME]?.postMessage?.('x')
  }, 'a missing native sink must NOT throw into the page')
})

test('Android: a missing window.ReactNativeWebViewNative is silently absorbed (no page-side TypeError)', () => {
  const sandbox: AndroidBridgeSandbox = {}
  evaluateBridgeScript('android', sandbox)

  assert.doesNotThrow(() => {
    sandbox[BRIDGE_NAME]?.postMessage?.('x')
  }, 'a missing native sink must NOT throw into the page')
})

test('buildBridgeScript(ios) returns a string that references the WebKit messageHandlers chain', () => {
  const src = buildBridgeScript('ios')
  assert.equal(typeof src, 'string')
  assert.ok(
    src.includes('webkit.messageHandlers.ReactNativeWebView'),
    'iOS source must reference the WKScriptMessageHandler chain'
  )
  assert.ok(
    !src.includes('ReactNativeWebViewNative'),
    'iOS source must NOT reference the Android-only native bridge name'
  )
})

test('buildBridgeScript(android) returns a string that references the JS-interface bridge', () => {
  const src = buildBridgeScript('android')
  assert.equal(typeof src, 'string')
  assert.ok(
    src.includes('ReactNativeWebViewNative'),
    'Android source must reference the JS-interface bridge object'
  )
  assert.ok(
    !src.includes('webkit.messageHandlers'),
    'Android source must NOT reference the iOS-only WKScriptMessageHandler chain'
  )
})

test('both platform scripts install on `window.ReactNativeWebView` (parity)', () => {
  const ios = buildBridgeScript('ios')
  const android = buildBridgeScript('android')
  assert.ok(
    ios.includes('window.ReactNativeWebView'),
    'iOS script must install on window.ReactNativeWebView'
  )
  assert.ok(
    android.includes('window.ReactNativeWebView'),
    'Android script must install on window.ReactNativeWebView'
  )
})
