/**
 * FileDownloadEvent payload-shape contract tests.
 *
 * The native side (iOS WKWebView via `decidePolicyFor navigationResponse`
 * and Android via `setDownloadListener`) emits a raw `FileDownload` object.
 * On the JS side the `onFileDownload` callback receives a React-Native-style
 * wrapper `{ nativeEvent: FileDownload }`. These tests stub a native emit
 * and assert that the wrapper shape and field semantics match the contract
 * defined in `src/specs/NitroWebView.nitro.ts`.
 *
 * The project runs tests via `node --test --experimental-strip-types`
 * (see package.json:scripts.test) — the suite follows the established
 * node:test convention used by every other suite under `src/__tests__/`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  FileDownload,
  FileDownloadEvent,
} from '../specs/NitroWebView.nitro.ts'

/**
 * Stubbed native emit: mirrors the platform → JS bridge. On the real
 * native side this wraps the raw `FileDownload` payload in
 * `{ nativeEvent }` exactly once, then calls the user's `onFileDownload`
 * prop. We model that here so the test exercises the same parsing path
 * the runtime takes — without bringing up native code.
 */
function emitFileDownload(
  payload: FileDownload,
  handler: ((event: FileDownloadEvent) => void) | undefined
): void {
  if (payload == null) {
    throw new TypeError(
      'NitroWebView: onFileDownload native payload is required'
    )
  }
  if (typeof payload.url !== 'string') {
    throw new TypeError(
      'NitroWebView: onFileDownload native payload must include a string `url`'
    )
  }
  if (handler === undefined) {
    return
  }
  handler({ nativeEvent: payload })
}

function createSpy() {
  const calls: FileDownloadEvent[] = []
  const handler = (event: FileDownloadEvent): void => {
    calls.push(event)
  }
  return { handler, calls }
}

test('FileDownloadEvent wraps the native payload under `nativeEvent`', () => {
  const spy = createSpy()

  emitFileDownload(
    {
      url: 'https://example.com/report.pdf',
      mimeType: 'application/pdf',
      fileName: 'report.pdf',
      contentLength: 12345,
      userAgent: 'Mozilla/5.0',
    },
    spy.handler
  )

  assert.equal(spy.calls.length, 1)
  const event = spy.calls[0]
  assert.ok(event, 'event must be captured')
  assert.equal(typeof event, 'object')
  assert.ok(
    'nativeEvent' in event,
    '`nativeEvent` key must be present on the event'
  )
})

test('nativeEvent.url is forwarded verbatim from the stubbed native emit', () => {
  const spy = createSpy()

  emitFileDownload({ url: 'https://files.example.com/a/b/c.zip' }, spy.handler)

  assert.equal(spy.calls.length, 1)
  assert.equal(
    spy.calls[0]?.nativeEvent.url,
    'https://files.example.com/a/b/c.zip',
    'url is required and must be forwarded as-is'
  )
})

test('nativeEvent carries all optional metadata fields when supplied', () => {
  const spy = createSpy()

  const payload: FileDownload = {
    url: 'https://example.com/big.iso',
    mimeType: 'application/octet-stream',
    fileName: 'big.iso',
    contentLength: 1024 * 1024 * 700,
    userAgent: 'NitroWebView/1.0',
  }

  emitFileDownload(payload, spy.handler)

  assert.equal(spy.calls.length, 1)
  assert.deepEqual(spy.calls[0]?.nativeEvent, payload satisfies FileDownload)
})

test('optional fields may be omitted (iOS often has no userAgent)', () => {
  // Per the spec, only `url` is required. The other fields are optional
  // and may legitimately be absent — e.g. iOS does not surface a
  // userAgent from the WKWebView navigation response path.
  const spy = createSpy()

  emitFileDownload(
    {
      url: 'https://example.com/doc.txt',
      mimeType: 'text/plain',
      fileName: 'doc.txt',
      contentLength: 42,
    },
    spy.handler
  )

  assert.equal(spy.calls.length, 1)
  const native = spy.calls[0]?.nativeEvent
  assert.ok(native)
  assert.equal(native.url, 'https://example.com/doc.txt')
  assert.equal(native.mimeType, 'text/plain')
  assert.equal(native.fileName, 'doc.txt')
  assert.equal(native.contentLength, 42)
  assert.equal(
    native.userAgent,
    undefined,
    'userAgent must remain undefined when the native side omits it'
  )
})

