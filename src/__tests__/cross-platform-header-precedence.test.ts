import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mergeHeaders } from '../headerMerge.ts'
import type { NitroWebViewProps } from '../index'
import type { UriSource } from '../specs/WebViewSource'

it('the native header contract uses one case-insensitive map on both platforms', () => {
  const props: Pick<NitroWebViewProps, 'source' | 'defaultHeaders'> = {
    defaultHeaders: {
      'Authorization': 'default',
      'X-Trace': 'old',
      'User-Agent': 'nitro',
    },
    source: {
      uri: 'https://example.com',
      headers: {
        'authorization': 'request',
        'x-trace': 'new',
        'X-Custom': 'extra',
      },
    },
  }
  assert.deepEqual(
    mergeHeaders(props.defaultHeaders, (props.source as UriSource).headers),
    {
      'User-Agent': 'nitro',
      'authorization': 'request',
      'x-trace': 'new',
      'X-Custom': 'extra',
    }
  )
})
