import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'

import {
  buildPostMessageScript,
  encodeJsStringLiteral,
} from '../bridgeScript.ts'

const LS = ' '
const PS = ' '

const HOSTILE: string[] = [
  '',
  'plain',
  'has "double" and \'single\' quotes',
  'line1\nline2\ttab\r',
  '</script><script>alert(1)</script>', // must not break out
  '漢字 🎉 unicode',
  `sep${LS}here${PS}too`, // JSON.stringify leaves these RAW
  '{"nested":"json","n":42}',
  'back\\slash',
]

test('emitted postMessage statement round-trips every payload as event.data', () => {
  for (const platform of ['ios', 'android'] as const) {
    const target = platform === 'ios' ? 'window' : 'document'
    for (const payload of HOSTILE) {
      const stmt = buildPostMessageScript(platform, payload)

      // U+2028/U+2029 must be escaped (else pre-ES2019 engines SyntaxError).
      assert.ok(
        !stmt.includes(LS) && !stmt.includes(PS),
        `raw U+2028/U+2029 must not survive into the statement: ${JSON.stringify(payload)}`
      )

      // The statement must PARSE (Function ctor = same parse the engine does).
      assert.doesNotThrow(
        // eslint-disable-next-line no-new-func
        () => new Function(stmt),
        `emitted statement must be valid JS for ${JSON.stringify(payload)}`
      )

      // And it must DELIVER the payload verbatim as event.data.
      let received: unknown = null
      const sink = {
        dispatchEvent(e: { data: unknown }) {
          received = e.data
        },
      }
      const ctx = vm.createContext({
        window: platform === 'ios' ? sink : undefined,
        document: platform === 'android' ? sink : undefined,
        MessageEvent: class {
          type: string
          data: unknown
          constructor(type: string, init?: { data?: unknown }) {
            this.type = type
            this.data = init?.data
          }
        },
      })
      vm.runInContext(stmt, ctx)
      assert.equal(
        received,
        payload,
        `${target}.dispatchEvent must carry payload verbatim: ${JSON.stringify(payload)}`
      )
    }
  }
})

test('encodeJsStringLiteral returns a quoted literal and never emits raw LS/PS', () => {
  const enc = encodeJsStringLiteral(`a${LS}b${PS}c`)
  assert.ok(
    enc.startsWith('"') && enc.endsWith('"'),
    'must be a quoted JS literal'
  )
  assert.ok(
    enc.includes('\\u2028') && enc.includes('\\u2029'),
    'LS/PS must be escaped'
  )
  assert.ok(!enc.includes(LS) && !enc.includes(PS), 'no raw LS/PS')
})
