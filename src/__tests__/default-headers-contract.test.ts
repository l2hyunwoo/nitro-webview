import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type {
  Cookie,
  FileDownload,
  FileDownloadEvent,
  NitroWebViewMethods,
  NitroWebViewProps,
} from '../specs/NitroWebView.nitro'
import type { UriSource } from '../specs/WebViewSource'

/**
 * Spec-level contract tests for the headers, cookies, and file-download
 * MVP features.
 *
 * These tests do NOT run any native code. They verify the **public TS
 * API surface**:
 *
 *   - `UriSource.headers` is an optional Record<string, string>
 *   - `NitroWebViewProps.defaultHeaders` is an optional Record<string, string>
 *   - `Cookie` carries the seven documented fields with required name/value
 *     and optional domain/path/expires/secure/httpOnly
 *   - `FileDownload` / `FileDownloadEvent` shape — `nativeEvent.url` required
 *   - `onFileDownload` prop and `getCookies` / `setCookie` / `clearCookies`
 *     method signatures
 *
 * The runtime checks below use `satisfies` / structural assignment to
 * exercise the same contracts at JS test runtime.
 */

describe('defaultHeaders + UriSource.headers contract', () => {
  it('UriSource accepts optional headers as Record<string,string>', () => {
    const minimal: UriSource = { uri: 'https://example.com' }
    const withHeaders: UriSource = {
      uri: 'https://example.com',
      headers: { 'Authorization': 'Bearer t', 'X-App': 'nitro' },
    }
    assert.equal(minimal.uri, 'https://example.com')
    assert.deepEqual(withHeaders.headers, {
      'Authorization': 'Bearer t',
      'X-App': 'nitro',
    })
  })

  it('NitroWebViewProps.defaultHeaders is optional and Record-shaped', () => {
    const without: Pick<NitroWebViewProps, 'source'> = {
      source: { uri: 'https://example.com' },
    }
    const withDefault: Pick<NitroWebViewProps, 'source' | 'defaultHeaders'> = {
      source: { uri: 'https://example.com' },
      defaultHeaders: { 'User-Agent': 'nitro/test' },
    }
    assert.equal(without.source.uri, 'https://example.com')
    assert.equal(withDefault.defaultHeaders?.['User-Agent'], 'nitro/test')
  })

  it('per-request headers conceptually override defaults on key conflict', () => {
    // Conceptual reference implementation, mirrored by the native code.
    // Per-request headers WIN on case-insensitive key conflict.
    function mergeHeaders(
      defaults: Record<string, string> | undefined,
      perRequest: Record<string, string> | undefined
    ): Record<string, string> {
      const d = defaults ?? {}
      const r = perRequest ?? {}
      const conflictingLower = new Set(
        Object.keys(r).map((k) => k.toLowerCase())
      )
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(d)) {
        if (!conflictingLower.has(k.toLowerCase())) out[k] = v
      }
      for (const [k, v] of Object.entries(r)) {
        out[k] = v
      }
      return out
    }

    assert.deepEqual(mergeHeaders(undefined, undefined), {})
    assert.deepEqual(mergeHeaders({ A: '1' }, undefined), { A: '1' })
    assert.deepEqual(mergeHeaders(undefined, { B: '2' }), { B: '2' })

    assert.deepEqual(
      mergeHeaders({ Authorization: 'def' }, { Authorization: 'override' }),
      { Authorization: 'override' }
    )
    assert.deepEqual(
      mergeHeaders({ Authorization: 'def' }, { authorization: 'override' }),
      { authorization: 'override' },
      'case-insensitive key conflict: per-request casing wins on iOS contract'
    )
    assert.deepEqual(mergeHeaders({ 'X-A': '1', 'X-B': '2' }, { 'X-C': '3' }), {
      'X-A': '1',
      'X-B': '2',
      'X-C': '3',
    })
  })
})

