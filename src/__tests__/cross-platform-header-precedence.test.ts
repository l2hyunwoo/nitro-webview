import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { mergeHeaders } from '../headerMerge.ts'
import type { NitroWebViewProps } from '../specs/NitroWebView.nitro'
import type { UriSource } from '../specs/WebViewSource'

/**
 * Cross-platform JS/TS contract test for header precedence.
 *
 * GOAL
 *   When `NitroWebViewProps.defaultHeaders` and `UriSource.headers`
 *   carry the SAME key, the per-request `source.headers` value MUST
 *   be the one that ultimately appears in the outgoing main-frame
 *   navigation header map. This contract holds on BOTH iOS WKWebView
 *   and Android `android.webkit.WebView`.
 *
 * WHY THIS LIVES AT THE SPEC LAYER
 *   This is a cross-platform contract test — it lives in the JS/TS
 *   spec layer (no native runtime needed) and pins the resolved
 *   outgoing header map for the two platforms' divergent comparison
 *   models in a single file:
 *
 *     iOS  — case-INSENSITIVE conflict detection (mirrored by
 *            `mergeHeaders` in `src/headerMerge.ts`). When defaults
 *            carry `Authorization` and per-request carries
 *            `authorization`, only the per-request entry survives.
 *     Android — exact-match conflict detection (mirrored inline below
 *            via `mergeHeadersExact`, matching the Kotlin
 *            `HybridNitroWebView.Companion.mergeHeaders` implementation
 *            which performs a plain `out.putAll(d); out.putAll(r)` over
 *            a `LinkedHashMap<String, String>`). When both maps use the
 *            exact same key, the per-request entry overwrites the
 *            default; when casing differs both keys coexist and the
 *            per-request entry still controls its own key.
 *
 * INPUT FIXTURE
 *   Every assertion below uses the same overlapping
 *   `NitroWebViewProps.defaultHeaders` / `UriSource.headers` shape.
 *   The fixture covers BOTH a same-casing conflict (so the Android
 *   exact-match path also resolves to the per-request value) AND a
 *   different-casing conflict (so the iOS case-insensitive path's
 *   distinct outcome is also pinned).
 *
 * THIS IS NOT A DUPLICATE OF
 *   - `headerMerge.test.ts` — exercises low-level `mergeHeaders`
 *     unit invariants (purity, undefined tolerance, …).
 *   - `default-headers-contract.test.ts` — pins the TS surface
 *     (optionality, Record shape) of `defaultHeaders` /
 *     `UriSource.headers`.
 *   This file is the cross-platform OUTGOING-HEADER-MAP precedence
 *   pin: feeds an overlapping props fixture in, asserts the resolved
 *   map exposes the `source.headers` values on conflicting keys, on
 *   BOTH iOS and Android comparison models.
 */

// ---------------------------------------------------------------------------
// Reference implementations of the two platform merge models.
//
//   - iOS: re-uses the shared `mergeHeaders` utility from
//     `src/headerMerge.ts`, which encodes the case-insensitive conflict
//     rule used by `HybridNitroWebView.swift::mergeHeaders`.
//   - Android: inlined here so the test pins the Kotlin contract
//     literally (`HashMap.putAll(defaults); HashMap.putAll(perRequest)`).
//     The Kotlin companion-object helper has the same semantics.
// ---------------------------------------------------------------------------

function mergeHeadersIOS(
  defaults: Record<string, string> | undefined,
  perRequest: Record<string, string> | undefined
): Record<string, string> {
  // The shared utility encodes iOS semantics (case-insensitive).
  return mergeHeaders(defaults, perRequest)
}

