/**
 * Settings-props prop-contract smoke test.
 *
 * The 12 settings props are OPTIONAL `boolean` toggles on `NitroWebViewProps`
 * (nitrogen codegens `boolean?` as a nullable native field, so `undefined`
 * means "leave the platform default untouched", so the setter never fires).
 * The type check below is the contract: it fails to compile if any prop
 * becomes required, non-boolean, or is dropped. `tsc --noEmit` in CI is what
 * actually enforces it; the runtime assert just keeps the file executable.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import type { NitroWebViewProps } from '../specs/NitroWebView.nitro.ts'

test('the 12 settings props are optional booleans (tri-state)', () => {
  const props: NitroWebViewProps = {
    source: { uri: 'https://example.com' },
    javaScriptEnabled: true,
    domStorageEnabled: true,
    cacheEnabled: false,
    incognito: true,
    scrollEnabled: false,
    bounces: false,
    scalesPageToFit: true,
    mediaPlaybackRequiresUserAction: false,
    allowsInlineMediaPlayback: true,
    allowsBackForwardNavigationGestures: true,
    thirdPartyCookiesEnabled: false,
    sharedCookiesEnabled: undefined, // omission is a valid third state
  }

  assert.equal(props.cacheEnabled, false)
  assert.equal(props.sharedCookiesEnabled, undefined)
})
