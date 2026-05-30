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
