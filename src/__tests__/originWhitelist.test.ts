import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ORIGIN_WHITELIST,
  originMatches,
  wrapWithOriginWhitelist,
} from '../originWhitelist.ts'
import type { ShouldStartLoadRequest } from '../specs/NitroWebView.nitro.ts'

/**
 * Unit tests for `originMatches(url, patterns)`.
 *
 * Contract under test (mirrors the doc-comment in `src/originWhitelist.ts`):
 *
 *   1. `originMatches` compares `scheme://host[:port]` against each glob
 *      pattern. Path / query / fragment are ignored.
 *   2. `*` is a free wildcard matching any run of characters.
 *   3. Matching is case-insensitive for scheme and host.
 *   4. An empty pattern list never matches.
 *   5. Non-URL inputs always return `false`.
 *
 * this file covers
 * Seed — exact match, wildcard scheme/host, and non-match cases are
 * each represented below.
 */

describe('originMatches — exact origin matches', () => {
  it('matches when the pattern is the exact origin', () => {
    assert.equal(
      originMatches('https://example.com/path?q=1', ['https://example.com']),
      true
    )
  })

  it('matches when one pattern in the list is the exact origin', () => {
    assert.equal(
      originMatches('https://api.example.com', [
        'https://other.com',
        'https://api.example.com',
        'https://third.com',
      ]),
      true
    )
  })

  it('matches against an exact origin with a non-default port', () => {
    assert.equal(
      originMatches('http://localhost:8080/x', ['http://localhost:8080']),
      true
    )
  })
})

describe('originMatches — wildcard scheme and host', () => {
  it('matches a wildcard scheme', () => {
    assert.equal(
      originMatches('https://example.com', ['*://example.com']),
      true
    )
    assert.equal(originMatches('http://example.com', ['*://example.com']), true)
  })

  it('matches a wildcard subdomain (*.example.com)', () => {
    assert.equal(
      originMatches('https://api.example.com', ['https://*.example.com']),
      true
    )
    assert.equal(
      originMatches('https://www.example.com', ['https://*.example.com']),
      true
    )
  })

  it('matches the universal http/https default allowlist', () => {
    assert.equal(originMatches('https://anywhere.test', ['https://*']), true)
    assert.equal(originMatches('http://anywhere.test', ['http://*']), true)
  })

  it('is case-insensitive in scheme and host', () => {
    assert.equal(
      originMatches('HTTPS://Example.COM/path', ['https://example.com']),
      true
    )
    assert.equal(
      originMatches('https://example.com', ['HTTPS://EXAMPLE.COM']),
      true
    )
  })
})

describe('originMatches — non-match cases', () => {
  it('returns false when no pattern matches the host', () => {
    assert.equal(
      originMatches('https://evil.com', ['https://example.com']),
      false
    )
  })

  it('returns false when only the scheme differs', () => {
    assert.equal(
      originMatches('http://example.com', ['https://example.com']),
      false
    )
  })

  it('returns false when only the port differs', () => {
    assert.equal(
      originMatches('http://localhost:9000', ['http://localhost:8080']),
      false
    )
  })

  it('returns false for an empty pattern list', () => {
    assert.equal(originMatches('https://example.com', []), false)
  })

  it('returns false for a non-parseable URL', () => {
    assert.equal(originMatches('not a url', ['https://*']), false)
    assert.equal(originMatches('', ['https://*']), false)
    assert.equal(originMatches('/relative/path', ['https://*']), false)
  })

  it('does not let a wildcard subdomain match the apex', () => {
    // `https://*.example.com` requires at least one subdomain label —
    // it should NOT match `https://example.com` itself.
    assert.equal(
      originMatches('https://example.com', ['https://*.example.com']),
      false
    )
  })
})

/**
 * the exported `DEFAULT_ORIGIN_WHITELIST` constant must equal
 * exactly `['http://*', 'https://*']` and must let `originMatches` admit
 * representative http and https origins. This mirrors RNW's documented
 * default `originWhitelist` value.
 */
