import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BLOB_ENVELOPE_KEY,
  buildBlobReaderScript,
  parseBlobEnvelope,
} from '../bridgeScript.ts'

/**
 * Round-trip contract for the Android blob-download path.
 *
 * `buildBlobReaderScript` produces JS that (in the page) reads a `blob:` URL
 * to a data URL and posts a reserved envelope through
 * `window.ReactNativeWebView.postMessage`. `parseBlobEnvelope` is the demux
 * the native message sink runs to route that envelope to `onFileDownload`
 * instead of `onMessage`.
 *
 * These are pure-TS (run by `node --test --experimental-strip-types`) — the
 * reader script is evaluated in a `new Function(...)` sandbox with mocked
 * `fetch` / `FileReader`, exactly like `evaluateBridgeScript`. The Kotlin
 * ports (`HybridNitroWebView.buildBlobReaderScript` / `parseBlobEnvelope`)
 * mirror this canonical logic and have their own JVM unit tests.
 */

function createSpy() {
  const calls: string[] = []
  const postMessage = (data: string): void => {
    calls.push(data)
  }
  return { postMessage, calls }
}

// Minimal in-page mocks: a Blob, a fetch that resolves it, and a FileReader
// that produces a fixed data URL asynchronously (mirrors the real async
// readAsDataURL settle).
function makeSandbox(
  spy: ReturnType<typeof createSpy>,
  blob: { type: string; size: number },
  dataUrl: string
) {
  const win = {
    ReactNativeWebView: { postMessage: spy.postMessage },
  }
  const fetchMock = (_u: string) =>
    Promise.resolve({ blob: () => Promise.resolve(blob) })
  class FileReaderMock {
    result = ''
    onloadend: (() => void) | null = null
    readAsDataURL(_b: unknown): void {
      this.result = dataUrl
      queueMicrotask(() => this.onloadend?.())
    }
  }
  return { win, fetchMock, FileReaderMock }
}

async function runReader(
  blobUrl: string,
  suggestedName: string,
  blob: { type: string; size: number },
  dataUrl: string
): Promise<string[]> {
  const spy = createSpy()
  const { win, fetchMock, FileReaderMock } = makeSandbox(spy, blob, dataUrl)
  const src = buildBlobReaderScript(blobUrl, suggestedName)
  // eslint-disable-next-line no-new-func
  const evaluate = new Function('window', 'fetch', 'FileReader', src) as (
    window: unknown,
    fetch: unknown,
    FileReader: unknown
  ) => void
  evaluate(win, fetchMock, FileReaderMock)
  // Let the fetch.then + blob.then + readAsDataURL microtasks flush.
  await new Promise((r) => setTimeout(r, 0))
  return spy.calls
}

test('blob reader posts a reserved envelope that parseBlobEnvelope round-trips', async () => {
  const calls = await runReader(
    'blob:https://x/abc',
    'report.pdf',
    { type: 'application/pdf', size: 5 },
    'data:application/pdf;base64,JVBERg=='
  )

  assert.equal(calls.length, 1, 'reader must post exactly one envelope')
  const parsed = parseBlobEnvelope(calls[0])
  assert.ok(parsed, 'the posted envelope must parse as a blob payload')
  assert.equal(parsed!.url, 'blob:https://x/abc')
  assert.equal(parsed!.dataUrl, 'data:application/pdf;base64,JVBERg==')
  assert.equal(parsed!.mimeType, 'application/pdf')
  assert.equal(parsed!.fileName, 'report.pdf')
  assert.equal(parsed!.size, 5)
})

test('envelope literally begins with the reserved key prefix', async () => {
  const calls = await runReader(
    'blob:https://x/abc',
    'f.bin',
    { type: '', size: 0 },
    'data:application/octet-stream;base64,AA=='
  )
  assert.equal(calls.length, 1)
  assert.ok(
    calls[0].startsWith(`{"${BLOB_ENVELOPE_KEY}"`),
    'the envelope must start with the reserved prefix so the native peek matches'
  )
})

test('reader tolerates an empty suggested name and a typeless/zero-size blob', async () => {
  const calls = await runReader(
    'blob:https://x/empty',
    '',
    { type: '', size: 0 },
    'data:;base64,'
  )
  assert.equal(calls.length, 1)
  const parsed = parseBlobEnvelope(calls[0])
  assert.ok(parsed)
  assert.equal(parsed!.mimeType, '')
  assert.equal(parsed!.fileName, '')
  assert.equal(parsed!.size, 0)
})

test('a URL with quotes/backslashes cannot break out of the source literal', async () => {
  // If the blob URL were not JSON-encoded, these characters would terminate
  // the string literal and corrupt the injected script.
  const nasty = 'blob:https://x/a"b\\c'
  const calls = await runReader(
    nasty,
    'n"a\\me.bin',
    { type: 'text/plain', size: 3 },
    'data:text/plain;base64,YWJj'
  )
  assert.equal(calls.length, 1)
  const parsed = parseBlobEnvelope(calls[0])
  assert.ok(parsed)
  assert.equal(parsed!.url, nasty, 'the exact URL must survive the round-trip')
  assert.equal(parsed!.fileName, 'n"a\\me.bin')
})

test('parseBlobEnvelope returns null for normal onMessage payloads (channel isolation)', () => {
  // Anything that is NOT our reserved envelope must fall through to onMessage.
  assert.equal(parseBlobEnvelope('hello'), null)
  assert.equal(parseBlobEnvelope(''), null)
  assert.equal(parseBlobEnvelope('{"k":"v"}'), null, 'not our key → null')
  assert.equal(
    parseBlobEnvelope('{"user":"__nitro_blob__"}'),
    null,
    'the key appearing as a VALUE elsewhere must not be treated as an envelope'
  )
  assert.equal(
    parseBlobEnvelope(`{"${BLOB_ENVELOPE_KEY}":{}}`),
    null,
    'missing url/dataUrl → null (malformed envelope is not a download)'
  )
  assert.equal(
    parseBlobEnvelope(`{"${BLOB_ENVELOPE_KEY}"broken`),
    null,
    'a matching prefix but invalid JSON → null (never throws)'
  )
})

test('parseBlobEnvelope defaults optional fields when absent', () => {
  const raw = JSON.stringify({
    [BLOB_ENVELOPE_KEY]: {
      url: 'blob:https://x/1',
      dataUrl: 'data:;base64,',
    },
  })
  const parsed = parseBlobEnvelope(raw)
  assert.ok(parsed)
  assert.equal(parsed!.mimeType, '')
  assert.equal(parsed!.fileName, '')
  assert.equal(parsed!.size, 0)
})
