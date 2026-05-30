import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createLoadEndDispatcher,
  type NativeLoadEndPayload,
} from '../events.ts'
import type {
  NitroWebViewMethods,
  WebViewNavigationState,
} from '../specs/NitroWebView.nitro.ts'

interface HybridRefContainer {
  current: NitroWebViewMethods | null
}

function createHybridRef(): HybridRefContainer {
  return { current: null }
}

/**
 * JS-side test double for the native HybridView boundary. Models the
 * back-forward history stack that both WKWebView and android.webkit.WebView
 * implement: a list of entries plus a current-index cursor. New loads
 * truncate any forward entries; `goBack` / `goForward` move the cursor and
 * are no-ops at the ends.
 */
class FakeNavigableWebView implements NitroWebViewMethods {
  private readonly dispatchLoadEnd: (payload: NativeLoadEndPayload) => void

  private nextNavigationId = 1

  private readonly history: string[] = []
  private cursor = -1

  constructor(opts: {
    onLoadEnd: (event: { nativeEvent: WebViewNavigationState }) => void
  }) {
    this.dispatchLoadEnd = createLoadEndDispatcher(opts.onLoadEnd)
  }

  goBack(): void {
    if (this.cursor <= 0) {
      return
    }
    this.cursor -= 1
    this.emitLoadEnd()
  }

  goForward(): void {
    if (this.cursor < 0 || this.cursor >= this.history.length - 1) {
      return
    }
    this.cursor += 1
    this.emitLoadEnd()
  }

  reload(): void {
    /* no-op */
  }
  stopLoading(): void {
    /* no-op */
  }
  evaluateJavaScript(_code: string): Promise<string> {
    return Promise.resolve('')
  }

  /**
   * Append `url` to the history stack (truncating any forward entries),
   * advance the cursor, and fire `onLoadEnd` through the production
   * dispatcher so the caller observes the transition.
   */
  simulateLoad(url: string): void {
    // Canonical browser-history rule: a new load past the cursor truncates
    // any forward entries.
    if (this.cursor + 1 < this.history.length) {
      this.history.length = this.cursor + 1
    }
    this.history.push(url)
    this.cursor = this.history.length - 1
    this.emitLoadEnd()
  }

  currentUrl(): string | null {
    if (this.cursor < 0) return null
    return this.history[this.cursor] ?? null
  }

  canGoBack(): boolean {
    return this.cursor > 0
  }

  canGoForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.history.length - 1
  }

  private emitLoadEnd(): void {
    const url = this.history[this.cursor] ?? ''
    const navigationId = this.nextNavigationId++
    const payload: NativeLoadEndPayload = {
      navigationId,
      outcome: 'success',
      url,
      title: '',
      loading: false,
      canGoBack: this.canGoBack(),
      canGoForward: this.canGoForward(),
    }
    // Microtask hop mirrors native asynchrony.
    queueMicrotask(() => this.dispatchLoadEnd(payload))
  }
}

/**
 * Spin the microtask queue until `predicate` is true OR `maxTicks` is
 * exhausted. The fake fires `onLoadEnd` on a microtask hop; a single
 * `await Promise.resolve()` only drains one microtask.
 */
async function flushMicrotasks(
  predicate: () => boolean,
  maxTicks: number = 16
): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return
    await Promise.resolve()
  }
}

test('load two URLs, then goBack rewinds the current URL to the first', async () => {
  const hybridRef = createHybridRef()
  const onLoadEndUrls: string[] = []

  const view = new FakeNavigableWebView({
    onLoadEnd: (event) => onLoadEndUrls.push(event.nativeEvent.url),
  })
  hybridRef.current = view

  assert.ok(hybridRef.current, 'hybridRef.current must be bound before use')
  assert.equal(
    typeof hybridRef.current.goBack,
    'function',
    'hybridRef.current.goBack must be a function'
  )
  assert.equal(
    typeof hybridRef.current.goForward,
    'function',
    'hybridRef.current.goForward must be a function'
  )

  view.simulateLoad('https://example.com/a')
  await flushMicrotasks(() => onLoadEndUrls.length >= 1)
  assert.equal(onLoadEndUrls.length, 1)
  assert.equal(onLoadEndUrls[0], 'https://example.com/a')

  view.simulateLoad('https://example.com/b')
  await flushMicrotasks(() => onLoadEndUrls.length >= 2)
  assert.equal(onLoadEndUrls.length, 2)
  assert.equal(onLoadEndUrls[1], 'https://example.com/b')
  assert.equal(
    view.currentUrl(),
    'https://example.com/b',
    'after loading two URLs the current entry must be the second'
  )

  const returned = hybridRef.current.goBack()

  assert.equal(
    returned,
    undefined,
    'goBack() must return void (sync fire-and-forget)'
  )

  await flushMicrotasks(() => onLoadEndUrls.length >= 3)
  assert.equal(
    onLoadEndUrls.length,
    3,
    'goBack must trigger exactly one onLoadEnd for the rewound entry'
  )
  assert.equal(
    onLoadEndUrls[2],
    'https://example.com/a',
    'after goBack() the observable current URL must be the previous entry'
  )
  assert.equal(
    view.currentUrl(),
    'https://example.com/a',
    'history cursor must agree with the observed onLoadEnd URL after goBack'
  )
})