describe('DEFAULT_ORIGIN_WHITELIST — exact value and behaviour', () => {
  it("is exactly ['http://*', 'https://*']", () => {
    assert.deepEqual([...DEFAULT_ORIGIN_WHITELIST], ['http://*', 'https://*'])
  })

  it('admits representative http and https URLs via originMatches', () => {
    assert.equal(
      originMatches('http://example.com/path', DEFAULT_ORIGIN_WHITELIST),
      true
    )
    assert.equal(
      originMatches('https://example.com/path', DEFAULT_ORIGIN_WHITELIST),
      true
    )
    assert.equal(
      originMatches(
        'https://api.example.com:8443/v1',
        DEFAULT_ORIGIN_WHITELIST
      ),
      true
    )
  })

  it('does not admit non-http(s) schemes such as file:// or ftp://', () => {
    assert.equal(
      originMatches('file:///etc/passwd', DEFAULT_ORIGIN_WHITELIST),
      false
    )
    assert.equal(
      originMatches('ftp://example.com/file', DEFAULT_ORIGIN_WHITELIST),
      false
    )
  })
})

/**
 * `wrapWithOriginWhitelist(handler, patterns)` returns a
 * Promise<boolean> guard that:
 *
 *   1. Resolves `true` (allow) WITHOUT invoking `handler` when `patterns`
 *      is the exported `DEFAULT_ORIGIN_WHITELIST` reference.
 *   2. Delegates to `handler(event)` and returns its result verbatim for
 *      any other `patterns` array.
 *
 * Both branches are exercised below with a spy `handler` so we can
 * directly assert call-count and return-value propagation.
 */
describe('wrapWithOriginWhitelist — default allowlist short-circuit', () => {
  it('resolves true without invoking handler when patterns === DEFAULT_ORIGIN_WHITELIST', async () => {
    let invocationCount = 0
    const handler = async (_event: ShouldStartLoadRequest) => {
      invocationCount += 1
      // If the fast-path branch fails to short-circuit, this `false`
      // would propagate to the caller and the assertion below would
      // observe it.
      return false
    }
    const guard = wrapWithOriginWhitelist(handler, DEFAULT_ORIGIN_WHITELIST)
    const event: ShouldStartLoadRequest = {
      url: 'https://example.com/path',
      navigationType: 'click',
    }
    const result = await guard(event)
    assert.equal(result, true)
    assert.equal(invocationCount, 0)
  })

  it('defaults patterns to DEFAULT_ORIGIN_WHITELIST and short-circuits when omitted', async () => {
    let invocationCount = 0
    const handler = async (_event: ShouldStartLoadRequest) => {
      invocationCount += 1
      return false
    }
    const guard = wrapWithOriginWhitelist(handler)
    const result = await guard({
      url: 'https://anywhere.test',
      navigationType: 'other',
    })
    assert.equal(result, true)
    assert.equal(invocationCount, 0)
  })
})

describe('wrapWithOriginWhitelist — non-default patterns delegate to handler', () => {
  it('invokes handler exactly once and returns its boolean verbatim (true branch)', async () => {
    const seenEvents: ShouldStartLoadRequest[] = []
    const handler = async (event: ShouldStartLoadRequest) => {
      seenEvents.push(event)
      return true
    }
    const guard = wrapWithOriginWhitelist(handler, ['https://example.com'])
    const event: ShouldStartLoadRequest = {
      url: 'https://example.com/page',
      navigationType: 'click',
    }
    const result = await guard(event)
    assert.equal(result, true)
    assert.equal(seenEvents.length, 1)
    assert.deepEqual(seenEvents[0], event)
  })

  it('invokes handler and returns its boolean verbatim (false branch)', async () => {
    let invocationCount = 0
    const handler = async (_event: ShouldStartLoadRequest) => {
      invocationCount += 1
      return false
    }
    const guard = wrapWithOriginWhitelist(handler, ['https://only-this.test'])
    const result = await guard({
      url: 'https://evil.test/bad',
      navigationType: 'click',
    })
    assert.equal(result, false)
    assert.equal(invocationCount, 1)
  })

  it('treats a structurally equal but non-identical array as the non-default branch', async () => {
    // The contract is reference equality against the exported constant,
    // not deep equality. An equivalent literal must fall through to the
    // handler.
    let invocationCount = 0
    const handler = async (_event: ShouldStartLoadRequest) => {
      invocationCount += 1
      return false
    }
    const equivalentLiteral: readonly string[] = ['http://*', 'https://*']
    const guard = wrapWithOriginWhitelist(handler, equivalentLiteral)
    const result = await guard({
      url: 'https://example.com',
      navigationType: 'other',
    })
    assert.equal(result, false)
    assert.equal(invocationCount, 1)
  })
})

