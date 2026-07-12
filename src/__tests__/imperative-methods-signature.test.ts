import test from 'node:test'
import assert from 'node:assert/strict'

import type { NitroWebViewMethods } from '../specs/NitroWebView.nitro.ts'

/**
 * Signature pins for the three imperative methods added to
 * `NitroWebViewMethods`: `clearCache()`, `clearHistory()`, `requestFocus()`.
 *
 * All three are `() => Promise<void>` — uniform with the existing async
 * methods (`clearCookies`) so callers have one mental model. If the spec ever
 * drifts (e.g. someone makes `requestFocus` synchronous `void`), the
 * type-level pins below fail `yarn typecheck` before tests even run.
 *
 * JS-only (run by `node --test --experimental-strip-types`); the native iOS /
 * Android implementations are exercised by their own XCTest / JUnit suites.
 */

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

type _ClearCache_Sig = Assert<
  Equals<NitroWebViewMethods['clearCache'], () => Promise<void>>
>
type _ClearHistory_Sig = Assert<
  Equals<NitroWebViewMethods['clearHistory'], () => Promise<void>>
>
type _RequestFocus_Sig = Assert<
  Equals<NitroWebViewMethods['requestFocus'], () => Promise<void>>
>

// Touch the aliases so the compiler does not tree-shake them away.
const _pins: [_ClearCache_Sig, _ClearHistory_Sig, _RequestFocus_Sig] = [
  true,
  true,
  true,
]
if (_pins.some((p) => p !== true)) throw new Error('unreachable')

// A narrow fake satisfying just the three methods (plus typed stubs the
// interface requires) so the runtime shape can be exercised.
class FakeMethods implements Pick<
  NitroWebViewMethods,
  'clearCache' | 'clearHistory' | 'requestFocus'
> {
  clearCache(): Promise<void> {
    return Promise.resolve()
  }
  clearHistory(): Promise<void> {
    return Promise.resolve()
  }
  requestFocus(): Promise<void> {
    return Promise.resolve()
  }
}

const METHODS = ['clearCache', 'clearHistory', 'requestFocus'] as const

for (const name of METHODS) {
  test(`${name} is a zero-arg function returning a Promise<void>`, async () => {
    const fake = new FakeMethods()
    const fn = fake[name].bind(fake) as () => Promise<void>
    assert.equal(typeof fn, 'function', `${name} must be a function`)
    assert.equal(
      fn.length,
      0,
      `${name} must declare zero positional parameters`
    )
    const ret = fn()
    assert.ok(ret instanceof Promise, `${name} must return a Promise`)
    assert.equal(await ret, undefined, `${name} must resolve to undefined`)
  })
}
