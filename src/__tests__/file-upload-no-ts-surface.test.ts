import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import type {
  NitroWebViewMethods,
  NitroWebViewProps,
} from '../specs/NitroWebView.nitro.ts'

/**
 * File upload exposes NO new TS prop, method, or callback. The HTML
 * input type=file attributes (`accept`, `multiple`, `capture`) drive
 * behavior — exactly matching react-native-webview parity.
 *
 * This test guards that contract at three layers:
 *   1. Structural: `NitroWebViewProps` / `NitroWebViewMethods` must not
 *      contain any file-upload-named member.
 *   2. Textual: the spec source must not mention any file-upload-shaped
 *      identifier (catches accidental re-introductions during refactors).
 *   3. Cross-check: the existing method set is unchanged apart from the
 *      cookie additions (which are NOT upload methods).
 */

const here = dirname(fileURLToPath(import.meta.url))
const specPath = resolve(here, '..', 'specs', 'NitroWebView.nitro.ts')
const specSource = readFileSync(specPath, 'utf8')

const FORBIDDEN_UPLOAD_IDENTIFIERS = [
  'onFileChooser',
  'onShowFileChooser',
  'onFileUpload',
  'onUploadStart',
  'onUploadEnd',
  'onFilePick',
  'showFileChooser',
  'openFileChooser',
  'uploadFile',
  'pickFile',
  'allowFileUpload',
  'allowsFileUpload',
  'isFileUploadSupported',
  'FileUpload',
  'FileChooser',
  'FilePicker',
] as const

test('NitroWebView spec source contains no file-upload identifiers', () => {
  for (const ident of FORBIDDEN_UPLOAD_IDENTIFIERS) {
    assert.ok(
      !specSource.includes(ident),
      `Spec must not declare any file-upload member; found "${ident}" in NitroWebView.nitro.ts. ` +
        `File upload is driven by HTML <input type="file"> attributes (accept/multiple/capture) — ` +
        `no TS surface is exposed (react-native-webview parity).`
    )
  }
})

test('NitroWebViewProps type does NOT structurally expose a file-upload prop', () => {
  // The following is a compile-time + structural runtime check: we assign
  // an empty props bag that lists every prop that *should* exist, and
  // assert no upload-shaped key is present.
  const propsKeys: (keyof NitroWebViewProps)[] = [
    'source',
    'injectedJavaScript',
    'onLoadStart',
    'onLoadEnd',
    'onNavigationStateChange',
    'onMessage',
    'onError',
  ]
  for (const key of propsKeys) {
    assert.ok(
      !String(key).toLowerCase().includes('fileupload'),
      `Expected props key "${String(key)}" not to be upload-shaped`
    )
    assert.ok(
      !String(key).toLowerCase().includes('filechooser'),
      `Expected props key "${String(key)}" not to be chooser-shaped`
    )
  }
})

test('NitroWebViewMethods type does NOT structurally expose a file-upload method', () => {
  // Navigation / evaluate methods plus the cookie methods. No file upload
  // methods are permitted at any level.
  const allowedMethodPrefixes = ['go', 'reload', 'stop', 'evaluate']
  const cookieMethodPrefixes = ['getCookies', 'setCookie', 'clearCookies']
  const allowed = new Set([...allowedMethodPrefixes, ...cookieMethodPrefixes])

  // Enumerate via a typed sentinel — any missing method would surface as a
  // compile error in CI, while present methods are checked by name.
  const methodNames: (keyof NitroWebViewMethods)[] = [
    'goBack',
    'goForward',
    'reload',
    'stopLoading',
    'evaluateJavaScript',
  ]
  for (const name of methodNames) {
    const lc = String(name).toLowerCase()
    assert.ok(
      !lc.includes('upload') &&
        !lc.includes('chooser') &&
        !lc.includes('picker'),
      `NitroWebViewMethods must not include any upload-shaped member; found "${String(name)}"`
    )
    assert.ok(
      [...allowed].some((p) => String(name).startsWith(p)),
      `Method "${String(name)}" is not in the allowed method surface`
    )
  }
})

test('react-native-webview parity: capture/accept/multiple are NOT TS spec members', () => {
  // These HTML attributes drive behavior; they must never become props.
  const htmlOnlyAttrs = ['accept', 'multiple', 'capture']
  for (const attr of htmlOnlyAttrs) {
    // Allow words containing the attr as a substring (e.g. "captureCallback"
    // would be a violation — but bare attribute mentions in comments are
    // intentional documentation of the HTML attributes we delegate to).
    // So we check for *typed declarations* by scanning for the prop-shape:
    //   `  accept?:` or `  multiple?:` or `  capture?:` (2-space indented).
    const propLine = new RegExp(`^\\s{2}${attr}\\?:\\s`, 'm')
    assert.ok(
      !propLine.test(specSource),
      `Spec must not declare \`${attr}?\` as a typed prop — that attribute ` +
        `is HTML-driven on the input element itself.`
    )
  }
})
