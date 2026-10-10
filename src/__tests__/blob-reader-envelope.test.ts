import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BLOB_ENVELOPE_KEY,
  BLOB_DOWNLOAD_TIMEOUT_MS,
  MAX_BLOB_DOWNLOAD_BYTES,
  MAX_BLOB_ENVELOPE_CHARS,
  buildBlobReaderScript,
  encodeJsStringLiteral,
  parseBlobEnvelope,
  type BlobDownloadRequest,
} from '../bridgeScript.ts'

const pending: BlobDownloadRequest = {
  requestId: 'c91c19ee-09b0-4bfd-b711-f9cf8d9cb283',
  url: 'blob:https://x/abc',
  fileName: 'report.pdf',
}
const envelope = (fields: Record<string, unknown> = {}): string =>
  JSON.stringify({
    [BLOB_ENVELOPE_KEY]: {
      requestId: pending.requestId,
      url: pending.url,
      dataUrl: 'data:application/pdf;base64,JVBERg==',
      mimeType: 'application/pdf',
      size: 4,
      ...fields,
    },
  })

test('only a matching pending native ID can claim a blob envelope', () => {
  for (const raw of [
    'hello',
    '',
    '{"k":"v"}',
    '{"__nitro_blob__":{}}',
    envelope(),
  ]) {
    assert.equal(parseBlobEnvelope(raw, undefined), null)
  }
  assert.equal(
    parseBlobEnvelope(envelope({ requestId: 'forged' }), pending),
    null
  )
  assert.equal(parseBlobEnvelope('hello', pending), null)
  assert.deepEqual(parseBlobEnvelope(envelope(), pending), {
    ...pending,
    dataUrl: 'data:application/pdf;base64,JVBERg==',
    mimeType: 'application/pdf',
    size: 4,
  })
  // Clearing native pending state makes replay an ordinary user message.
  assert.equal(parseBlobEnvelope(envelope(), undefined), null)
})

test('matching malformed replies fail explicitly without trusting page metadata', () => {
  for (const fields of [
    { url: 'blob:https://different/x' },
    { size: -1 },
    { size: 1.5 },
    { size: '4' },
    { size: null },
    { size: MAX_BLOB_DOWNLOAD_BYTES + 1 },
    { size: 5 },
    { size: 0 },
    { dataUrl: 'https://example.test/file' },
    { dataUrl: 'data:application/pdf;base64,%%%=' },
    { dataUrl: 'data:application/pdf;base64,AAA\n', size: 3 },
    { dataUrl: 'data:application/pdf;base64,A===' },
    { mimeType: 'x'.repeat(257) },
    { extra: { nested: true } },
    { error: null },
    { error: 'arbitrary page text' },
  ]) {
    assert.deepEqual(parseBlobEnvelope(envelope(fields), pending), {
      ...pending,
      error: 'invalid',
    })
  }
  const malformed = `{"${BLOB_ENVELOPE_KEY}":{"requestId":"${pending.requestId}",broken`
  assert.deepEqual(parseBlobEnvelope(malformed, pending), {
    ...pending,
    error: 'invalid',
  })
  assert.deepEqual(
    parseBlobEnvelope(malformed + ' '.repeat(MAX_BLOB_ENVELOPE_CHARS), pending),
    {
      ...pending,
      error: 'invalid',
    }
  )
  assert.equal(
    (
      parseBlobEnvelope(
        envelope({ fileName: '../../forged' }),
        pending
      ) as BlobDownloadRequest
    ).fileName,
    'report.pdf'
  )
})

test('zero-byte and exactly 8 MiB replies pass byte-length validation', () => {
  assert.deepEqual(
    parseBlobEnvelope(
      envelope({ dataUrl: 'data:;base64,', mimeType: '', size: 0 }),
      pending
    ),
    {
      ...pending,
      dataUrl: 'data:;base64,',
      mimeType: '',
      size: 0,
    }
  )
  const bytes = Buffer.alloc(MAX_BLOB_DOWNLOAD_BYTES)
  const result = parseBlobEnvelope(
    envelope({
      dataUrl: `data:application/octet-stream;base64,${bytes.toString('base64')}`,
      mimeType: 'application/octet-stream',
      size: bytes.length,
    }),
    pending
  )
  assert.ok(result && !('error' in result))
  assert.equal(result.size, MAX_BLOB_DOWNLOAD_BYTES)
})

// Execute the deployed Kotlin script body too, so both platform copies share the same behavioral checks.
const kotlin = readFileSync(
  new URL(
    '../../android/src/main/java/io/github/l2hyunwoo/nitro/webview/NitroWebViewBlobDownloads.kt',
    import.meta.url
  ),
  'utf8'
)
const kotlinBody = kotlin.match(/return """([\s\S]*?)"""/)?.[1]
assert.ok(kotlinBody, 'Android reader must remain executable by these tests')
const builders = {
  typescript: buildBlobReaderScript,
  android: (request: BlobDownloadRequest): string =>
    kotlinBody
      .replaceAll('$idLiteral', encodeJsStringLiteral(request.requestId))
      .replaceAll('$urlLiteral', encodeJsStringLiteral(request.url))
      .replaceAll('$TIMEOUT_MS', String(BLOB_DOWNLOAD_TIMEOUT_MS))
      .replaceAll('$MAX_BYTES', String(MAX_BLOB_DOWNLOAD_BYTES))
      .replaceAll(
        '$MAX_DATA_URL_CHARS',
        String(4 * Math.ceil(MAX_BLOB_DOWNLOAD_BYTES / 3) + 512)
      ),
}

