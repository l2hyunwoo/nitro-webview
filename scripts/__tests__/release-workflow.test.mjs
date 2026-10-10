import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'

const workflow = (name) =>
  parse(
    readFileSync(
      new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
      'utf8'
    )
  )
const release = workflow('release')
const ci = workflow('ci')
const required = [
  'validate',
  'test',
  'swift-test',
  'robolectric',
  'verify-release-candidate',
]

test('release notes include version documentation and retain commit and install details', () => {
  const step = release.jobs['create-github-release'].steps.find(
    (step) => step.id === 'notes'
  )
  for (const withDocument of [true, false]) {
    const cwd = mkdtempSync(join(tmpdir(), 'release-notes-'))
    try {
      const git = (...args) => execFileSync('git', args, { cwd })
      git('init', '--quiet')
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        'Initial release'
      )
      if (withDocument) git('tag', 'v0.1.0')
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        'Support the new architecture'
      )
      const document =
        '# 0.2.0\n\nRequires React Native 0.85.3.\n\nLiteral: $(touch injected)\n'
      if (withDocument) {
        mkdirSync(join(cwd, 'docs/releases'), { recursive: true })
        writeFileSync(join(cwd, 'docs/releases/0.2.0.md'), document)
      }
      const output = join(cwd, 'output')
      execFileSync('bash', ['-c', step.run], {
        cwd,
        env: {
          ...process.env,
          TMPDIR: cwd,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: 'owner/nitro-webview',
          TAG_NAME: 'v0.2.0',
          RESOLVED_VERSION: '0.2.0',
        },
      })
      const notesPath = readFileSync(output, 'utf8')
        .trim()
        .slice('notes_file='.length)
      const notes = readFileSync(notesPath, 'utf8')
      assert.equal(notes.startsWith(document), withDocument)
      assert.match(notes, /## What's Changed\n\n- Support the new architecture/)
      assert.match(notes, /yarn add nitro-webview@0\.2\.0/)
      assert.match(notes, /npm install nitro-webview@0\.2\.0/)
      assert.match(notes, /blob\/v0\.2\.0\/README\.md/)
      assert(
        notes.includes(
          withDocument ? '/compare/v0.1.0...v0.2.0' : '/commits/v0.2.0'
        )
      )
      assert.throws(() => readFileSync(join(cwd, 'injected')))
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  }
})

function assertReleaseGates(jobs) {
  const ancestors = (id) => {
    const needs = jobs[id].needs ?? []
    return new Set(
      [needs].flat().flatMap((parent) => [parent, ...ancestors(parent)])
    )
  }
  for (const id of [
    'create-version-tag',
    'publish-npm',
    'create-github-release',
  ]) {
    const dependencies = ancestors(id)
    for (const gate of required) {
      assert(dependencies.has(gate), `${id} must wait for ${gate}`)
    }
  }
  for (const id of [
    ...required,
    'create-version-commit',
    'create-version-tag',
    'publish-npm',
    'create-github-release',
  ]) {
    assert.equal(
      jobs[id].if,
      undefined,
      `${id} must require successful dependencies`
    )
    assert.equal(jobs[id]['continue-on-error'], undefined)
    for (const step of jobs[id].steps ?? []) {
      assert.equal(step['continue-on-error'], undefined)
    }
  }
  for (const id of ['validate', 'test', 'swift-test', 'robolectric']) {
    for (const step of jobs[id].steps) {
      assert(step.if === undefined || step.if === 'always()')
    }
  }
}

test('tagging and publication require every validation and packed native gate', () => {
  assertReleaseGates(release.jobs)
  for (const gate of ['swift-test', 'robolectric']) {
    const bypass = structuredClone(release.jobs)
    bypass['create-version-commit'].needs = bypass[
      'create-version-commit'
    ].needs.filter((id) => id !== gate)
    assert.throws(
      () => assertReleaseGates(bypass),
      new RegExp(`must wait for ${gate}`)
    )
  }
  const bypass = structuredClone(release.jobs)
  bypass['create-version-tag'].if = 'always()'
  assert.throws(
    () => assertReleaseGates(bypass),
    /must require successful dependencies/
  )
  assert.equal(
    release.jobs['verify-release-candidate'].uses,
    './.github/workflows/e2e.yml'
  )
  assert.equal(release.jobs['verify-release-candidate'].with.packed, true)
})

test('release uses the same bounded native checks as CI', () => {
  for (const [id, command] of [
    ['validate', 'java -Xmx256m -jar'],
    ['swift-test', 'swift test --jobs 2'],
    ['robolectric', './gradlew :nitro-webview:testDebugUnitTest'],
  ]) {
    const check = (jobs) =>
      jobs[id].steps.find((step) => step.run?.includes(command))
    assert(check(ci.jobs), `${id} must have its CI check`)
    assert.deepEqual(check(release.jobs), check(ci.jobs))
  }
})

test('CocoaPods uses the release v tag and advertises only implemented platforms', () => {
  const podspec = readFileSync(
    new URL('../../NitroWebview.podspec', import.meta.url),
    'utf8'
  )
  assert.match(podspec, /:tag\s*=>\s*"v#\{s\.version\}"/)
  assert.match(
    podspec,
    /s\.platforms\s*=\s*\{\s*:ios\s*=>\s*min_ios_version_supported\s*\}/
  )
})