/**
 * exact
 * host match cases against `DEFAULT_ORIGIN_WHITELIST` and a single-origin
 * allowlist.
 *
 * Two distinct exact-host scenarios are exercised:
 *
 *   A. Against the documented default `['http://*', 'https://*']`: an http
 *      or https URL matches itself, the same host with a path/query/port
 *      still matches, and non-http(s) schemes do not. This validates that
 *      the default acts as the "any http(s) origin" allowlist.
 *   B. Against an explicit single-origin allowlist (e.g. `['https://example.com']`):
 *      the matching host returns true and any mismatched host (even with
 *      the same scheme) returns false. This is the strict exact-host
 *      contract referenced by the .
 */
describe('DEFAULT_ORIGIN_WHITELIST — exact host match cases', () => {
  it("matches 'https://example.com' against the default allowlist", () => {
    assert.equal(
      originMatches('https://example.com', DEFAULT_ORIGIN_WHITELIST),
      true
    )
  })

  it("matches 'http://example.com' against the default allowlist", () => {
    assert.equal(
      originMatches('http://example.com', DEFAULT_ORIGIN_WHITELIST),
      true
    )
  })

  it('matches when only the path/query/fragment differs (origin still equals itself)', () => {
    assert.equal(
      originMatches(
        'https://example.com/some/path?q=1#frag',
        DEFAULT_ORIGIN_WHITELIST
      ),
      true
    )
  })

  it('does not match a non-http(s) scheme against the default allowlist', () => {
    // The default allowlist only covers http(s); other schemes must miss.
    assert.equal(
      originMatches('ws://example.com', DEFAULT_ORIGIN_WHITELIST),
      false
    )
    assert.equal(originMatches('about:blank', DEFAULT_ORIGIN_WHITELIST), false)
  })
})

describe('originMatches — exact host allowlist', () => {
  // A strict single-origin allowlist captures 's "exact host match"
  // semantics: only the exact `scheme://host[:port]` is admitted; any
  // mismatched host returns false even when the scheme is identical.
  const ALLOWLIST: readonly string[] = ['https://example.com']

  it("'https://example.com' matches itself", () => {
    assert.equal(originMatches('https://example.com', ALLOWLIST), true)
  })

  it("'https://example.com/path' matches (path is stripped before compare)", () => {
    assert.equal(originMatches('https://example.com/path', ALLOWLIST), true)
  })

  it("'https://other.com' does NOT match (different host)", () => {
    assert.equal(originMatches('https://other.com', ALLOWLIST), false)
  })

  it("'https://api.example.com' does NOT match (different host, subdomain)", () => {
    // Subdomain is a distinct host — strict exact-host allowlist must
    // reject it.
    assert.equal(originMatches('https://api.example.com', ALLOWLIST), false)
  })

  it("'https://example.com:8443' does NOT match (different port)", () => {
    // Origin equality includes the port; a non-default port is not the
    // same exact origin.
    assert.equal(originMatches('https://example.com:8443', ALLOWLIST), false)
  })

  it("'http://example.com' does NOT match (different scheme)", () => {
    assert.equal(originMatches('http://example.com', ALLOWLIST), false)
  })
})

/**
 * wildcard
 * host match cases.
 *
 * Contract under test for the wildcard subdomain pattern
 * `'https://*.example.com'`:
 *
 *   A. POSITIVE — single-label and multi-label subdomains of `example.com`
 *      are admitted; the wildcard greedily covers any non-empty run of host
 *      characters (including dots).
 *   B. NEGATIVE — the apex host `example.com`, sibling hosts (`example.org`,
 *      `notexample.com`, `evil.com`), suffix-only matches (`xexample.com`,
 *      `evil-example.com`), wrong scheme (`http://api.example.com`), and
 *      ports on the apex are all rejected.
 *   C. CASE-INSENSITIVE — the wildcard host match must respect the RFC
 *      3986 case-insensitive scheme/host rule.
 *   D. PATH/QUERY/FRAGMENT INSENSITIVE — the wildcard match operates on
 *      the origin only; path/query/fragment must be stripped before
 *      comparison.
 *
 * This block is dedicated to wildcard-host semantics — broader exact-host
 * and wildcard-scheme cases are covered elsewhere in this file.
 */
