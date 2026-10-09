import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createShouldStartLoadBridge } from '../shouldStartLoadBridge.ts'
import { createOriginWhitelistGuard } from '../originWhitelist.ts'
import type { OnShouldStartLoadWithRequest } from '../originWhitelist.ts'
import type { ShouldStartLoadRequest } from '../specs/NitroWebView.nitro.ts'

const request: ShouldStartLoadRequest = {
  url: 'https://example.com/page',
  navigationType: 'click',
  isTopFrame: true,
  mainDocumentURL: 'https://example.com',
  hasTargetFrame: true,
}

describe('createShouldStartLoadBridge', () => {
  for (const value of [true, false]) {
    for (const async of [false, true]) {
      it(`forwards ${async ? 'async' : 'sync'} ${value} once with the original request`, async () => {
        let calls = 0
        const decisions: (boolean | undefined)[] = []
        const bridge = createShouldStartLoadBridge((event) => {
          calls += 1
          assert.equal(event, request)
          return async ? Promise.resolve(value) : value
        })
        await new Promise<void>((resolve) => {
          const result = bridge(request, {
            resolve(allow) {
              decisions.push(allow)
              resolve()
            },
          })
          assert.equal(result, undefined)
        })
        await setImmediate()
        assert.equal(calls, 1)
        assert.deepEqual(decisions, [value])
      })
    }
  }

  for (const failure of ['throw', 'reject']) {
    it(`reports undefined exactly once for a callback ${failure}`, async () => {
      const error = new Error('callback failed')
      const decisions: (boolean | undefined)[] = []
      const bridge = createShouldStartLoadBridge(() => {
        if (failure === 'throw') throw error
        return Promise.reject(error)
      })
      await new Promise<void>((resolve) => {
        bridge(request, {
          resolve(allow) {
            decisions.push(allow)
            resolve()
          },
        })
      })
      await setImmediate()
      assert.deepEqual(decisions, [undefined])
    })
  }

  it('keeps a pending JS Promise pending until it settles', async () => {
    let settle!: (value: boolean) => void
    const pending = new Promise<boolean>((resolve) => {
      settle = resolve
    })
    const decisions: (boolean | undefined)[] = []
    createShouldStartLoadBridge(() => pending)(request, {
      resolve(allow) {
        decisions.push(allow)
      },
    })
    await setImmediate()
    assert.deepEqual(decisions, [])
    settle(false)
    await setImmediate()
    assert.deepEqual(decisions, [false])
  })

  it('forwards an origin guard denial through the native resolver', async () => {
    const guard = createOriginWhitelistGuard(['https://allowed.example'])
    const allow = await new Promise<boolean | undefined>((resolve) => {
      createShouldStartLoadBridge(guard)(request, { resolve })
    })
    assert.equal(allow, false)
  })

  for (const value of [undefined, null, 0, 1, 'true', {}, []]) {
    it(`normalizes a runtime ${JSON.stringify(value)} result to undefined`, async () => {
      const handler = (() => value) as unknown as OnShouldStartLoadWithRequest
      const allow = await new Promise<boolean | undefined>((resolve) => {
        createShouldStartLoadBridge(handler)(request, { resolve })
      })
      assert.equal(allow, undefined)
    })
  }

  it('normalizes an invalid async result to undefined', async () => {
    const handler = (() =>
      Promise.resolve('false')) as unknown as OnShouldStartLoadWithRequest
    const allow = await new Promise<boolean | undefined>((resolve) => {
      createShouldStartLoadBridge(handler)(request, { resolve })
    })
    assert.equal(allow, undefined)
  })

  it('settles the native resolver once even when a thenable settles repeatedly', async () => {
    const handler = (() => ({
      then(resolve: (value: boolean) => void, reject: (error: Error) => void) {
        resolve(false)
        resolve(true)
        reject(new Error('late rejection'))
      },
    })) as unknown as OnShouldStartLoadWithRequest
    const decisions: (boolean | undefined)[] = []
    createShouldStartLoadBridge(handler)(request, {
      resolve(allow) {
        decisions.push(allow)
      },
    })
    await setImmediate()
    assert.deepEqual(decisions, [false])
  })
})
