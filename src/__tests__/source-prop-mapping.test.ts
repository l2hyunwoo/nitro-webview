import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isHtmlSource,
  isUriSource,
  sourceToCommand,
} from '../sourceToCommand.ts'
import type {
  HtmlSource,
  UriSource,
  WebViewSource,
} from '../specs/WebViewSource.ts'
import type { NativeViewCommand } from '../nativeCommands.ts'

test('source={uri:"https://example.com"} maps to loadUrl with the same URL', () => {
  const source: UriSource = { uri: 'https://example.com' }

  const command = sourceToCommand(source)

  assert.equal(
    command.type,
    'loadUrl',
    'a UriSource must trigger the loadUrl native command'
  )
  assert.equal(
    (command as { type: 'loadUrl'; url: string }).url,
    'https://example.com',
    'the loadUrl command must carry the exact URI value through to native'
  )
})

test('URL is forwarded verbatim including path, query, and fragment', () => {
  const source: UriSource = {
    uri: 'https://example.com/path/page?x=1&y=2#section',
  }

  const command = sourceToCommand(source) as NativeViewCommand & {
    type: 'loadUrl'
  }

  assert.equal(command.type, 'loadUrl')
  assert.equal(
    command.url,
    'https://example.com/path/page?x=1&y=2#section',
    'the URL must not be re-encoded, truncated, or normalized'
  )
})

test('works for http, https, file, and about: schemes', () => {
  const cases: Array<{ uri: string }> = [
    { uri: 'http://example.com' },
    { uri: 'https://example.com' },
    { uri: 'file:///var/mobile/app/index.html' },
    { uri: 'about:blank' },
  ]

  for (const source of cases) {
    const command = sourceToCommand(source) as NativeViewCommand & {
      type: 'loadUrl'
    }
    assert.equal(command.type, 'loadUrl', `failed for ${source.uri}`)
    assert.equal(command.url, source.uri, `URL mismatch for ${source.uri}`)
  }
})

test('isUriSource correctly identifies a {uri} source', () => {
  assert.equal(isUriSource({ uri: 'https://example.com' }), true)
  assert.equal(
    isUriSource({ html: '<p>hi</p>' } as unknown as WebViewSource),
    false
  )
})

test('isHtmlSource correctly identifies an {html} source', () => {
  assert.equal(isHtmlSource({ html: '<p>hi</p>' }), true)
  assert.equal(
    isHtmlSource({ uri: 'https://example.com' } as unknown as WebViewSource),
    false
  )
})

test('source={html} maps to loadHtml with the same HTML body', () => {
  const source: HtmlSource = { html: '<h1>Hello</h1>' }

  const command = sourceToCommand(source) as NativeViewCommand & {
    type: 'loadHtml'
  }

  assert.equal(command.type, 'loadHtml')
  assert.equal(command.html, '<h1>Hello</h1>')
  assert.equal(command.baseUrl, undefined)
})

test('source={html, baseUrl} forwards baseUrl to the native command', () => {
  const source: HtmlSource = {
    html: '<a href="/about">About</a>',
    baseUrl: 'https://example.com',
  }

  const command = sourceToCommand(source) as NativeViewCommand & {
    type: 'loadHtml'
  }

  assert.equal(command.type, 'loadHtml')
  assert.equal(command.html, '<a href="/about">About</a>')
  assert.equal(command.baseUrl, 'https://example.com')
})

test('null/undefined source throws TypeError', () => {
  assert.throws(
    () => sourceToCommand(null as unknown as WebViewSource),
    TypeError
  )
  assert.throws(
    () => sourceToCommand(undefined as unknown as WebViewSource),
    TypeError
  )
})

test('source matching neither UriSource nor HtmlSource throws TypeError', () => {
  assert.throws(
    () => sourceToCommand({} as unknown as WebViewSource),
    TypeError
  )
  assert.throws(
    () =>
      sourceToCommand({ random: 'value' } as unknown as WebViewSource),
    TypeError
  )
})

test('empty uri string is treated as invalid (falls through to type error)', () => {
  // An empty string isn't a meaningful URL to hand to the native loader.
  assert.throws(
    () => sourceToCommand({ uri: '' } as UriSource),
    TypeError
  )
})