test('after goBack, goForward re-advances the current URL to the second entry', async () => {
  const hybridRef = createHybridRef()
  const onLoadEndUrls: string[] = []

  const view = new FakeNavigableWebView({
    onLoadEnd: (event) => onLoadEndUrls.push(event.nativeEvent.url),
  })
  hybridRef.current = view

  view.simulateLoad('https://example.com/a')
  view.simulateLoad('https://example.com/b')
  await flushMicrotasks(() => onLoadEndUrls.length >= 2)

  hybridRef.current.goBack()
  await flushMicrotasks(() => onLoadEndUrls.length >= 3)
  assert.equal(onLoadEndUrls[2], 'https://example.com/a')

  const returned = hybridRef.current.goForward()
  assert.equal(
    returned,
    undefined,
    'goForward() must return void (sync fire-and-forget)'
  )

  await flushMicrotasks(() => onLoadEndUrls.length >= 4)
  assert.equal(
    onLoadEndUrls.length,
    4,
    'goForward must trigger exactly one onLoadEnd for the re-advanced entry'
  )
  assert.equal(
    onLoadEndUrls[3],
    'https://example.com/b',
    'after goForward() the observable current URL must be the next entry'
  )
  assert.equal(view.currentUrl(), 'https://example.com/b')
})

test('goBack() at the first entry is a no-op (matches canGoBack=false)', async () => {
  // Both platforms silently no-op when canGoBack is false; the JS-side
  // contract follows. Pinning this prevents a future refactor from emitting
  // a synthetic re-load on the no-op branch.
  const hybridRef = createHybridRef()
  const onLoadEndUrls: string[] = []

  const view = new FakeNavigableWebView({
    onLoadEnd: (event) => onLoadEndUrls.push(event.nativeEvent.url),
  })
  hybridRef.current = view

  view.simulateLoad('https://example.com/a')
  await flushMicrotasks(() => onLoadEndUrls.length >= 1)
  assert.equal(view.canGoBack(), false)

  hybridRef.current.goBack()
  await flushMicrotasks(() => false, 4)
  assert.equal(
    onLoadEndUrls.length,
    1,
    'goBack at the first entry must NOT trigger an onLoadEnd (no-op contract)'
  )
  assert.equal(view.currentUrl(), 'https://example.com/a')
})

test('goForward() at the last entry is a no-op (matches canGoForward=false)', async () => {
  const hybridRef = createHybridRef()
  const onLoadEndUrls: string[] = []

  const view = new FakeNavigableWebView({
    onLoadEnd: (event) => onLoadEndUrls.push(event.nativeEvent.url),
  })
  hybridRef.current = view

  view.simulateLoad('https://example.com/a')
  view.simulateLoad('https://example.com/b')
  await flushMicrotasks(() => onLoadEndUrls.length >= 2)
  assert.equal(view.canGoForward(), false)

  hybridRef.current.goForward()
  await flushMicrotasks(() => false, 4)
  assert.equal(
    onLoadEndUrls.length,
    2,
    'goForward at the leaf must NOT trigger an onLoadEnd (no-op contract)'
  )
  assert.equal(view.currentUrl(), 'https://example.com/b')
})

test('loading a new URL after goBack truncates the forward stack', async () => {
  const hybridRef = createHybridRef()
  const onLoadEndUrls: string[] = []

  const view = new FakeNavigableWebView({
    onLoadEnd: (event) => onLoadEndUrls.push(event.nativeEvent.url),
  })
  hybridRef.current = view

  view.simulateLoad('https://example.com/a')
  view.simulateLoad('https://example.com/b')
  await flushMicrotasks(() => onLoadEndUrls.length >= 2)

  hybridRef.current.goBack() // now at A, with B in the forward stack
  await flushMicrotasks(() => onLoadEndUrls.length >= 3)
  assert.equal(view.canGoForward(), true)

  // New load must truncate the forward stack.
  view.simulateLoad('https://example.com/c')
  await flushMicrotasks(() => onLoadEndUrls.length >= 4)
  assert.equal(view.currentUrl(), 'https://example.com/c')
  assert.equal(
    view.canGoForward(),
    false,
    'loading a new URL after goBack must truncate forward entries'
  )

  hybridRef.current.goForward()
  await flushMicrotasks(() => false, 4)
  assert.equal(
    onLoadEndUrls.length,
    4,
    'goForward after a fresh load that truncated the forward stack must be a no-op'
  )
})
