import test from 'node:test'
import assert from 'node:assert/strict'

import { BLOB_ENVELOPE_KEY, parseBlobEnvelope } from '../bridgeScript.ts'

/**
 * `parseBlobEnvelope` is the spec-of-record demux the native message sink runs
 * to route a reserved blob envelope to `onFileDownload` instead of `onMessage`.
 * The Kotlin port (`HybridNitroWebView.parseBlobEnvelope`) mirrors this and has
 * its own JVM unit tests.
 */

test('parseBlobEnvelope demuxes a well-formed envelope', () => {
  const raw = JSON.stringify({
    [BLOB_ENVELOPE_KEY]: {
      url: 'blob:https://x/abc',
      dataUrl: 'data:application/pdf;base64,JVBERg==',
      mimeType: 'application/pdf',
      fileName: 'report.pdf',
      size: 5,
    },
  })
  const parsed = parseBlobEnvelope(raw)
  assert.ok(parsed)
  assert.equal(parsed!.url, 'blob:https://x/abc')
  assert.equal(parsed!.dataUrl, 'data:application/pdf;base64,JVBERg==')
  assert.equal(parsed!.mimeType, 'application/pdf')
  assert.equal(parsed!.fileName, 'report.pdf')
  assert.equal(parsed!.size, 5)
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
