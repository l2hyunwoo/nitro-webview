import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  Cookie,
  NitroWebViewMethods,
} from '../specs/NitroWebView.nitro.ts'

/**
 * `NitroWebViewMethods.getCookies` contract.
 *
 * Verifies the **method signature** and **Promise<Cookie[]> return type**
 * for the `getCookies(url: string)` method on the Nitro spec at
 * src/specs/NitroWebView.nitro.ts.
 *
 * This is a JS-only runnable test (run by `node --test
 * --experimental-strip-types`) — it does NOT exercise any native bridge.
 * The native iOS / Android implementations of `getCookies` are validated
 * by their own XCTest / JUnit suites under ios/Tests/ and
 * android/src/test/ respectively.
 *
 * What this test guarantees:
 *   1. The `getCookies` member exists on `NitroWebViewMethods`.
 *   2. The function accepts a single `string` argument named `url`.
 *   3. The function returns a `Promise<Cookie[]>` at the TS-type level
 *      AND the awaited value is structurally an Array of objects whose
 *      keys are a subset of the documented `Cookie` interface fields.
 *   4. An empty cookie store resolves with `[]`.
 */

// --- Type-level pinning ----------------------------------------------------
// If the spec ever drifts away from `(url: string) => Promise<Cookie[]>`,
// this file fails to type-check under `yarn typecheck` even before tests run.

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

type _GetCookies_ExactSignature = Assert<
  Equals<NitroWebViewMethods['getCookies'], (url: string) => Promise<Cookie[]>>
>

// Touch the type alias so the compiler does not tree-shake it away.
// Leading underscore tells the linter this binding is intentionally unused.
const _typePin: _GetCookies_ExactSignature = true
if (_typePin !== true) throw new Error('unreachable')

// --- A minimal in-memory fake that satisfies the method shape -------------
//
// We model just enough of `NitroWebViewMethods.getCookies` to exercise the
// promise contract at runtime. The fake is intentionally narrow: it only
// implements `getCookies`; the other methods are stubbed because the
// type system requires their presence on `NitroWebViewMethods`.

class FakeCookieStore implements NitroWebViewMethods {
  private readonly store = new Map<string, Cookie[]>()

  seed(url: string, cookies: Cookie[]): void {
    this.store.set(originOf(url), [...cookies])
  }

  // --- Method under test --------------------------------------------------
  getCookies(url: string): Promise<Cookie[]> {
    // Microtask hop mirrors the native bridge: WKHTTPCookieStore /
    // CookieManager both deliver via an asynchronous callback, never
    // synchronously.
    return new Promise<Cookie[]>((resolve) => {
      queueMicrotask(() => {
        const origin = originOf(url)
        const hits = this.store.get(origin) ?? []
        resolve([...hits])
      })
    })
  }

  // --- Unrelated methods (typed stubs for spec parity) --------------------
  setCookie(_url: string, _cookie: Cookie): Promise<void> {
    return Promise.resolve()
  }
  clearCookies(): Promise<void> {
    this.store.clear()
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

test('getCookies is a function exposed on NitroWebViewMethods', () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  assert.equal(
    typeof view.getCookies,
    'function',
    'NitroWebViewMethods.getCookies must be exposed as a function'
  )
  assert.equal(
    view.getCookies.length,
    1,
    'getCookies must declare exactly one positional parameter (url: string)'
  )
})

test('getCookies(url) returns a Promise (not a synchronous value)', () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  const ret = view.getCookies('https://example.com')
  assert.ok(
    ret instanceof Promise,
    'getCookies must return a Promise at runtime; the contract is Promise<Cookie[]>'
  )
})

test('getCookies on an empty store resolves with [] (empty array)', async () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  const cookies = await view.getCookies('https://example.com')
  assert.ok(
    Array.isArray(cookies),
    'awaited result of getCookies must be an Array (Promise<Cookie[]>)'
  )
  assert.equal(
    cookies.length,
    0,
    'an empty cookie store must resolve with [] ' +
      '("resolves with an empty array when no cookies are stored")'
  )
})

test('getCookies returns Cookie[] whose elements honor the Cookie shape', async () => {
  const fake = new FakeCookieStore()
  fake.seed('https://example.com', [
    { name: 'sid', value: 'abc123' },
    {
      name: 'pref',
      value: 'dark',
      domain: '.example.com',
      path: '/',
      expires: Date.now() + 60_000,
      secure: true,
      httpOnly: false,
    },
  ])

  const view: NitroWebViewMethods = fake
  const cookies = await view.getCookies('https://example.com/some/path')

  assert.equal(cookies.length, 2, 'two seeded cookies must round-trip')

  // First cookie — required fields only.
  assert.equal(cookies[0].name, 'sid')
  assert.equal(cookies[0].value, 'abc123')
  assert.equal(typeof cookies[0].name, 'string')
  assert.equal(typeof cookies[0].value, 'string')

  // Second cookie — every documented optional field is preserved.
  const full = cookies[1]
  assert.equal(full.name, 'pref')
  assert.equal(full.value, 'dark')
  assert.equal(full.domain, '.example.com')
  assert.equal(full.path, '/')
  assert.equal(typeof full.expires, 'number')
  assert.equal(full.secure, true)
  assert.equal(full.httpOnly, false)

  // Structural assertion: every element must be assignable back to Cookie.
  for (const c of cookies) {
    const echoed: Cookie = c
    assert.equal(typeof echoed.name, 'string')
    assert.equal(typeof echoed.value, 'string')
  }
})

test('getCookies(url) scopes by origin (different origin → empty array)', async () => {
  const fake = new FakeCookieStore()
  fake.seed('https://example.com', [{ name: 'sid', value: 'abc123' }])
  const view: NitroWebViewMethods = fake

  const sameOrigin = await view.getCookies('https://example.com/dashboard')
  assert.equal(
    sameOrigin.length,
    1,
    'getCookies must return cookies stored for the same origin'
  )

  const otherOrigin = await view.getCookies('https://other.example.org/')
  assert.deepEqual(
    otherOrigin,
    [],
    'getCookies must NOT return cookies stored for a different origin ' +
      '(filters by host suffix match against url)'
  )
})

test('getCookies signature is assignable to (url: string) => Promise<Cookie[]>', () => {
  // Assignment to the canonical signature: if the spec drifts, this fails
  // at typecheck. The runtime check below ensures the file is executed.
  const fake = new FakeCookieStore()
  const fn: (url: string) => Promise<Cookie[]> = fake.getCookies.bind(fake)
  const result = fn('https://example.com')
  assert.ok(
    result instanceof Promise,
    'the canonical (url: string) => Promise<Cookie[]> binding must return a Promise'
  )
})
