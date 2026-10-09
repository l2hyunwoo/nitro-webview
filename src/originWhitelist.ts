import type { ShouldStartLoadRequest } from './specs/NitroWebView.nitro'

/**
 * Public signature of the
 * {@linkcode NitroWebViewProps.onShouldStartLoadWithRequest} prop. Kept
 * as a named type alias so consumers wrapping the hook can spell the
 * function signature without importing the deep spec module.
 */
export type OnShouldStartLoadWithRequest = (
  event: ShouldStartLoadRequest
) => boolean | Promise<boolean>

/**
 * Function returned by {@linkcode createOriginWhitelistGuard}. Behaves
 * like an
 * {@linkcode NitroWebViewProps.onShouldStartLoadWithRequest} prop:
 * resolves `true` to allow the navigation, `false` to silently cancel.
 */
export type OriginWhitelistGuard = (
  event: ShouldStartLoadRequest
) => Promise<boolean>

/**
 * Default origin allowlist used when an integrator wants the
 * react-native-webview-style "allow http(s), block everything else"
 * baseline behaviour. Mirrors RNW's documented default for the
 * `originWhitelist` prop.
 *
 * Exported as a frozen tuple of two glob patterns:
 *
 *   - `'http://*'`  — match any http origin
 *   - `'https://*'` — match any https origin
 *
 * Consumers should treat the array as read-only; the runtime value is
 * frozen so accidental mutation throws in strict mode rather than
 * silently corrupting the shared default.
 */
export const DEFAULT_ORIGIN_WHITELIST: readonly string[] = Object.freeze([
  'http://*',
  'https://*',
])

/**
 * Origin whitelist matcher for the `onShouldStartLoadWithRequest`
 * navigation-interception hook.
 *
 * This module is a pure-TS helper: it does **not** depend on React Native,
 * Nitro, or any platform module. It exists so JS-land consumers can build
 * an allowlist-style policy on top of the Promise<boolean> navigation
 * hook, mirroring react-native-webview's `originWhitelist` prop semantics
 * while staying decoupled from the native bridge.
 *
 * ## `originMatches(url, patterns)`
 *
 * Returns `true` iff the **origin** of `url` — i.e. `scheme://host[:port]` —
 * matches at least one of the glob `patterns`.
 *
 * Matching contract:
 *
 *   1. The URL is normalised to its origin BEFORE matching. The path,
 *      query string, fragment, and userinfo are stripped. The default
 *      port is removed by the URL parser (HTTP 80, HTTPS 443). Non-default
 *      ports remain. Patterns are compared as written, apart from case.
 *   2. Each pattern is a glob where `*` matches any run of characters
 *      (including the empty string) but NEVER spans across what a real
 *      URL parser would consider an origin boundary — i.e. `*` is
 *      treated as a free wildcard against the origin string only,
 *      mirroring RNW's `originWhitelist` behaviour. No `?`, no `**`,
 *      no character classes — keep the surface minimal.
 *   3. Matching is case-INSENSITIVE for both the scheme and the host
 *      (RFC 3986: scheme + host are case-insensitive). The pattern is
 *      lower-cased before comparison.
 *   4. An empty `patterns` array means "match nothing" → returns `false`.
 *   5. If `url` is not a parseable absolute URL the function returns
 *      `false` (defensive — a bad URL cannot satisfy any allowlist).
 *
 * The intent is that an integrator can wrap a user-supplied
 * `onShouldStartLoadWithRequest` so requests whose origin is not in the
 * whitelist are rejected before the user callback ever runs.
 */
export function originMatches(
  url: string,
  patterns: readonly string[]
): boolean {
  if (patterns.length === 0) return false
  const origin = extractOrigin(url)
  if (origin === null) return false
  const lowerOrigin = origin.toLowerCase()
  for (const pattern of patterns) {
    if (globMatch(lowerOrigin, pattern.toLowerCase())) return true
  }
  return false
}

/**
 * Extracts the `scheme://host[:port]` prefix of an absolute URL.
 *
 * Returns `null` for inputs that cannot be parsed as an absolute URL
 * with a scheme (e.g. `''`, `'/relative'`, `'not a url'`). We use the
 * platform `URL` constructor — available in every modern JS engine
 * React Native targets — to avoid hand-rolling RFC 3986.
 */
function extractOrigin(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  // `URL.protocol` includes the trailing colon (`'https:'`); `URL.host`
  // already contains `host[:port]` when a non-default port is present.
  // Keep scheme-only matching for URLs whose `URL.origin` is opaque.
  return `${parsed.protocol}//${parsed.host}`
}

/**
 * Glob matcher that supports `*` as the only wildcard.
 *
 * Implementation uses a regex built from the pattern: every literal
 * character is RegExp-escaped, and `*` becomes `.*`. The match is
 * anchored at both ends so the pattern must consume the entire input.
 */
function globMatch(input: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  const re = new RegExp(`^${escaped}$`)
  return re.test(input)
}

/**
 * Build an
 * {@linkcode NitroWebViewProps.onShouldStartLoadWithRequest}-compatible
 * guard that wraps a user-supplied [inner] callback with an allowlist
 * filter.
 *
 * Semantics:
 *   1. If `event.url`'s origin does NOT match any entry in [patterns],
 *      resolve `false` immediately — the user callback is never invoked.
 *   2. If the URL matches the allowlist AND [inner] is supplied, the
 *      sync or async result of `inner(event)` decides the final verdict.
 *      Throws and rejected Promises propagate as guard rejections.
 *   3. If the URL matches the allowlist AND [inner] is absent, resolve
 *      `true` (the default RNW behavior: any whitelisted origin is
 *      allowed).
 *
 * The resulting guard is a drop-in for the
 * `onShouldStartLoadWithRequest` prop:
 *
 * ```tsx
 * <NitroWebView
 *   onShouldStartLoadWithRequest={createOriginWhitelistGuard([
 *     'https://*.example.com',
 *   ])}
 * />
 * ```
 *
 * The default `patterns` argument is
 * {@linkcode DEFAULT_ORIGIN_WHITELIST} (every http/https origin is
 * allowed — RNW parity).
 *
 * Only `event.url` is checked. This does not validate initial `source`,
 * Android POST requests, subresources, or message origins. Native callback
 * coverage and fallback rules still apply. This is not a network ACL.
 */
export function createOriginWhitelistGuard(
  patterns: readonly string[] = DEFAULT_ORIGIN_WHITELIST,
  inner?: OnShouldStartLoadWithRequest
): OriginWhitelistGuard {
  return async (event) => {
    if (!originMatches(event.url, patterns)) {
      return false
    }
    if (inner === undefined) return true
    return inner(event)
  }
}

/**
 * Apply the same origin policy as {@linkcode createOriginWhitelistGuard},
 * preserving the existing handler-first argument order.
 *
 * Non-matching URLs resolve `false` without invoking `handler`. Matching
 * URLs receive the handler's sync or async decision. Throws and rejected
 * Promises propagate as guard rejections. The guard checks only events
 * delivered by the native navigation callback.
 */
export function wrapWithOriginWhitelist(
  handler: OnShouldStartLoadWithRequest,
  patterns: readonly string[] = DEFAULT_ORIGIN_WHITELIST
): OriginWhitelistGuard {
  return createOriginWhitelistGuard(patterns, handler)
}