interface Reader {
  result: unknown
  readyState: number
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  abort(): void
}

function sandbox(
  script: string,
  options: {
    size?: number
    failure?: 'fetch' | 'blob' | 'read' | 'abort'
    wait?: boolean
  } = {}
) {
  const messages: string[] = []
  const readers: Reader[] = []
  const timers = new Map<number, () => void>()
  let reads = 0
  let aborted = false
  const window: {
    ReactNativeWebView: { postMessage(data: string): void }
    setTimeout(callback: () => void, ms: number): number
    clearTimeout(id: number): void
    __nitroBlobReader?: { requestId: string; cancel(): void }
  } = {
    ReactNativeWebView: { postMessage: (data) => messages.push(data) },
    setTimeout(callback, ms) {
      assert.equal(ms, BLOB_DOWNLOAD_TIMEOUT_MS)
      timers.set(1, callback)
      return 1
    },
    clearTimeout(id) {
      timers.delete(id)
    },
  }
  class FileReader implements Reader {
    result: unknown = null
    readyState = 0
    onload?: () => void
    onerror?: () => void
    onabort?: () => void
    constructor() {
      readers.push(this)
    }
    readAsDataURL() {
      reads++
      this.readyState = 1
      if (options.failure === 'read') {
        this.onerror?.()
        return
      }
      if (options.failure === 'abort') {
        this.abort()
        return
      }
      if (options.wait) return
      this.result = 'data:application/pdf;base64,JVBERg=='
      this.readyState = 2
      this.onload?.()
    }
    abort() {
      this.readyState = 2
      this.onabort?.()
    }
  }
  const fetch = async () => {
    if (options.failure === 'fetch') throw new Error('fetch failed')
    return {
      ok: true,
      blob: async () => {
        if (options.failure === 'blob') throw new Error('blob failed')
        return { size: options.size ?? 4, type: 'application/pdf' }
      },
    }
  }
  class AbortController {
    signal = {}
    abort() {
      aborted = true
    }
  }
  const run = (source: string) =>
    // eslint-disable-next-line no-new-func
    new Function('window', 'fetch', 'FileReader', 'AbortController', source)(
      window,
      fetch,
      FileReader,
      AbortController
    )
  run(script)
  return {
    window,
    messages,
    readers,
    timers,
    run,
    reads: () => reads,
    aborted: () => aborted,
  }
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

for (const [platform, build] of Object.entries(builders)) {
  test(`${platform}: successful reader posts one correlated response and releases state`, async () => {
    const s = sandbox(build(pending))
    await settle()
    assert.equal(s.reads(), 1)
    assert.equal(s.messages.length, 1)
    assert.deepEqual(
      parseBlobEnvelope(s.messages[0]!, pending),
      parseBlobEnvelope(envelope(), pending)
    )
    s.readers[0]!.onerror?.()
    assert.equal(s.messages.length, 1)
    assert.equal(s.window.__nitroBlobReader, undefined)
    assert.equal(s.timers.size, 0)
  })

  test(`${platform}: oversize Blob fails before FileReader allocation`, async () => {
    const s = sandbox(build(pending), { size: MAX_BLOB_DOWNLOAD_BYTES + 1 })
    await settle()
    assert.equal(s.readers.length, 0)
    assert.deepEqual(parseBlobEnvelope(s.messages[0]!, pending), {
      ...pending,
      error: 'too-large',
    })
    assert.equal(s.window.__nitroBlobReader, undefined)
  })

  test(`${platform}: fetch, Blob read, FileReader read and abort failures are explicit`, async () => {
    for (const failure of ['fetch', 'blob', 'read', 'abort'] as const) {
      const s = sandbox(build(pending), { failure })
      await settle()
      assert.equal(s.messages.length, 1)
      assert.deepEqual(parseBlobEnvelope(s.messages[0]!, pending), {
        ...pending,
        error: failure === 'blob' ? 'fetch' : failure,
      })
      assert.equal(s.window.__nitroBlobReader, undefined)
    }
  })

  test(`${platform}: timeout and native cancellation abort active readers`, async () => {
    const s = sandbox(build(pending), { wait: true })
    await settle()
    s.timers.get(1)!()
    assert.equal(s.readers[0]!.readyState, 2)
    assert.ok(s.aborted())
    assert.deepEqual(parseBlobEnvelope(s.messages[0]!, pending), {
      ...pending,
      error: 'timeout',
    })
    const cancelled = sandbox(build(pending), { wait: true })
    await settle()
    cancelled.window.__nitroBlobReader!.cancel()
    assert.equal(cancelled.readers[0]!.readyState, 2)
    assert.equal(
      cancelled.messages.length,
      0,
      'native cancellation already reports the error'
    )
    assert.equal(cancelled.window.__nitroBlobReader, undefined)
  })

  test(`${platform}: a second injection cannot create a second active reader`, async () => {
    const s = sandbox(build(pending), { wait: true })
    await settle()
    const next = { ...pending, requestId: 'another-native-request' }
    s.run(build(next))
    await settle()
    assert.equal(s.readers.length, 1)
    assert.deepEqual(parseBlobEnvelope(s.messages[0]!, next), {
      ...next,
      error: 'busy',
    })
    assert.equal(s.window.__nitroBlobReader?.requestId, pending.requestId)
    s.window.__nitroBlobReader!.cancel()
  })
}
