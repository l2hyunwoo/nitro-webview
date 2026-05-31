import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { mergeHeaders } from '../headerMerge.ts'

/**
 * Unit tests for the `mergeHeaders` utility.
 *
 * Contract under test:
 *
 *   1. The result is the union of `defaults` and `perRequest`.
 *   2. On key conflict, the per-request entry WINS over the default
 *      (documented precedence — per-request `source.headers` overrides
 *      `NitroWebViewProps.defaultHeaders`).
 *   3. Conflict detection is case-INSENSITIVE; the **per-request** key's
 *      casing survives in the output (mirrors the iOS WKWebView header
 *      contract).
 *   4. `undefined`/empty inputs are tolerated and never mutated.
 *   5. The function always returns a fresh object — mutating the result
 *      must not affect the inputs.
 *
 * NOTE: This file lives under `src/__tests__/` so that `yarn test`
 * (`node --test --experimental-strip-types "src/**\/*.test.ts"`)
 * automatically discovers it; that is the canonical `__tests__/`
 * location in this repo.
 */

describe('mergeHeaders — union semantics', () => {
  it('returns an empty object when both inputs are undefined', () => {
    assert.deepEqual(mergeHeaders(undefined, undefined), {})
  })

  it('returns an empty object when both inputs are empty', () => {
    assert.deepEqual(mergeHeaders({}, {}), {})
  })

  it('returns defaults verbatim when perRequest is undefined', () => {
    const defaults = { 'X-App': 'nitro', 'User-Agent': 'nitro/1.0' }
    assert.deepEqual(mergeHeaders(defaults, undefined), {
      'X-App': 'nitro',
      'User-Agent': 'nitro/1.0',
    })
  })

  it('returns perRequest verbatim when defaults is undefined', () => {
    const perRequest = { Authorization: 'Bearer tok' }
    assert.deepEqual(mergeHeaders(undefined, perRequest), {
      Authorization: 'Bearer tok',
    })
  })

  it('produces the union of disjoint key sets', () => {
    const defaults = { 'X-A': '1', 'X-B': '2' }
    const perRequest = { 'X-C': '3' }
    assert.deepEqual(mergeHeaders(defaults, perRequest), {
      'X-A': '1',
      'X-B': '2',
      'X-C': '3',
    })
  })
})

describe('mergeHeaders — conflict precedence (per-request wins)', () => {
  it('per-request value overrides default for the same exact key', () => {
    assert.deepEqual(
      mergeHeaders({ Authorization: 'def' }, { Authorization: 'override' }),
      { Authorization: 'override' }
    )
  })

  it('per-request wins on case-insensitive key conflict', () => {
    // Default uses `Authorization`; per-request uses lower-case
    // `authorization`. The per-request entry must win AND the
    // per-request casing must be the one that appears in the output.
    assert.deepEqual(
      mergeHeaders({ Authorization: 'def' }, { authorization: 'override' }),
      { authorization: 'override' }
    )
  })

  it('per-request wins on mixed-case key conflict', () => {
    assert.deepEqual(
      mergeHeaders({ 'X-Custom-Header': 'old' }, { 'x-CUSTOM-header': 'new' }),
      { 'x-CUSTOM-header': 'new' }
    )
  })

  it('non-conflicting defaults are preserved alongside overrides', () => {
    const defaults = {
      'Authorization': 'def',
      'X-App': 'nitro',
      'User-Agent': 'nitro/1.0',
    }
    const perRequest = { 'authorization': 'override', 'X-Trace': 'abc' }
    assert.deepEqual(mergeHeaders(defaults, perRequest), {
      'X-App': 'nitro',
      'User-Agent': 'nitro/1.0',
      'authorization': 'override',
      'X-Trace': 'abc',
    })
  })

  it('multiple conflicts each independently resolve to the per-request value', () => {
    const defaults = { A: '1', B: '2', C: '3' }
    const perRequest = { a: 'A!', B: 'B!' }
    assert.deepEqual(mergeHeaders(defaults, perRequest), {
      C: '3',
      a: 'A!',
      B: 'B!',
    })
  })
})

describe('mergeHeaders — purity', () => {
  it('does not mutate the defaults input', () => {
    const defaults = { 'X-App': 'nitro' }
    const snapshot = { ...defaults }
    mergeHeaders(defaults, { 'X-App': 'override', 'X-Extra': 'y' })
    assert.deepEqual(defaults, snapshot)
  })

  it('does not mutate the perRequest input', () => {
    const perRequest = { Authorization: 'tok' }
    const snapshot = { ...perRequest }
    mergeHeaders({ 'X-App': 'nitro' }, perRequest)
    assert.deepEqual(perRequest, snapshot)
  })

  it('returns a fresh object each call (mutating result does not leak)', () => {
    const defaults = { 'X-A': '1' }
    const first = mergeHeaders(defaults, undefined)
    first['X-A'] = 'mutated'
    const second = mergeHeaders(defaults, undefined)
    assert.deepEqual(second, { 'X-A': '1' })
  })
})