describe('originMatches — wildcard host match cases ()', () => {
  const SUBDOMAIN_WILDCARD: readonly string[] = ['https://*.example.com']

  // A. Positive: subdomains match
  it("matches a single-label subdomain ('api.example.com')", () => {
    assert.equal(
      originMatches('https://api.example.com', SUBDOMAIN_WILDCARD),
      true
    )
  })

  it("matches another single-label subdomain ('www.example.com')", () => {
    assert.equal(
      originMatches('https://www.example.com', SUBDOMAIN_WILDCARD),
      true
    )
  })

  it("matches a multi-label subdomain ('a.b.example.com')", () => {
    // `*` covers any run of characters including dots, so deeper subdomains
    // are admitted.
    assert.equal(
      originMatches('https://a.b.example.com', SUBDOMAIN_WILDCARD),
      true
    )
  })

  it("matches a deeply nested subdomain ('foo.bar.baz.example.com')", () => {
    assert.equal(
      originMatches('https://foo.bar.baz.example.com', SUBDOMAIN_WILDCARD),
      true
    )
  })

  it('matches a subdomain when the URL has a path, query, and fragment', () => {
    // The origin is extracted before matching — trailing URL components
    // must not defeat the wildcard.
    assert.equal(
      originMatches(
        'https://api.example.com/v1/users?id=42#section',
        SUBDOMAIN_WILDCARD
      ),
      true
    )
  })

  // B. Negative: non-matching hosts rejected
  it("rejects the apex host 'example.com' (wildcard requires a subdomain)", () => {
    // `https://*.example.com` requires at least one subdomain label — the
    // bare apex must NOT match.
    assert.equal(
      originMatches('https://example.com', SUBDOMAIN_WILDCARD),
      false
    )
  })

  it("rejects an unrelated host 'evil.com'", () => {
    assert.equal(originMatches('https://evil.com', SUBDOMAIN_WILDCARD), false)
  })

  it("rejects a sibling TLD 'api.example.org'", () => {
    // Same prefix label but a different TLD must miss.
    assert.equal(
      originMatches('https://api.example.org', SUBDOMAIN_WILDCARD),
      false
    )
  })

  it("rejects a host that only shares a suffix ('notexample.com')", () => {
    // `notexample.com` ends with `example.com` but is NOT a subdomain of
    // `example.com`. The leading `.` in the wildcard pattern enforces a
    // label boundary.
    assert.equal(
      originMatches('https://notexample.com', SUBDOMAIN_WILDCARD),
      false
    )
  })

  it("rejects a host with the same suffix label ('xexample.com')", () => {
    // Defensive: confirm the `.` is matched literally (not as a regex
    // metacharacter) so suffix-only collisions cannot sneak through.
    assert.equal(
      originMatches('https://xexample.com', SUBDOMAIN_WILDCARD),
      false
    )
  })

  it("rejects a hyphen-suffixed host ('evil-example.com')", () => {
    assert.equal(
      originMatches('https://evil-example.com', SUBDOMAIN_WILDCARD),
      false
    )
  })

  it('rejects a subdomain on the wrong scheme (http instead of https)', () => {
    assert.equal(
      originMatches('http://api.example.com', SUBDOMAIN_WILDCARD),
      false
    )
  })

  it("rejects the apex with a non-default port ('example.com:8443')", () => {
    // Port is part of the origin — even if a future loosened wildcard
    // admitted the apex, the port mismatch would still fail. Lock the
    // current strict semantics.
    assert.equal(
      originMatches('https://example.com:8443', SUBDOMAIN_WILDCARD),
      false
    )
  })

  // C. Case-insensitivity
  it('matches a subdomain case-insensitively in scheme and host', () => {
    assert.equal(
      originMatches('HTTPS://API.EXAMPLE.COM/path', SUBDOMAIN_WILDCARD),
      true
    )
  })

  it('matches a subdomain when the wildcard pattern itself is upper-case', () => {
    assert.equal(
      originMatches('https://api.example.com', ['HTTPS://*.EXAMPLE.COM']),
      true
    )
  })

  // D. Wildcard host with a port-bearing pattern
  it('admits a subdomain on a wildcard pattern that bounds the port', () => {
    // A wildcard against `scheme://*.host:port` should still match a
    // subdomain that uses exactly that port.
    assert.equal(
      originMatches('https://api.example.com:8443', [
        'https://*.example.com:8443',
      ]),
      true
    )
  })

  it('rejects a subdomain when the wildcard pattern bounds a different port', () => {
    assert.equal(
      originMatches('https://api.example.com:9000', [
        'https://*.example.com:8443',
      ]),
      false
    )
  })

  // E. Wildcard host integrates with a multi-pattern allowlist
  it('matches when the wildcard host is one of many patterns in the list', () => {
    // Confirm the OR-of-patterns semantics: a single matching wildcard
    // entry is enough.
    assert.equal(
      originMatches('https://api.example.com', [
        'https://other.test',
        'https://*.example.com',
        'https://third.test',
      ]),
      true
    )
  })

  it('rejects when no entry — wildcard or exact — matches the host', () => {
    assert.equal(
      originMatches('https://api.evil.com', [
        'https://other.test',
        'https://*.example.com',
        'https://third.test',
      ]),
      false
    )
  })
})