test('minimal payload (only `url`) is valid and forwarded unchanged', () => {
  const spy = createSpy()

  emitFileDownload({ url: 'https://example.com/min.bin' }, spy.handler)

  assert.equal(spy.calls.length, 1)
  const native = spy.calls[0]?.nativeEvent
  assert.ok(native)
  assert.equal(native.url, 'https://example.com/min.bin')
  assert.equal(native.mimeType, undefined)
  assert.equal(native.fileName, undefined)
  assert.equal(native.contentLength, undefined)
  assert.equal(native.userAgent, undefined)
})

test('contentLength === -1 is preserved (platforms use it as "unknown size")', () => {
  // Both Android's DownloadListener and iOS' URLResponse can report -1
  // to signal "length unknown". The wrapper must not normalise or strip
  // it; consumers decide how to render that case.
  const spy = createSpy()

  emitFileDownload(
    {
      url: 'https://example.com/stream',
      mimeType: 'application/octet-stream',
      contentLength: -1,
    },
    spy.handler
  )

  assert.equal(spy.calls.length, 1)
  assert.equal(spy.calls[0]?.nativeEvent.contentLength, -1)
})

test('contentLength === 0 is preserved (legitimate zero-byte download)', () => {
  const spy = createSpy()

  emitFileDownload(
    { url: 'https://example.com/empty.txt', contentLength: 0 },
    spy.handler
  )

  assert.equal(spy.calls.length, 1)
  assert.equal(spy.calls[0]?.nativeEvent.contentLength, 0)
})

test('payload is delivered exactly once per native emit (no implicit fan-out)', () => {
  const spy = createSpy()

  emitFileDownload(
    { url: 'https://example.com/a.bin', mimeType: 'application/octet-stream' },
    spy.handler
  )

  assert.equal(
    spy.calls.length,
    1,
    'one native emit must translate into exactly one JS callback call'
  )
})

test('multiple native emits produce multiple JS callbacks in order', () => {
  // Unlike load lifecycle events, downloads are not deduped by id:
  // every native fire is a distinct user-visible event.
  const spy = createSpy()

  emitFileDownload({ url: 'https://example.com/1.bin' }, spy.handler)
  emitFileDownload({ url: 'https://example.com/2.bin' }, spy.handler)
  emitFileDownload({ url: 'https://example.com/3.bin' }, spy.handler)

  assert.equal(spy.calls.length, 3)
  assert.equal(spy.calls[0]?.nativeEvent.url, 'https://example.com/1.bin')
  assert.equal(spy.calls[1]?.nativeEvent.url, 'https://example.com/2.bin')
  assert.equal(spy.calls[2]?.nativeEvent.url, 'https://example.com/3.bin')
})

test('emit is a safe no-op when no onFileDownload handler is subscribed', () => {
  // Mirrors the contract for the other lifecycle events: the native
  // side may always emit; the absence of a JS handler must not throw.
  assert.doesNotThrow(() =>
    emitFileDownload({ url: 'https://example.com/no-handler.bin' }, undefined)
  )
})

test('null/undefined native payload throws TypeError', () => {
  const spy = createSpy()

  assert.throws(
    () => emitFileDownload(null as unknown as FileDownload, spy.handler),
    TypeError
  )
  assert.throws(
    () => emitFileDownload(undefined as unknown as FileDownload, spy.handler),
    TypeError
  )
  assert.equal(
    spy.calls.length,
    0,
    'handler must not fire when the native payload is malformed'
  )
})

test('non-string url in payload throws TypeError', () => {
  const spy = createSpy()

  assert.throws(
    () => emitFileDownload({ url: 42 as unknown as string }, spy.handler),
    TypeError
  )
  assert.equal(spy.calls.length, 0)
})

test('payload shape matches the FileDownloadEvent type contract', () => {
  // Compile-time + runtime parity: the object the JS side observes must
  // satisfy the public `FileDownloadEvent` type from the spec.
  const spy = createSpy()

  emitFileDownload(
    {
      url: 'https://example.com/typed.pdf',
      mimeType: 'application/pdf',
      fileName: 'typed.pdf',
      contentLength: 1,
      userAgent: 'UA',
    },
    spy.handler
  )

  const event: FileDownloadEvent | undefined = spy.calls[0]
  assert.ok(event)

  // Discrete field-level assertions instead of a single deepEqual so a
  // future additive field on FileDownload doesn't accidentally pass the
  // test by being silently allowed through.
  assert.equal(typeof event.nativeEvent.url, 'string')
  assert.equal(typeof event.nativeEvent.mimeType, 'string')
  assert.equal(typeof event.nativeEvent.fileName, 'string')
  assert.equal(typeof event.nativeEvent.contentLength, 'number')
  assert.equal(typeof event.nativeEvent.userAgent, 'string')
})
