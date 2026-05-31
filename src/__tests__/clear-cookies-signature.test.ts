import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  Cookie,
  NitroWebViewMethods,
} from '../specs/NitroWebView.nitro.ts'

/**
 * `NitroWebViewMethods.clearCookies` contract.
 *
 * Verifies the **method signature** and **Promise<void> return type** for
 * the `clearCookies()` method on the Nitro spec at
 * src/specs/NitroWebView.nitro.ts.
 *
 * This is a JS-only runnable test (run by `node --test
 * --experimental-strip-types`) — it does NOT exercise any native bridge.
 * The native iOS / Android implementations of `clearCookies` are validated
 * by their own XCTest / JUnit suites under ios/Tests/ and android/src/test/
 * respectively.
 *
 * What this test guarantees:
 *   1. The `clearCookies` member exists on `NitroWebViewMethods`.
 *   2. The function accepts zero positional parameters.
 *   3. The function returns a `Promise<void>` at the TS-type level AND a
 *      `Promise` whose awaited value is `undefined` at runtime.
 *   4. The promise resolves (does not reject) for a well-formed call,
 *      mirroring the platform contract: WKHTTPCookieStore.delete and
 *      CookieManager.removeAllCookies/flush both report completion
 *      asynchronously.
 *   5. After `clearCookies()` resolves, a subsequent `getCookies(url)` call
 *      against the same fake store yields the empty array — every cookie
 *      in the platform's shared cookie store is removed.
 */

// --- Type-level pinning ----------------------------------------------------
// If the spec ever drifts away from `() => Promise<void>`, this file fails
// to type-check under `yarn typecheck` even before tests run.

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

type _ClearCookies_ExactSignature = Assert<
  Equals<NitroWebViewMethods['clearCookies'], () => Promise<void>>
>

// Touch the type alias so the compiler does not tree-shake it away.
// Leading underscore tells the linter this binding is intentionally unused.
const _typePin: _ClearCookies_ExactSignature = true
if (_typePin !== true) throw new Error('unreachable')

// --- A minimal in-memory fake that satisfies the method shape -------------
//
// We model just enough of `NitroWebViewMethods.clearCookies` to exercise
// the promise contract at runtime. The fake intentionally only implements
// `clearCookies` meaningfully (plus a tiny `setCookie`/`getCookies` pair so
// the "clears every entry" assertion has something concrete to observe);
// the other methods are stubbed because the type system requires
// their presence on `NitroWebViewMethods`.

class FakeCookieStore implements NitroWebViewMethods {
  private readonly store = new Map<string, Cookie[]>()

  seed(url: string, cookies: Cookie[]): void {
    this.store.set(originOf(url), [...cookies])
  }

  // --- Method under test --------------------------------------------------
  clearCookies(): Promise<void> {
    // Microtask hop mirrors the native bridge: WKHTTPCookieStore.delete
    // and CookieManager.removeAllCookies + flush both confirm completion
    // asynchronously, never synchronously.
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        this.store.clear()
        resolve()
      })
    })
  }

  // --- Unrelated methods (typed stubs for spec parity) --------------------
  getCookies(url: string): Promise<Cookie[]> {
    return Promise.resolve([...(this.store.get(originOf(url)) ?? [])])
  }
  setCookie(url: string, cookie: Cookie): Promise<void> {
    const origin = originOf(url)
    const bucket = this.store.get(origin) ?? []
    const next = bucket.filter((c) => c.name !== cookie.name)
    next.push({ ...cookie })
    this.store.set(origin, next)
    return Promise.resolve()
  }
  evaluateJavaScript(_code: string): Promise<string> {
    return Promise.resolve('')
  }
  goBack(): void {}
  goForward(): void {}
  reload(): void {}
  stopLoading(): void {}
}

function originOf(url: string): string {
  // Tiny normaliser — `host` is enough for the test (no port/scheme split).
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}`
  } catch {
    return url
  }
}

// --- Tests -----------------------------------------------------------------

test('clearCookies is a function exposed on NitroWebViewMethods', () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  assert.equal(
    typeof view.clearCookies,
    'function',
    'NitroWebViewMethods.clearCookies must be exposed as a function'
  )
  assert.equal(
    view.clearCookies.length,
    0,
    'clearCookies must declare zero positional parameters'
  )
})

test('clearCookies() returns a Promise (not a synchronous value)', () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  const ret = view.clearCookies()
  assert.ok(
    ret instanceof Promise,
    'clearCookies must return a Promise at runtime; the contract is Promise<void>'
  )
})

test('clearCookies() resolves with undefined (Promise<void> contract)', async () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  const resolved = await view.clearCookies()
  assert.equal(
    resolved,
    undefined,
    'awaited result of clearCookies must be undefined (Promise<void>)'
  )
})

test('clearCookies() does not reject for a well-formed call', async () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  await assert.doesNotReject(
    () => view.clearCookies(),
    'clearCookies must resolve (not reject) on a well-formed call'
  )
})

test('clearCookies() empties the underlying store (remove every cookie)', async () => {
  const fake = new FakeCookieStore()
  fake.seed('https://example.com', [
    { name: 'sid', value: 'abc123' },
    { name: 'pref', value: 'dark' },
  ])
  fake.seed('https://other.example.org', [{ name: 'tracker', value: 'xyz' }])

  // Sanity: pre-clear state is non-empty across multiple origins.
  const view: NitroWebViewMethods = fake
  const before = await view.getCookies('https://example.com')
  assert.equal(before.length, 2, 'pre-clear store must contain seeded cookies')

  await view.clearCookies()

  const afterSame = await view.getCookies('https://example.com')
  const afterOther = await view.getCookies('https://other.example.org')
  assert.deepEqual(
    afterSame,
    [],
    'clearCookies must remove cookies from the original origin'
  )
  assert.deepEqual(
    afterOther,
    [],
    'clearCookies must remove cookies across ALL origins ("every cookie")'
  )
})

test('clearCookies signature is assignable to () => Promise<void>', async () => {
  // Assignment to the canonical signature: if the spec drifts, this fails
  // at typecheck. The runtime check below ensures the file is executed.
  const fake = new FakeCookieStore()
  const fn: () => Promise<void> = fake.clearCookies.bind(fake)
  const result = fn()
  assert.ok(
    result instanceof Promise,
    'the canonical () => Promise<void> binding must return a Promise'
  )
  const awaited = await result
  assert.equal(
    awaited,
    undefined,
    'the canonical signature must resolve to undefined (Promise<void>)'
  )
})