/**
 * scheme-only
 * match cases, including the `'file*'` pattern, and `data:` URL short-circuit
 * behavior.
 *
 * Background:
 *   - `originMatches` reduces every URL to `scheme://host[:port]` before
 *     comparison. The platform `URL` parser collapses both `file:///path`
 *     and `data:text/html,...` to `host === ''`, so the origin string passed
 *     into `globMatch` is `'file://'` and `'data://'` respectively. This block
 *     pins the resulting contract so future refactors cannot silently change
 *     it.
 *   - `'file*'` is the canonical RNW-style scheme-only pattern: a single glob
 *     entry that admits every `file://...` URL without enumerating a host.
 *     Because `*` matches any run of characters (including `'://'`), the
 *     pattern matches the literal origin string `'file://'`.
 *   - `data:` URLs are opaque — there is no host component. Against the
 *     documented default allowlist (`['http://*', 'https://*']`) they must
 *     short-circuit to `false`, and `wrapWithOriginWhitelist` must still
 *     short-circuit to `true` when the caller has explicitly opted into the
 *     default (the wrapper bypasses origin checks entirely on the fast path).
 */
describe("originMatches — scheme-only 'file*' pattern", () => {
  // Single glob entry covering every file:// URL — the canonical RNW
  // "allow local files" allowlist shape.
  const FILE_SCHEME_ONLY: readonly string[] = ['file*']

  it("admits a 'file:///' URL with an absolute path", () => {
    // file:///etc/passwd → extractOrigin → 'file://' → 'file*' matches
    // because `*` covers the literal '://'.
    assert.equal(originMatches('file:///etc/passwd', FILE_SCHEME_ONLY), true)
  })

  it("admits a 'file:///' URL pointing at a user-space path", () => {
    assert.equal(
      originMatches('file:///Users/me/index.html', FILE_SCHEME_ONLY),
      true
    )
  })

  it("admits a 'file://localhost/...' URL (host normalised away)", () => {
    // The URL parser collapses `file://localhost/...` to an empty host, so
    // the origin string is still `'file://'` and the pattern still matches.
    assert.equal(
      originMatches('file://localhost/etc/hosts', FILE_SCHEME_ONLY),
      true
    )
  })

  it("admits a 'file://' URL case-insensitively", () => {
    assert.equal(originMatches('FILE:///etc/passwd', FILE_SCHEME_ONLY), true)
    assert.equal(originMatches('file:///etc/passwd', ['FILE*']), true)
  })

  it("rejects an 'http://' URL against the 'file*' allowlist (different scheme)", () => {
    // `file*` matches any string starting with `'file'`; 'http://example.com'
    // does not, so the scheme-only pattern correctly excludes it.
    assert.equal(originMatches('http://example.com', FILE_SCHEME_ONLY), false)
  })

  it("rejects an 'https://' URL against the 'file*' allowlist", () => {
    assert.equal(
      originMatches('https://example.com/path', FILE_SCHEME_ONLY),
      false
    )
  })

  it("rejects a 'data:' URL against the 'file*' allowlist", () => {
    // 'data://' origin does not start with 'file', so the scheme-only
    // file allowlist must reject it.
    assert.equal(originMatches('data:text/html,hello', FILE_SCHEME_ONLY), false)
  })

  it("admits a 'file://' URL against the equivalent 'file://*' pattern", () => {
    // Sibling shape: callers who prefer the explicit `scheme://*` form
    // (matching the http/https defaults) still get the same admission.
    assert.equal(originMatches('file:///etc/passwd', ['file://*']), true)
  })

  it("admits a 'file://' URL inside a multi-pattern allowlist", () => {
    // The OR-of-patterns semantics should make `'file*'` admit local files
    // even when the array also contains http/https entries.
    assert.equal(
      originMatches('file:///Users/me/index.html', [
        'http://*',
        'https://*',
        'file*',
      ]),
      true
    )
  })
})