describe('Cookie shape', () => {
  it('requires name and value, allows all other fields to be omitted', () => {
    const minimal: Cookie = { name: 'k', value: 'v' }
    assert.equal(minimal.name, 'k')
    assert.equal(minimal.value, 'v')
    assert.equal(minimal.domain, undefined)
    assert.equal(minimal.expires, undefined)
  })

  it('expires is a number (milliseconds-since-epoch)', () => {
    const now = Date.now()
    const c: Cookie = { name: 'k', value: 'v', expires: now + 60_000 }
    assert.equal(typeof c.expires, 'number')
    assert.ok((c.expires ?? 0) > now)
  })

  it('secure and httpOnly default to absent (treated as false by native)', () => {
    const c: Cookie = { name: 'k', value: 'v' }
    assert.equal(c.secure, undefined)
    assert.equal(c.httpOnly, undefined)
  })
})

describe('FileDownload + FileDownloadEvent shape', () => {
  it('FileDownload requires only url; all other fields are optional', () => {
    const fd: FileDownload = { url: 'https://example.com/file.pdf' }
    assert.equal(fd.url, 'https://example.com/file.pdf')
    assert.equal(fd.mimeType, undefined)
    assert.equal(fd.fileName, undefined)
    assert.equal(fd.contentLength, undefined)
    assert.equal(fd.userAgent, undefined)
  })

  it('FileDownloadEvent wraps a FileDownload under nativeEvent', () => {
    const event: FileDownloadEvent = {
      nativeEvent: {
        url: 'https://example.com/file.pdf',
        mimeType: 'application/pdf',
        fileName: 'file.pdf',
        contentLength: 12345,
      },
    }
    assert.equal(event.nativeEvent.url, 'https://example.com/file.pdf')
    assert.equal(event.nativeEvent.mimeType, 'application/pdf')
    assert.equal(event.nativeEvent.contentLength, 12345)
  })
})

describe('props and methods surface', () => {
  it('NitroWebViewProps.onFileDownload is an optional callback', () => {
    const calls: FileDownloadEvent[] = []
    const props: Pick<NitroWebViewProps, 'source' | 'onFileDownload'> = {
      source: { uri: 'https://example.com' },
      onFileDownload: (event) => {
        calls.push(event)
      },
    }
    // Simulate one synthetic emission to prove the signature is usable.
    props.onFileDownload?.({
      nativeEvent: {
        url: 'https://example.com/a.pdf',
        mimeType: 'application/pdf',
      },
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].nativeEvent.url, 'https://example.com/a.pdf')
  })

  it('NitroWebViewMethods exposes Promise-returning cookie methods', () => {
    // Type-only assertion that the methods exist with the right shape;
    // when this file compiles, the contract is upheld.
    type _GetCookies = NitroWebViewMethods['getCookies']
    type _SetCookie = NitroWebViewMethods['setCookie']
    type _ClearCookies = NitroWebViewMethods['clearCookies']

    const _get: _GetCookies = (_url) => Promise.resolve<Cookie[]>([])
    const _set: _SetCookie = (_url, _cookie) => Promise.resolve()
    const _clear: _ClearCookies = () => Promise.resolve()

    assert.equal(typeof _get, 'function')
    assert.equal(typeof _set, 'function')
    assert.equal(typeof _clear, 'function')
  })
})

describe('out of scope guards', () => {
  it('file upload does NOT add any new top-level TS prop, method, or callback', () => {
    // Sentinels that would indicate the feature accidentally grew a JS API.
    type ForbiddenProps =
      | 'onShowFileChooser'
      | 'onFileUpload'
      | 'allowFileUpload'
      | 'fileUploadEnabled'

    type ForbiddenMethods = 'showFileChooser' | 'uploadFile' | 'pickFile'

    type IsAbsentProp = ForbiddenProps extends keyof NitroWebViewProps
      ? false
      : true
    type IsAbsentMethod = ForbiddenMethods extends keyof NitroWebViewMethods
      ? false
      : true

    const _propsClean: IsAbsentProp = true
    const _methodsClean: IsAbsentMethod = true
    assert.equal(_propsClean, true)
    assert.equal(_methodsClean, true)
  })

  it('no imperative setGlobalHeaders() method exists', () => {
    type HasMethod = 'setGlobalHeaders' extends keyof NitroWebViewMethods
      ? true
      : false
    const _absent: HasMethod = false
    assert.equal(_absent, false)
  })
})
