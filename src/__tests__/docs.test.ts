import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Docs-lint test for the iOS File Upload setup section.
 *
 * Asserts that README.md contains a dedicated section whose header matches
 * /file upload/i, and that the three required Info.plist usage-description
 * keys appear within that section:
 *
 *   - NSCameraUsageDescription
 *   - NSPhotoLibraryUsageDescription
 *   - NSMicrophoneUsageDescription
 *
 * This is a documentation contract test, not a runtime test — but it runs
 * under the same `node --test "src/**\/*.test.ts"` pipeline as the rest of
 * the suite to guarantee CI catches accidental removal of the iOS-specific
 * setup guidance.
 */

const here = dirname(fileURLToPath(import.meta.url))
// __tests__ lives at src/__tests__/, so the repo root is two levels up.
const repoRoot = resolve(here, '..', '..')
const readmePath = resolve(repoRoot, 'README.md')
const readmeSource = readFileSync(readmePath, 'utf8')

const REQUIRED_INFO_PLIST_KEYS = [
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSMicrophoneUsageDescription',
] as const

/**
 * Find the body of the first section whose Markdown header text matches
 * the given pattern. Returns the substring spanning from the matched
 * header up to (but not including) the next header of the same OR
 * shallower depth — or to EOF if no such header exists.
 *
 * Supports `#`, `##`, `###`, `####`, `#####`, `######` headers.
 */
function findSectionBody(
  markdown: string,
  headerPattern: RegExp
): string | null {
  const lines = markdown.split('\n')
  let startIdx = -1
  let startDepth = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const headerMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!headerMatch) continue
    const depth = (headerMatch[1] ?? '').length
    const text = headerMatch[2] ?? ''
    if (headerPattern.test(text)) {
      startIdx = i
      startDepth = depth
      break
    }
  }
  if (startIdx === -1) return null

  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const headerMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!headerMatch) continue
    const depth = (headerMatch[1] ?? '').length
    if (depth <= startDepth) {
      endIdx = i
      break
    }
  }

  return lines.slice(startIdx, endIdx).join('\n')
}

test('README.md exposes a dedicated section header matching /file upload/i', () => {
  const body = findSectionBody(readmeSource, /file upload/i)
  assert.ok(
    body !== null,
    'README.md must contain a Markdown header (#, ##, etc.) whose text ' +
      'matches /file upload/i so that consumers can find iOS setup instructions.'
  )
})

test('README.md "file upload" section lists all three required Info.plist keys', () => {
  const body = findSectionBody(readmeSource, /file upload/i)
  assert.ok(
    body !== null,
    'precondition: a section matching /file upload/i must exist'
  )
  const section = body as string

  for (const key of REQUIRED_INFO_PLIST_KEYS) {
    assert.ok(
      section.includes(key),
      `Required Info.plist key "${key}" must appear inside the README ` +
        `section whose header matches /file upload/i. Without this key the ` +
        `iOS file picker will crash the consuming app the first time the ` +
        `underlying subsystem (camera / photo library / microphone) is ` +
        `accessed.`
    )
  }
})

test('README.md "file upload" section is iOS-scoped (mentions iOS explicitly)', () => {
  // Soft check — the section should make clear these keys are iOS-only so
  // consumers don't try to add them to Android.
  const body = findSectionBody(readmeSource, /file upload/i)
  assert.ok(body !== null)
  const section = body as string
  assert.ok(
    /ios/i.test(section),
    'The file-upload README section must mention iOS so consumers know ' +
      'the Info.plist keys are platform-specific.'
  )
})