describe("originMatches — 'data:' URL short-circuit behavior", () => {
  it("does NOT admit 'data:text/html,...' against the default http(s) allowlist", () => {
    // anchor: `data:` URLs must be short-circuited to `false` by
    // the documented default allowlist — the http/https globs do not cover
    // the `data:` scheme, and JS-land integrators rely on this to keep
    // arbitrary inline payloads out of their WebView.
    assert.equal(
      originMatches('data:text/html,<h1>hi</h1>', DEFAULT_ORIGIN_WHITELIST),
      false
    )
  })

  it("does NOT admit a base64 'data:' URL against the default allowlist", () => {
    assert.equal(
      originMatches(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
        DEFAULT_ORIGIN_WHITELIST
      ),
      false
    )
  })

  it("does NOT admit 'data:' even when the http(s) pattern is the only entry", () => {
    // Defensive: a single-entry http or https pattern must also reject
    // `data:` for the same reason — the scheme does not match.
    assert.equal(originMatches('data:text/plain,abc', ['https://*']), false)
    assert.equal(originMatches('data:text/plain,abc', ['http://*']), false)
  })

  it("admits a 'data:' URL against an explicit 'data:*' scheme-only pattern", () => {
    // The 'data://' origin string starts with 'data:', so a caller who
    // explicitly opts in via the matching scheme glob can admit `data:`
    // payloads.
    assert.equal(originMatches('data:text/html,hello', ['data:*']), true)
  })

  it("admits a 'data:' URL against an explicit 'data://*' pattern", () => {
    // Equivalent shape using the `scheme://*` form — origin reduces to
    // 'data://' so the pattern matches.
    assert.equal(originMatches('data:application/json,{}', ['data://*']), true)
  })

  it("rejects a 'data:' URL against an over-specific 'data:text/html*' pattern", () => {
    // Origin is reduced to 'data://' before matching, so a pattern that
    // tries to peek past the scheme into the payload prefix cannot match.
    // This pins the "origin-only" contract for opaque-origin URLs.
    assert.equal(
      originMatches('data:text/html,hello', ['data:text/html*']),
      false
    )
  })

  it("admits any 'data:' URL against the universal '*' pattern", () => {
    // The `*` glob matches any origin string (including 'data://'). This
    // confirms the wildcard is not scheme-aware — it really is free.
    assert.equal(originMatches('data:text/html,hello', ['*']), true)
  })

  it('treats an empty pattern list as a hard reject for data: URLs', () => {
    // Mirrors the universal "empty list never matches" rule, restated here
    // specifically for opaque-origin URLs as a regression guard.
    assert.equal(originMatches('data:text/plain,abc', []), false)
  })
})

describe("wrapWithOriginWhitelist — 'data:' event short-circuit on the default fast path", () => {
  it("resolves true without invoking handler for a 'data:' URL when patterns === DEFAULT_ORIGIN_WHITELIST", async () => {
    // The wrapper's fast path is by-reference: when the caller passes the
    // exported default, every event short-circuits to `true` without the
    // handler ever running, REGARDLESS of the URL's scheme. This locks
    // the documented behaviour for `data:` payloads on the fast path —
    // origin matching is intentionally bypassed.
    let invocationCount = 0
    const handler = async (_event: ShouldStartLoadRequest) => {
      invocationCount += 1
      return false
    }
    const guard = wrapWithOriginWhitelist(handler, DEFAULT_ORIGIN_WHITELIST)
    const result = await guard({
      url: 'data:text/html,<h1>hi</h1>',
      navigationType: 'other',
    })
    assert.equal(result, true)
    assert.equal(invocationCount, 0)
  })

  it("delegates to handler for a 'data:' URL when patterns is a non-default array", async () => {
    // When the caller supplies any other patterns array (even structurally
    // equivalent to the default), the wrapper falls through to the handler
    // verbatim — origin matching is NOT performed by `wrapWithOriginWhitelist`
    // itself, which is the documented contract.
    let lastSeenUrl: string | null = null
    const handler = async (event: ShouldStartLoadRequest) => {
      lastSeenUrl = event.url
      return false
    }
    const guard = wrapWithOriginWhitelist(handler, ['https://example.com'])
    const result = await guard({
      url: 'data:text/plain,abc',
      navigationType: 'other',
    })
    assert.equal(result, false)
    assert.equal(lastSeenUrl, 'data:text/plain,abc')
  })
})

