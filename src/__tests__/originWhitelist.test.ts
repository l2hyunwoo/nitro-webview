import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ORIGIN_WHITELIST,
  createOriginWhitelistGuard,
  originMatches,
  wrapWithOriginWhitelist,
} from '../originWhitelist.ts'
import type { OnShouldStartLoadWithRequest } from '../originWhitelist.ts'
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

  it('removes explicit default ports before matching', () => {
    assert.equal(
      originMatches('http://example.com:80/path', ['http://example.com']),
      true
    )
    assert.equal(
      originMatches('https://example.com:443/path', ['https://example.com']),
      true
    )
    assert.equal(
      originMatches('https://example.com:443/path', [
        'https://example.com:443',
      ]),
      false
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
 *     return `false`, including when used by either origin guard.
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

const guardFactories = [
  { name: 'createOriginWhitelistGuard', create: createOriginWhitelistGuard },
  {
    name: 'wrapWithOriginWhitelist',
    create: (
      patterns: readonly string[] | undefined,
      handler: OnShouldStartLoadWithRequest
    ) => wrapWithOriginWhitelist(handler, patterns),
  },
]

for (const { name, create } of guardFactories) {
  describe(`${name} — origin and handler decisions`, () => {
    const defaultVariants = [
      undefined,
      DEFAULT_ORIGIN_WHITELIST,
      [...DEFAULT_ORIGIN_WHITELIST],
    ]

    it('honors a false handler with omitted, shared, and copied defaults', async () => {
      let calls = 0
      for (const patterns of defaultVariants) {
        const guard = create(patterns, () => {
          calls += 1
          return false
        })
        assert.equal(
          await guard({ url: 'https://example.com', navigationType: 'click' }),
          false
        )
      }
      assert.equal(calls, defaultVariants.length)
    })

    it('rejects non-HTTP(S) and invalid URLs with every default variant', async () => {
      let calls = 0
      for (const patterns of defaultVariants) {
        const guard = create(patterns, () => {
          calls += 1
          return true
        })
        for (const url of [
          'file:///etc/passwd',
          'ftp://example.com/file',
          'data:text/plain,abc',
          'about:blank',
          'not a url',
          '',
          '/relative/path',
        ]) {
          assert.equal(await guard({ url, navigationType: 'other' }), false)
        }
      }
      assert.equal(calls, 0)
    })

    it('rejects custom-pattern misses even when the handler would allow', async () => {
      let calls = 0
      const guard = create(['https://example.com'], () => {
        calls += 1
        return true
      })
      assert.equal(
        await guard({
          url: 'https://other.test/path',
          navigationType: 'click',
        }),
        false
      )
      assert.equal(calls, 0)
    })

    it('rejects every URL with an empty list without invoking the handler', async () => {
      let calls = 0
      const guard = create([], () => {
        calls += 1
        return true
      })
      assert.equal(
        await guard({ url: 'https://example.com', navigationType: 'click' }),
        false
      )
      assert.equal(calls, 0)
    })

    it('rejects a parse failure even with a universal pattern', async () => {
      let calls = 0
      const guard = create(['*'], () => {
        calls += 1
        return true
      })
      assert.equal(
        await guard({ url: 'not a url', navigationType: 'other' }),
        false
      )
      assert.equal(calls, 0)
    })

    const decisions = [
      { name: 'sync true', handler: () => true, expected: true },
      { name: 'sync false', handler: () => false, expected: false },
      { name: 'async true', handler: async () => true, expected: true },
      { name: 'async false', handler: async () => false, expected: false },
    ]
    for (const { name: decision, handler, expected } of decisions) {
      it(`returns ${decision} and passes each original event exactly once`, async () => {
        let calls = 0
        const event: ShouldStartLoadRequest = Object.freeze({
          url: 'https://example.com/path',
          navigationType: 'formsubmit',
          mainDocumentURL: 'https://example.com/parent',
          isTopFrame: false,
          hasTargetFrame: true,
        })
        const snapshot = { ...event }
        const guard = create(['https://example.com'], (received) => {
          calls += 1
          assert.strictEqual(received, event)
          return handler()
        })
        assert.equal(await guard(event), expected)
        assert.equal(calls, 1)
        assert.deepEqual(event, snapshot)
      })
    }

    for (const asyncFailure of [false, true]) {
      it(`propagates a ${asyncFailure ? 'rejected Promise' : 'sync throw'}`, async () => {
        const error = new Error('handler failed')
        let calls = 0
        const guard = create(DEFAULT_ORIGIN_WHITELIST, () => {
          calls += 1
          if (asyncFailure) return Promise.reject(error)
          throw error
        })
        await assert.rejects(
          guard({ url: 'https://example.com', navigationType: 'click' }),
          (received: unknown) => received === error
        )
        assert.equal(calls, 1)
      })
    }
  })
}

describe('createOriginWhitelistGuard — no inner callback', () => {
  it('allows matching HTTP(S) URLs and rejects unsupported defaults', async () => {
    const guard = createOriginWhitelistGuard()
    for (const url of ['http://example.com', 'https://example.com']) {
      assert.equal(await guard({ url, navigationType: 'other' }), true)
    }
    for (const url of ['file:///tmp/index.html', 'not a url']) {
      assert.equal(await guard({ url, navigationType: 'other' }), false)
    }
  })

  it('applies custom and empty patterns without an inner callback', async () => {
    const event: ShouldStartLoadRequest = {
      url: 'https://example.com',
      navigationType: 'click',
    }
    assert.equal(
      await createOriginWhitelistGuard(['https://example.com'])(event),
      true
    )
    assert.equal(
      await createOriginWhitelistGuard(['https://other.test'])(event),
      false
    )
    assert.equal(await createOriginWhitelistGuard([])(event), false)
  })
})
