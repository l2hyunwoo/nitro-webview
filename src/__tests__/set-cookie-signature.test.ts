import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  Cookie,
  NitroWebViewMethods,
} from '../specs/NitroWebView.nitro.ts'

/**
 * `NitroWebViewMethods.setCookie` contract.
 *
 * Verifies the **method signature** and **Promise<void> return type** for
 * the `setCookie(url: string, cookie: Cookie)` method on the Nitro spec
 * at src/specs/NitroWebView.nitro.ts.
 *
 * This is a JS-only runnable test (run by `node --test
 * --experimental-strip-types`) — it does NOT exercise any native bridge.
 * The native iOS / Android implementations of `setCookie` are validated by
 * their own XCTest / JUnit suites under ios/Tests/ and android/src/test/
 * respectively.
 *
 * What this test guarantees:
 *   1. The `setCookie` member exists on `NitroWebViewMethods`.
 *   2. The function accepts exactly two positional parameters:
 *        - `url: string`
 *        - `cookie: Cookie`
 *   3. The function returns a `Promise<void>` at the TS-type level AND a
 *      `Promise` whose awaited value is `undefined` at runtime.
 *   4. The `cookie` argument is accepted both with only the required fields
 *      (`name`, `value`) and with the full optional set (`domain`, `path`,
 *      `expires`, `secure`, `httpOnly`), without type errors and without
 *      runtime exceptions from the spec-compliant fake implementation.
 *   5. The promise resolves (does not reject) for a well-formed call,
 *      mirroring the platform contract: WKHTTPCookieStore.setCookie and
 *      CookieManager.setCookie/flush both report completion asynchronously.
 */

// --- Type-level pinning ----------------------------------------------------
// If the spec ever drifts away from `(url: string, cookie: Cookie) =>
// Promise<void>`, this file fails to type-check under `yarn typecheck`
// even before tests run.

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

type _SetCookie_ExactSignature = Assert<
  Equals<
    NitroWebViewMethods['setCookie'],
    (url: string, cookie: Cookie) => Promise<void>
  >
>

// Touch the type alias so the compiler does not tree-shake it away.
// Leading underscore tells the linter this binding is intentionally unused.
const _typePin: _SetCookie_ExactSignature = true
if (_typePin !== true) throw new Error('unreachable')

// --- A minimal in-memory fake that satisfies the method shape -------------
//
// We model just enough of `NitroWebViewMethods.setCookie` to exercise the
// promise contract at runtime. The fake intentionally only implements
// `setCookie` meaningfully; the other methods are stubbed because
// the type system requires their presence on `NitroWebViewMethods`.

class FakeCookieStore implements NitroWebViewMethods {
  private readonly store = new Map<string, Cookie[]>()

  // --- Method under test --------------------------------------------------
  setCookie(url: string, cookie: Cookie): Promise<void> {
    // Microtask hop mirrors the native bridge: WKHTTPCookieStore and
    // CookieManager.setCookie+flush both confirm completion asynchronously,
    // never synchronously.
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        const origin = originOf(url)
        const bucket = this.store.get(origin) ?? []
        // Replace-by-name semantics (cookies are keyed by name within an origin).
        const next = bucket.filter((c) => c.name !== cookie.name)
        next.push({ ...cookie })
        this.store.set(origin, next)
        resolve()
      })
    })
  }

  // Inspection helper used by tests below.
  readBucket(url: string): Cookie[] {
    return [...(this.store.get(originOf(url)) ?? [])]
  }

  // --- Unrelated methods (typed stubs for spec parity) --------------------
  getCookies(url: string): Promise<Cookie[]> {
    return Promise.resolve([...(this.store.get(originOf(url)) ?? [])])
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

test('setCookie is a function exposed on NitroWebViewMethods', () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  assert.equal(
    typeof view.setCookie,
    'function',
    'NitroWebViewMethods.setCookie must be exposed as a function'
  )
  assert.equal(
    view.setCookie.length,
    2,
    'setCookie must declare exactly two positional parameters (url: string, cookie: Cookie)'
  )
})

test('setCookie(url, cookie) returns a Promise (not a synchronous value)', () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  const ret = view.setCookie('https://example.com', {
    name: 'sid',
    value: 'abc123',
  })
  assert.ok(
    ret instanceof Promise,
    'setCookie must return a Promise at runtime; the contract is Promise<void>'
  )
})

test('setCookie resolves with undefined (Promise<void> contract)', async () => {
  const view: NitroWebViewMethods = new FakeCookieStore()
  const resolved = await view.setCookie('https://example.com', {
    name: 'sid',
    value: 'abc123',
  })
  assert.equal(
    resolved,
    undefined,
    'awaited result of setCookie must be undefined (Promise<void>)'
  )
})

test('setCookie accepts a minimal Cookie (only name + value)', async () => {
  const fake = new FakeCookieStore()
  const view: NitroWebViewMethods = fake

  const minimal: Cookie = { name: 'sid', value: 'abc123' }
  await assert.doesNotReject(
    () => view.setCookie('https://example.com', minimal),
    'setCookie must accept a Cookie with only the required name + value fields'
  )

  const stored = fake.readBucket('https://example.com')
  assert.equal(stored.length, 1)
  assert.equal(stored[0].name, 'sid')
  assert.equal(stored[0].value, 'abc123')
  assert.equal(stored[0].domain, undefined)
  assert.equal(stored[0].path, undefined)
  assert.equal(stored[0].expires, undefined)
  assert.equal(stored[0].secure, undefined)
  assert.equal(stored[0].httpOnly, undefined)
})

test('setCookie accepts a Cookie with every documented optional field', async () => {
  const fake = new FakeCookieStore()
  const view: NitroWebViewMethods = fake

  const full: Cookie = {
    name: 'pref',
    value: 'dark',
    domain: '.example.com',
    path: '/',
    expires: Date.now() + 60_000,
    secure: true,
    httpOnly: false,
  }

  await assert.doesNotReject(
    () => view.setCookie('https://example.com/dashboard', full),
    'setCookie must accept a Cookie carrying domain/path/expires/secure/httpOnly'
  )

  const stored = fake.readBucket('https://example.com')
  assert.equal(stored.length, 1)
  const echoed = stored[0]
  assert.equal(echoed.name, 'pref')
  assert.equal(echoed.value, 'dark')
  assert.equal(echoed.domain, '.example.com')
  assert.equal(echoed.path, '/')
  assert.equal(typeof echoed.expires, 'number')
  assert.equal(echoed.secure, true)
  assert.equal(echoed.httpOnly, false)
})

test('setCookie signature is assignable to (url: string, cookie: Cookie) => Promise<void>', async () => {
  // Assignment to the canonical signature: if the spec drifts, this fails
  // at typecheck. The runtime check below ensures the file is executed.
  const fake = new FakeCookieStore()
  const fn: (url: string, cookie: Cookie) => Promise<void> =
    fake.setCookie.bind(fake)
  const result = fn('https://example.com', { name: 'sid', value: 'abc123' })
  assert.ok(
    result instanceof Promise,
    'the canonical (url: string, cookie: Cookie) => Promise<void> binding must return a Promise'
  )
  const awaited = await result
  assert.equal(
    awaited,
    undefined,
    'the canonical signature must resolve to undefined (Promise<void>)'
  )
})
