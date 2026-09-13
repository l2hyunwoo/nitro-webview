import type {
  HtmlSource,
  UriSource,
  WebViewSource,
} from './specs/NitroWebView.nitro'
import type { LoadHtmlCommand, NativeViewCommand } from './nativeCommands'

export function isUriSource(source: WebViewSource): source is UriSource {
  return (
    typeof (source as Partial<UriSource>).uri === 'string' &&
    (source as Partial<UriSource>).uri !== ''
  )
}

export function isHtmlSource(source: WebViewSource): source is HtmlSource {
  return typeof (source as Partial<HtmlSource>).html === 'string'
}

/**
 * Normalize an {@linkcode HtmlSource} into a `loadHtml` native command.
 * Returns `null` when `source` is not an `HtmlSource`, so callers can fall
 * through to the URI branch.
 */
export function normalizeHtmlSource(
  source: WebViewSource
): LoadHtmlCommand | null {
  if (source == null || !isHtmlSource(source)) {
    return null
  }

  const command: LoadHtmlCommand = {
    type: 'loadHtml',
    html: source.html,
  }
  // Only attach `baseUrl` when explicitly a string so the payload that
  // crosses the bridge does not carry a null key for an absent option.
  if (typeof source.baseUrl === 'string') {
    command.baseUrl = source.baseUrl
  }
  return command
}

/**
 * Map a `WebViewSource` prop value to a {@linkcode NativeViewCommand}.
 * Throws on malformed input.
 */
export function sourceToCommand(source: WebViewSource): NativeViewCommand {
  if (source == null) {
    throw new TypeError('NitroWebView: `source` prop is required')
  }

  if (isUriSource(source)) {
    const method = source.method ?? 'GET'
    if (method !== 'GET' && method !== 'POST') {
      throw new TypeError('NitroWebView: source.method must be GET or POST')
    }
    if (source.body !== undefined && typeof source.body !== 'string') {
      throw new TypeError('NitroWebView: source.body must be a string')
    }
    if (method === 'GET' && source.body !== undefined) {
      throw new TypeError('NitroWebView: source.body requires POST')
    }
    if (method === 'POST') {
      if (!/^https?:\/\//i.test(source.uri)) {
        throw new TypeError('NitroWebView: POST requires an HTTP(S) URI')
      }
      return {
        type: 'loadUrl',
        url: source.uri,
        method,
        body: source.body ?? '',
      }
    }
    return { type: 'loadUrl', url: source.uri }
  }

  const htmlCommand = normalizeHtmlSource(source)
  if (htmlCommand !== null) {
    return htmlCommand
  }

  throw new TypeError(
    'NitroWebView: `source` must be a UriSource ({uri}) or HtmlSource ({html})'
  )
}
