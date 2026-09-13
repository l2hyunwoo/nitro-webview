import type { HtmlSource } from '../WebViewSource'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]

type OptionalKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never
}[keyof T]

type _Html_IsString = Assert<Equals<HtmlSource['html'], string>>
type _Html_IsRequired = Assert<Equals<RequiredKeys<HtmlSource>, 'html'>>

type _BaseUrl_IsOptionalString = Assert<
  Equals<HtmlSource['baseUrl'], string | undefined>
>
type _BaseUrl_IsOptional = Assert<Equals<OptionalKeys<HtmlSource>, 'baseUrl'>>

const _full: HtmlSource = {
  html: '<h1>Hello</h1>',
  baseUrl: 'https://example.com',
}

const _minimal: HtmlSource = {
  html: '<p>Minimal</p>',
}

// @ts-expect-error - `html` is required and cannot be omitted.
const _missingHtml: HtmlSource = {
  baseUrl: 'https://example.com',
}

const _wrongHtmlType: HtmlSource = {
  // @ts-expect-error - `html` must be a string, not a number.
  html: 123,
}

const _wrongBaseUrlType: HtmlSource = {
  html: '<h1>Hi</h1>',
  // @ts-expect-error - `baseUrl` must be a string when present.
  baseUrl: 42,
}

type _Shape_HasOnlyExpectedKeys = Assert<
  Equals<keyof HtmlSource, 'html' | 'baseUrl'>
>

void _full
void _minimal
void _missingHtml
void _wrongHtmlType
void _wrongBaseUrlType

export type {
  _Html_IsString,
  _Html_IsRequired,
  _BaseUrl_IsOptionalString,
  _BaseUrl_IsOptional,
  _Shape_HasOnlyExpectedKeys,
}

import type { UriSource } from '../WebViewSource'
const _post: UriSource = {
  uri: 'https://example.com',
  method: 'POST',
  body: 'a=1',
}
const _get: UriSource = { uri: 'https://example.com', method: 'GET' }
// @ts-expect-error Only GET and POST are supported.
const _put: UriSource = { uri: 'https://example.com', method: 'PUT' }
const _binary: UriSource = {
  uri: 'https://example.com',
  method: 'POST',
  // @ts-expect-error Body is a UTF-8 string.
  body: new Uint8Array(),
}
void _post
void _get
void _put
void _binary