function mergeHeadersAndroid(
  defaults: Record<string, string> | undefined,
  perRequest: Record<string, string> | undefined
): Record<string, string> {
  // Exact-match merge — mirror of Kotlin
  // `HybridNitroWebView.Companion.mergeHeaders` (and the inline 2-arg
  // `loadUrl` path):  `out.putAll(defaults); out.putAll(perRequest)`.
  const out: Record<string, string> = { ...(defaults ?? {}) }
  for (const [k, v] of Object.entries(perRequest ?? {})) {
    out[k] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Shared fixture — the SAME overlapping props go into BOTH platform models.
// ---------------------------------------------------------------------------

/**
 * Common props fixture used by every assertion below.
 *
 *   `defaultHeaders` carries:
 *     - `Authorization: Bearer DEFAULT`  ← conflict with per-request
 *                                          (same casing → conflicts on
 *                                          BOTH platforms)
 *     - `X-Trace: default-trace`         ← conflict with per-request
 *                                          (casing differs → conflicts
 *                                          on iOS only — "conflicting
 *                                          keys" applies to the logical
 *                                          header name)
 *     - `User-Agent: nitro/default`      ← no conflict — must survive
 *                                          on both platforms
 *
 *   `source.headers` carries:
 *     - `Authorization: Bearer REQUEST` ← per-request value
 *     - `x-trace: request-trace`        ← per-request value with
 *                                          different casing
 *     - `X-Custom: extra`               ← no conflict — must survive
 *                                          on both platforms
 */
const propsFixture: Pick<NitroWebViewProps, 'source' | 'defaultHeaders'> = {
  defaultHeaders: {
    'Authorization': 'Bearer DEFAULT',
    'X-Trace': 'default-trace',
    'User-Agent': 'nitro/default',
  },
  source: {
    uri: 'https://example.com/page',
    headers: {
      'Authorization': 'Bearer REQUEST',
      'x-trace': 'request-trace',
      'X-Custom': 'extra',
    },
  },
}

/**
 * Resolve the outgoing main-frame header map for a given platform.
 *
 * Reads the `UriSource.headers` field off the fixture (narrowed to
 * `UriSource`, which is the only `WebViewSource` variant that carries
 * `headers`) and feeds it together with `defaultHeaders` into the
 * platform-specific merge model.
 */
function resolveOutgoingHeaders(
  props: Pick<NitroWebViewProps, 'source' | 'defaultHeaders'>,
  platform: 'ios' | 'android'
): Record<string, string> {
  // The fixture always uses a UriSource — narrow safely.
  const uri = props.source as UriSource
  const perRequest = uri.headers
  return platform === 'ios'
    ? mergeHeadersIOS(props.defaultHeaders, perRequest)
    : mergeHeadersAndroid(props.defaultHeaders, perRequest)
}

// ---------------------------------------------------------------------------
// Assertions — same fixture, both platforms.
// ---------------------------------------------------------------------------

describe('cross-platform header precedence (defaultHeaders vs source.headers)', () => {
  it('iOS: per-request `source.headers` value wins for the conflicting `Authorization` key', () => {
    const resolved = resolveOutgoingHeaders(propsFixture, 'ios')

    // Per-request value MUST be the one exposed for the conflicting key.
    assert.equal(
      resolved.Authorization,
      'Bearer REQUEST',
      'iOS: source.headers["Authorization"] must override defaultHeaders'
    )

    // The default value must NOT survive under the same logical header.
    const lowered = Object.fromEntries(
      Object.entries(resolved).map(([k, v]) => [k.toLowerCase(), v])
    )
    assert.notEqual(
      lowered.authorization,
      'Bearer DEFAULT',
      'iOS: the default Authorization value must not appear in the resolved map'
    )
  })

  it('Android: per-request `source.headers` value wins for the exact-match `Authorization` key', () => {
    const resolved = resolveOutgoingHeaders(propsFixture, 'android')

    // Exact-match merge: the per-request value overwrites the default
    // because both use the exact same `Authorization` key.
    assert.equal(
      resolved.Authorization,
      'Bearer REQUEST',
      'Android: source.headers["Authorization"] must override defaultHeaders on exact-match conflict'
    )
    assert.notEqual(
      resolved.Authorization,
      'Bearer DEFAULT',
      'Android: the default Authorization value must not survive for the exact-matched key'
    )
  })

  it('iOS: case-insensitive conflict on `X-Trace` resolves to the per-request casing+value', () => {
    const resolved = resolveOutgoingHeaders(propsFixture, 'ios')

    // The per-request casing (`x-trace`) survives; the default
    // capitalization (`X-Trace`) is dropped entirely.
    assert.equal(
      resolved['x-trace'],
      'request-trace',
      'iOS: per-request casing wins on case-insensitive conflict'
    )
    assert.ok(
      !('X-Trace' in resolved),
      'iOS: the default `X-Trace` key must be stripped (its lowercase form collides with per-request `x-trace`)'
    )
  })

  it('Android: differing-case headers coexist; the per-request value still controls its own key', () => {
    const resolved = resolveOutgoingHeaders(propsFixture, 'android')

    // Exact-match merge keeps both keys; this is the documented
    // platform divergence. The contract under test ("source.headers
    // value wins on conflicting key") still holds: the per-request
    // entry controls its own exact key.
    assert.equal(
      resolved['x-trace'],
      'request-trace',
      'Android: per-request entry survives at its exact key'
    )
    assert.equal(
      resolved['X-Trace'],
      'default-trace',
      'Android: default entry at a differently-cased key is NOT considered a conflict and survives (documented divergence from iOS)'
    )
  })

  it('non-conflicting defaults survive on both platforms', () => {
    const iOS = resolveOutgoingHeaders(propsFixture, 'ios')
    const android = resolveOutgoingHeaders(propsFixture, 'android')

    assert.equal(iOS['User-Agent'], 'nitro/default')
    assert.equal(android['User-Agent'], 'nitro/default')
  })

  it('non-conflicting per-request entries survive on both platforms', () => {
    const iOS = resolveOutgoingHeaders(propsFixture, 'ios')
    const android = resolveOutgoingHeaders(propsFixture, 'android')

    assert.equal(iOS['X-Custom'], 'extra')
    assert.equal(android['X-Custom'], 'extra')
  })

  it('the resolved outgoing map exposes the per-request value for EVERY conflicting key — on both platforms', () => {
    // This is the headline cross-platform invariant.
    //
    //   For every key K present in `source.headers`, the resolved
    //   outgoing header map MUST expose `source.headers[K]` under
    //   that key on BOTH platforms. (Defaults at a different casing
    //   may also survive on Android — that is the documented
    //   divergence and is asserted by the dedicated test above.)
    const perRequest = (propsFixture.source as UriSource).headers ?? {}
    const platforms: Array<'ios' | 'android'> = ['ios', 'android']
    for (const platform of platforms) {
      const resolved = resolveOutgoingHeaders(propsFixture, platform)
      for (const [k, v] of Object.entries(perRequest)) {
        assert.equal(
          resolved[k],
          v,
          `${platform}: resolved["${k}"] must equal source.headers["${k}"] ("${v}")`
        )
      }
    }
  })
})
