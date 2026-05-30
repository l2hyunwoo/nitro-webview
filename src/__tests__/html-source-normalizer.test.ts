import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isHtmlSource,
  isUriSource,
  normalizeHtmlSource,
} from '../sourceToCommand.ts'
import type {
  HtmlSource,
  UriSource,
  WebViewSource,
} from '../specs/NitroWebView.nitro.ts'
import type { LoadHtmlCommand } from '../nativeCommands.ts'

test('source={html} is detected as HtmlSource and normalized to loadHtml', () => {
  const source: HtmlSource = { html: '<h1>Hello</h1>' }

  const command = normalizeHtmlSource(source)

  assert.notEqual(command, null, 'an HtmlSource must produce a payload')
  assert.equal(
    (command as LoadHtmlCommand).type,
    'loadHtml',
    'discriminator must route HtmlSource to the loadHtml native command'
  )
  assert.equal(
    (command as LoadHtmlCommand).html,
    '<h1>Hello</h1>',
    'html body must be forwarded verbatim to the native prop payload'
  )
})

test('html-only payload OMITS the `baseUrl` key entirely (not undefined)', () => {
  // Setting `baseUrl: undefined` would surface as a present-but-null key on
  // Android; omitting it cleanly maps to the platform's "no base URL" default.
  const source: HtmlSource = { html: '<p>only html</p>' }

  const command = normalizeHtmlSource(source) as LoadHtmlCommand

  assert.equal('baseUrl' in command, false, '`baseUrl` key must be absent')
  assert.equal(command.baseUrl, undefined)
})

test('html-only preserves the literal HTML body byte-for-byte', () => {
  const body = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"><title>π</title></head>',
    '<body>',
    '  <p>Hello, world! 漢字 🎉</p>',
    '  <script>window.x = 1 < 2 && 3 > 0;</script>',
    '</body></html>',
  ].join('\n')

  const command = normalizeHtmlSource({ html: body }) as LoadHtmlCommand

  assert.equal(command.type, 'loadHtml')
  assert.equal(command.html, body, 'HTML body must not be transformed')
})

test('source={html, baseUrl} forwards BOTH html and baseUrl to the native payload', () => {
  const source: HtmlSource = {
    html: '<a href="/about">About</a>',
    baseUrl: 'https://example.com',
  }

  const command = normalizeHtmlSource(source) as LoadHtmlCommand

  assert.equal(command.type, 'loadHtml')
  assert.equal(
    command.html,
    '<a href="/about">About</a>',
    'html must be forwarded verbatim alongside baseUrl'
  )
  assert.equal(
    command.baseUrl,
    'https://example.com',
    'baseUrl must be forwarded so relative URLs resolve against it'
  )
})

test('baseUrl supports https, http, and file:// schemes', () => {
  const cases: Array<{ baseUrl: string }> = [
    { baseUrl: 'https://example.com' },
    { baseUrl: 'http://example.com' },
    { baseUrl: 'file:///var/mobile/app/' },
  ]

  for (const { baseUrl } of cases) {
    const command = normalizeHtmlSource({
      html: '<p>x</p>',
      baseUrl,
    }) as LoadHtmlCommand

    assert.equal(command.type, 'loadHtml')
    assert.equal(command.baseUrl, baseUrl, `baseUrl mismatch for ${baseUrl}`)
  }
})

test('empty-string baseUrl is preserved (caller decision, not normalizer)', () => {
  const command = normalizeHtmlSource({
    html: '<p>x</p>',
    baseUrl: '',
  }) as LoadHtmlCommand

  assert.equal(command.type, 'loadHtml')
  assert.equal(command.baseUrl, '')
  assert.equal('baseUrl' in command, true)
})

test('discriminator returns null for a UriSource (not an HtmlSource)', () => {
  const uri: UriSource = { uri: 'https://example.com' }

  const command = normalizeHtmlSource(uri as WebViewSource)

  assert.equal(command, null, 'UriSource must NOT be normalized as HTML')
})

test('discriminator returns null for objects with neither html nor uri', () => {
  assert.equal(normalizeHtmlSource({} as unknown as WebViewSource), null)
  assert.equal(
    normalizeHtmlSource({ random: 'value' } as unknown as WebViewSource),
    null
  )
})

test('discriminator returns null for nullish input (does not throw)', () => {
  assert.equal(normalizeHtmlSource(null as unknown as WebViewSource), null)
  assert.equal(
    normalizeHtmlSource(undefined as unknown as WebViewSource),
    null
  )
})

test('discriminator rejects {html} where html is not a string', () => {
  assert.equal(
    normalizeHtmlSource({ html: 42 } as unknown as WebViewSource),
    null
  )
  assert.equal(
    normalizeHtmlSource({ html: null } as unknown as WebViewSource),
    null
  )
})

test('discriminator drops a non-string `baseUrl` rather than forwarding it', () => {
  const command = normalizeHtmlSource({
    html: '<p>x</p>',
    baseUrl: 123,
  } as unknown as WebViewSource) as LoadHtmlCommand

  assert.equal(command.type, 'loadHtml')
  assert.equal(command.html, '<p>x</p>')
  assert.equal('baseUrl' in command, false, 'malformed baseUrl must be dropped')
})

test('isHtmlSource and normalizeHtmlSource are consistent', () => {
  const html: HtmlSource = { html: '<p>x</p>' }
  const uri: UriSource = { uri: 'https://example.com' }

  assert.equal(isHtmlSource(html), true)
  assert.notEqual(normalizeHtmlSource(html), null)

  assert.equal(isHtmlSource(uri as WebViewSource), false)
  assert.equal(normalizeHtmlSource(uri as WebViewSource), null)
})

test('isUriSource is FALSE for an HtmlSource (true variant discrimination)', () => {
  const html: HtmlSource = { html: '<p>x</p>', baseUrl: 'https://x.test' }
  assert.equal(isUriSource(html as WebViewSource), false)
})