/**
 * * `wrapWithOriginWhitelist` forwarding behavior.
 *
 * Contract under test:
 *
 *   1. When `patterns` is the exported `DEFAULT_ORIGIN_WHITELIST` reference,
 *      URLs whose origin matches the documented http(s) default allowlist
 *      BYPASS the user handler — the wrapper short-circuits to `true`
 *      without ever calling `handler`. This is the "matching URLs bypass it"
 *      half of the AC.
 *   2. When `patterns` is any non-default array, every event is FORWARDED to
 *      the user handler verbatim — including the original `ShouldStartLoadRequest`
 *      payload, with no transformation. The handler's `Promise<boolean>`
 *      return value is propagated as the guard's result. This is the
 *      "non-matching URLs are passed to the user handler" half of the AC.
 *
 * Note: the wrapper's discriminator is by-reference equality against
 * `DEFAULT_ORIGIN_WHITELIST` (`patterns === DEFAULT_ORIGIN_WHITELIST`). The
 * "matching" vs "non-matching" distinction is therefore expressed at the
 * patterns-array level: passing the exported default constant means "match
 * all (bypass handler)"; passing any other array means "do not match by
 * default, hand the decision off to the user handler".
 *
 * This block is dedicated to the forwarding contract — the simpler
 * default-short-circuit and delegate-verbatim cases are covered elsewhere in
 * this file; the assertions below pin the AC-level behavior end-to-end with
 * a single spy handler that records every event it observes.
 */
