import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// __tests__ lives at src/__tests__/, so the repo root is two levels up.
const repoRoot = resolve(here, '..', '..')

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

test('README links to the official upload setup guide', () => {
  const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')
  assert.ok(
    readme.includes(
      '](https://l2hyunwoo.github.io/nitro-webview/guides/downloads.html)'
    )
  )
})

for (const [locale, heading] of [
  ['', /file inputs/i],
  ['ko/', /파일 입력/],
] as const) {
  test(`${locale}upload guide documents iOS usage descriptions`, () => {
    const markdown = readFileSync(
      resolve(repoRoot, `website/content/${locale}guides/downloads.md`),
      'utf8'
    )
    const section = findSectionBody(markdown, heading)
    assert.ok(section, 'The upload guide must contain a file-input section.')
    assert.match(section, /ios/i, 'Usage descriptions must be scoped to iOS.')
    for (const key of REQUIRED_INFO_PLIST_KEYS) {
      assert.ok(
        section.includes(key),
        `The iOS file-input setup must document ${key}.`
      )
    }
  })
}
