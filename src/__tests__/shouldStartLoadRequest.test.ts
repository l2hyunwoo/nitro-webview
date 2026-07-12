/**
 * ShouldStartLoadRequest payload-shape and prop-contract tests.
 *
 * The native sides (iOS WKWebView via `decidePolicyFor navigationAction`
 * and Android WebViewClient via `shouldOverrideUrlLoading`) emit a raw
 * `ShouldStartLoadRequest` object. On the JS side the
 * `onShouldStartLoadWithRequest` prop receives the payload directly and
 * MUST return `Promise<boolean>` — resolving `true` allows the
 * navigation, `false` cancels it.
 *
 * Unlike react-native-webview the contract is a single async Promise
 * round-trip — no `lockIdentifier`, no synchronous boolean variant.
 *
 * The suite follows the existing node:test convention used by every
 * other test under `src/__tests__/`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  NitroWebViewProps,
  ShouldStartLoadRequest,
  WebViewNavigationType,
} from '../specs/NitroWebView.nitro.ts'

/**
 * Stubbed native emit that mirrors the platform → JS bridge: the native
 * side hands a `ShouldStartLoadRequest` to the user-supplied handler
 * and awaits the resulting `Promise<boolean>`. The function returns the
 * resolved boolean so tests can assert allow/cancel verdicts directly.
 */
async function emitShouldStart(
  payload: ShouldStartLoadRequest,
  handler: NitroWebViewProps['onShouldStartLoadWithRequest']
): Promise<boolean> {
  if (payload == null) {
    throw new TypeError(
      'NitroWebView: onShouldStartLoadWithRequest native payload is required'
    )
  }
  if (typeof payload.url !== 'string') {
    throw new TypeError(
      'NitroWebView: onShouldStartLoadWithRequest payload must include a string `url`'
    )
  }
  if (handler === undefined) {
    // Allow-all default mirrors the documented "prop unset = allow"
    // behavior on both platforms.
    return true
  }
  return await handler(payload)
}

function createSpy() {
  const calls: ShouldStartLoadRequest[] = []
  const handler = async (event: ShouldStartLoadRequest): Promise<boolean> => {
    calls.push(event)
    return true
  }
  return { handler, calls }
}

test('payload includes required `url` and `navigationType` fields', async () => {
  const spy = createSpy()
  await emitShouldStart(
    { url: 'https://example.com/page', navigationType: 'click' },
    spy.handler
  )

  assert.equal(spy.calls.length, 1)
  const event = spy.calls[0]
  assert.ok(event)
  assert.equal(event.url, 'https://example.com/page')
  assert.equal(event.navigationType, 'click')
})

test('iOS optional fields (mainDocumentURL / isTopFrame / hasTargetFrame) round-trip', async () => {
  const spy = createSpy()
  const payload: ShouldStartLoadRequest = {
    url: 'https://example.com/iframe.html',
    navigationType: 'click',
    mainDocumentURL: 'https://example.com/',
    isTopFrame: true,
    hasTargetFrame: true,
  }
  await emitShouldStart(payload, spy.handler)
  assert.deepEqual(spy.calls[0], payload satisfies ShouldStartLoadRequest)
})

test('sub-frame payload round-trips with isTopFrame:false', async () => {
  // Sub-frame (iframe) navigations surface with isTopFrame:false on both
  // platforms — iOS always, Android only when interceptSubframeNavigation is
  // enabled. hasTargetFrame stays iOS-only (undefined on Android).
  const spy = createSpy()
  const payload: ShouldStartLoadRequest = {
    url: 'https://tracker.example/iframe',
    navigationType: 'other',
    isTopFrame: false,
    hasTargetFrame: true,
  }
  await emitShouldStart(payload, spy.handler)
  const event = spy.calls[0]
  assert.ok(event)
  assert.equal(event.isTopFrame, false)
  assert.equal(event.hasTargetFrame, true)
})

test('Android-style payload leaves iOS-only optional fields undefined', async () => {
  // The Android client (`WebViewClient.shouldOverrideUrlLoading`) does not
  // expose `mainDocumentURL`, `isTopFrame`, or `hasTargetFrame`. Each
  // must be omitted (or undefined) — not coerced to false / empty string.
  const spy = createSpy()
  await emitShouldStart(
    { url: 'https://example.com/click', navigationType: 'other' },
    spy.handler
  )
  const event = spy.calls[0]
  assert.ok(event)
  assert.equal(event.mainDocumentURL, undefined)
  assert.equal(event.isTopFrame, undefined)
  assert.equal(event.hasTargetFrame, undefined)
})

test('handler returning Promise<true> allows the navigation', async () => {
  const handler = async (_event: ShouldStartLoadRequest) => true
  const result = await emitShouldStart(
    { url: 'https://example.com', navigationType: 'click' },
    handler
  )
  assert.equal(result, true)
})

test('handler returning Promise<false> cancels the navigation', async () => {
  const handler = async (_event: ShouldStartLoadRequest) => false
  const result = await emitShouldStart(
    { url: 'https://blocked.test', navigationType: 'click' },
    handler
  )
  assert.equal(result, false)
})

test('absent handler defaults to allow (prop unset = allow-all)', async () => {
  const result = await emitShouldStart(
    { url: 'https://example.com', navigationType: 'other' },
    undefined
  )
  assert.equal(result, true)
})

test('all six WebViewNavigationType variants are exercisable', async () => {
  const variants: WebViewNavigationType[] = [
    'click',
    'formsubmit',
    'backforward',
    'reload',
    'formresubmit',
    'other',
  ]
  for (const navigationType of variants) {
    const spy = createSpy()
    await emitShouldStart(
      { url: 'https://example.com/' + navigationType, navigationType },
      spy.handler
    )
    assert.equal(spy.calls.length, 1)
    assert.equal(spy.calls[0]?.navigationType, navigationType)
  }
})

test('null/undefined native payload throws TypeError', async () => {
  const spy = createSpy()
  await assert.rejects(
    () =>
      emitShouldStart(null as unknown as ShouldStartLoadRequest, spy.handler),
    TypeError
  )
  await assert.rejects(
    () =>
      emitShouldStart(
        undefined as unknown as ShouldStartLoadRequest,
        spy.handler
      ),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})

test('non-string url in payload throws TypeError', async () => {
  const spy = createSpy()
  await assert.rejects(
    () =>
      emitShouldStart(
        { url: 42 as unknown as string, navigationType: 'click' },
        spy.handler
      ),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})

test('prop signature is assignable to (event) => Promise<boolean>', () => {
  // Compile-time pin: the spec must expose the prop as a
  // `Promise<boolean>`-returning function; if a future refactor swaps it
  // for a synchronous boolean (RNW v12 style) this assignment fails
  // typecheck.
  const handler: NitroWebViewProps['onShouldStartLoadWithRequest'] = async (
    event
  ) => {
    return event.url.startsWith('https://')
  }
  assert.equal(typeof handler, 'function')
})

test('prop is optional on NitroWebViewProps (allow-all when unset)', () => {
  // Compile-time pin: omitting the prop must not be a type error.
  const props: NitroWebViewProps = {
    source: { uri: 'https://example.com' },
  }
  assert.equal(props.onShouldStartLoadWithRequest, undefined)
})