describe('wrapWithOriginWhitelist — forwarding behavior ()', () => {
  // A. Matching (default fast-path): handler is BYPASSED
  it('bypasses the handler for every event when patterns === DEFAULT_ORIGIN_WHITELIST', async () => {
    const seenEvents: ShouldStartLoadRequest[] = []
    const handler: OnShouldStartLoadWithRequestUnderTest = async (event) => {
      seenEvents.push(event)
      // If the wrapper failed to short-circuit, this `false` would surface
      // as the guard's resolved value and the allow assertion below would
      // observe it.
      return false
    }
    const guard = wrapWithOriginWhitelist(handler, DEFAULT_ORIGIN_WHITELIST)

    const events: ShouldStartLoadRequest[] = [
      { url: 'https://example.com/a', navigationType: 'click' },
      { url: 'http://example.com/b', navigationType: 'reload' },
      { url: 'https://api.example.com:8443/c', navigationType: 'formsubmit' },
      // Even a non-http(s) URL is bypassed on the fast path — the wrapper's
      // discriminator is the patterns reference, not the URL's origin.
      { url: 'data:text/plain,abc', navigationType: 'other' },
    ]

    for (const event of events) {
      assert.equal(await guard(event), true)
    }
    assert.equal(
      seenEvents.length,
      0,
      'handler must never be invoked on the default fast path'
    )
  })

  it('bypasses the handler when patterns argument is omitted (default-parameter fast path)', async () => {
    let invocationCount = 0
    const handler: OnShouldStartLoadWithRequestUnderTest = async () => {
      invocationCount += 1
      return false
    }
    const guard = wrapWithOriginWhitelist(handler) // no patterns -> default

    assert.equal(
      await guard({ url: 'https://example.com', navigationType: 'click' }),
      true
    )
    assert.equal(
      await guard({ url: 'http://localhost:8080', navigationType: 'reload' }),
      true
    )
    assert.equal(invocationCount, 0)
  })

  // B. Non-matching (custom patterns): handler is FORWARDED to
  it('forwards every event to the user handler verbatim when patterns is a non-default array', async () => {
    const seenEvents: ShouldStartLoadRequest[] = []
    const handler: OnShouldStartLoadWithRequestUnderTest = async (event) => {
      seenEvents.push(event)
      // Echo a deterministic decision so we can assert verbatim return-value
      // propagation below.
      return event.url.startsWith('https://allow.test')
    }
    const guard = wrapWithOriginWhitelist(handler, ['https://allow.test'])

    const inputs: ShouldStartLoadRequest[] = [
      { url: 'https://allow.test/page', navigationType: 'click' },
      { url: 'https://block.test/bad', navigationType: 'reload' },
      {
        url: 'https://allow.test/with-frame',
        navigationType: 'formsubmit',
        mainDocumentURL: 'https://allow.test/parent',
        isTopFrame: true,
        hasTargetFrame: false,
      },
    ]

    const results = []
    for (const event of inputs) {
      results.push(await guard(event))
    }

    // Every event reached the handler.
    assert.equal(seenEvents.length, inputs.length)
    // The handler received the EXACT payloads — no transformation, no clone.
    assert.deepEqual(seenEvents, inputs)
    for (let i = 0; i < inputs.length; i++) {
      assert.strictEqual(
        seenEvents[i],
        inputs[i],
        'wrapper must pass the original event reference through unchanged'
      )
    }
    // The handler's per-event boolean is propagated verbatim.
    assert.deepEqual(results, [true, false, true])
  })

  it('forwards exactly once per invocation (no duplicate / dropped calls)', async () => {
    let invocationCount = 0
    const handler: OnShouldStartLoadWithRequestUnderTest = async () => {
      invocationCount += 1
      return true
    }
    const guard = wrapWithOriginWhitelist(handler, ['https://example.com'])

    await guard({ url: 'https://example.com/x', navigationType: 'click' })
    await guard({ url: 'https://other.test/y', navigationType: 'reload' })
    await guard({ url: 'https://third.test/z', navigationType: 'other' })

    assert.equal(invocationCount, 3)
  })

  it("forwards even when the URL would NOT match the array's contents (wrapper does not pre-filter)", async () => {
    // Documents the contract that `wrapWithOriginWhitelist` does not itself
    // perform origin matching on the non-default branch — the user handler
    // is the sole authority on the verdict. Callers who want pre-filtering
    // should reach for `createOriginWhitelistGuard` instead.
    let lastSeenUrl: string | null = null
    const handler: OnShouldStartLoadWithRequestUnderTest = async (event) => {
      lastSeenUrl = event.url
      return false
    }
    const guard = wrapWithOriginWhitelist(handler, [
      'https://only-allowed.test',
    ])
    const result = await guard({
      url: 'https://totally-different.test/path',
      navigationType: 'click',
    })
    // Handler decided false → guard resolves false.
    assert.equal(result, false)
    // Handler still saw the event — wrapper did not pre-reject based on
    // origin mismatch.
    assert.equal(lastSeenUrl, 'https://totally-different.test/path')
  })

  it('treats a structurally equal but non-identical default-shape array as the forwarding branch', async () => {
    // Mirrors reference-identity contract, restated here from the
    // forwarding side: even an array with the same shape as the default
    // (`['http://*', 'https://*']`) is forwarded if it is not the exported
    // constant.
    const seenEvents: ShouldStartLoadRequest[] = []
    const handler: OnShouldStartLoadWithRequestUnderTest = async (event) => {
      seenEvents.push(event)
      return true
    }
    const lookalike: readonly string[] = ['http://*', 'https://*']
    assert.notStrictEqual(
      lookalike,
      DEFAULT_ORIGIN_WHITELIST,
      'pre-condition: lookalike must NOT be the exported reference'
    )
    const guard = wrapWithOriginWhitelist(handler, lookalike)

    const event: ShouldStartLoadRequest = {
      url: 'https://example.com',
      navigationType: 'other',
    }
    const result = await guard(event)
    assert.equal(result, true)
    assert.equal(seenEvents.length, 1)
    assert.strictEqual(seenEvents[0], event)
  })

  it('propagates a rejected handler promise as a rejected guard promise', async () => {
    // The wrapper does not swallow handler errors on the forwarding branch —
    // failures surface to the caller so the WebView host can react (e.g. log
    // & treat as deny). This pins the documented "no transformation" contract.
    const sentinel = new Error('handler boom')
    const handler: OnShouldStartLoadWithRequestUnderTest = async () => {
      throw sentinel
    }
    const guard = wrapWithOriginWhitelist(handler, ['https://example.com'])

    await assert.rejects(
      guard({ url: 'https://example.com/x', navigationType: 'click' }),
      (err: unknown) => err === sentinel
    )
  })
})

// Locally-narrowed alias of the public type so the spy handlers can
// be annotated without re-importing the public `OnShouldStartLoadWithRequest`
// at the top of the file (keeps the imports diff minimal).
type OnShouldStartLoadWithRequestUnderTest = (
  event: ShouldStartLoadRequest
) => Promise<boolean>
