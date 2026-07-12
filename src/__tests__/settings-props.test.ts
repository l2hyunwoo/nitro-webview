/**
 * Settings-props prop-contract tests.
 *
 * The 12 settings props are all OPTIONAL `boolean` toggles on
 * `NitroWebViewProps`. Because nitrogen codegens an optional `boolean?`
 * prop as a nullable native field (`Boolean?` / `Bool?`), `undefined` means
 * "leave the platform default untouched" on both platforms - the native
 * setter never fires. These tests pin that contract at the type level so a
 * future refactor that makes any prop required, non-boolean, or drops it
 * fails typecheck / the test run.
 *
 * The suite follows the existing node:test convention used by every other
 * test under `src/__tests__/`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import type { NitroWebViewProps } from '../specs/NitroWebView.nitro.ts'

/** The 12 settings props added in the settings-props feature group. */
const SETTINGS_PROPS = [
  'javaScriptEnabled',
  'domStorageEnabled',
  'cacheEnabled',
  'incognito',
  'scrollEnabled',
  'bounces',
  'scalesPageToFit',
  'mediaPlaybackRequiresUserAction',
  'allowsInlineMediaPlayback',
  'allowsBackForwardNavigationGestures',
  'thirdPartyCookiesEnabled',
  'sharedCookiesEnabled',
] as const

test('omitting every settings prop is not a type error', () => {
  // Compile-time pin: a WebView with only `source` must type-check. If any
  // settings prop became required this assignment would fail typecheck.
  const props: NitroWebViewProps = {
    source: { uri: 'https://example.com' },
  }
  for (const key of SETTINGS_PROPS) {
    assert.equal(props[key], undefined)
  }
})

test('every settings prop accepts an explicit boolean value', () => {
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
    sharedCookiesEnabled: true,
  }

  assert.equal(props.cacheEnabled, false)
  assert.equal(props.incognito, true)
  assert.equal(props.scrollEnabled, false)
  assert.equal(props.sharedCookiesEnabled, true)
})

test('a settings prop may also be explicitly undefined (tri-state)', () => {
  // Compile-time pin: `boolean | undefined` - passing `undefined`
  // explicitly is the same as omitting it (native setter never fires).
  const props: NitroWebViewProps = {
    source: { uri: 'https://example.com' },
    incognito: undefined,
    cacheEnabled: undefined,
  }
  assert.equal(props.incognito, undefined)
  assert.equal(props.cacheEnabled, undefined)
})

test('each settings prop is typed boolean | undefined (not a wider type)', () => {
  // Runtime-side of the compile-time pin above: assigning a boolean and an
  // omission must both be observable. Non-boolean values (string / number)
  // would fail typecheck at the assignment site, which `tsc --noEmit`
  // enforces in CI.
  for (const key of SETTINGS_PROPS) {
    const enabled: NitroWebViewProps = {
      source: { uri: 'https://example.com' },
      [key]: true,
    }
    const disabled: NitroWebViewProps = {
      source: { uri: 'https://example.com' },
      [key]: false,
    }
    assert.equal(enabled[key], true)
    assert.equal(disabled[key], false)
  }
})
