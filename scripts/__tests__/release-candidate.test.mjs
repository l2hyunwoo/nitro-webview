import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assertInstalled,
  createCandidate,
  readCandidate,
  restoreCandidate,
} from '../release-candidate.mjs'

test('candidate bundle restores an unpushed version commit and verifies its exact archive', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'nitro-release-candidate-test-'))
  const repository = join(temporary, 'source')
  const checkout = join(temporary, 'checkout')
  const artifact = join(temporary, 'artifact')
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  const manifest = (version) =>
    JSON.stringify({ name: 'nitro-webview', version, files: ['index.js'] })
  const metadataPath = join(artifact, 'candidate.json')
  try {
    mkdirSync(repository)
    git('init', '--quiet')
    git('config', 'user.name', 'Candidate test')
    git('config', 'user.email', 'candidate@example.invalid')
    writeFileSync(join(repository, 'package.json'), manifest('0.1.0'))
    writeFileSync(join(repository, 'index.js'), 'export const version = 1\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'initial')
    execFileSync('git', [
      'clone',
      '--quiet',
      '--no-local',
      repository,
      checkout,
    ])

    writeFileSync(join(repository, 'package.json'), manifest('0.2.0'))
    git('add', 'package.json')
    git('commit', '--quiet', '-m', 'version')
    const sha = git('rev-parse', 'HEAD')
    const untracked = join(repository, 'index-extra.js')
    writeFileSync(untracked, 'export const extra = true\n')
    assert.throws(
      () => createCandidate(repository, artifact),
      /Release source must match the committed files/
    )
    rmSync(untracked)
    const metadata = createCandidate(repository, artifact)
    assert.equal(metadata.source_sha, sha)
    assert.equal(metadata.version, '0.2.0')
    assert.throws(() =>
      execFileSync('git', ['cat-file', '-e', sha], {
        cwd: checkout,
        stdio: 'pipe',
      })
    )
    assert.deepEqual(restoreCandidate(checkout, artifact, sha), metadata)
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: checkout,
        encoding: 'utf8',
      }).trim(),
      sha
    )
    assert.equal(
      JSON.parse(readFileSync(join(checkout, 'package.json'))).version,
      '0.2.0'
    )

    assert.throws(
      () => readCandidate(artifact, '0'.repeat(40)),
      /source SHA mismatch/
    )
    const tarball = join(artifact, metadata.filename)
    const bytes = readFileSync(tarball)
    writeFileSync(tarball, 'changed archive')
    assert.throws(() => readCandidate(artifact, sha), /integrity mismatch/)
    writeFileSync(tarball, bytes)
    writeFileSync(
      metadataPath,
      JSON.stringify({ ...metadata, filename: '../escape.tgz' })
    )
    assert.throws(() => readCandidate(artifact, sha))
    writeFileSync(metadataPath, JSON.stringify(metadata))

    const example = join(temporary, 'example')
    const installed = join(example, 'node_modules/nitro-webview')
    mkdirSync(join(installed, 'android'), { recursive: true })
    writeFileSync(join(installed, 'package.json'), manifest('0.2.0'))
    writeFileSync(join(installed, 'NitroWebview.podspec'), '# fixture\n')
    const config = (root) => ({
      dependencies: {
        'nitro-webview': {
          root,
          platforms: {
            android: { sourceDir: join(installed, 'android') },
            ios: { podspecPath: join(installed, 'NitroWebview.podspec') },
          },
        },
      },
    })
    assertInstalled(example, metadata, config(installed), 'android')
    assertInstalled(example, metadata, config(installed), 'ios')
    assert.throws(
      () => assertInstalled(example, metadata, config(repository), 'android'),
      /installed archive/
    )
    const outside = config(installed)
    outside.dependencies['nitro-webview'].platforms.android.sourceDir =
      repository
    assert.throws(
      () => assertInstalled(example, metadata, outside, 'android'),
      /installed archive/
    )
    rmSync(installed, { recursive: true })
    symlinkSync(repository, installed, 'dir')
    assert.throws(
      () => assertInstalled(example, metadata, config(installed), 'android'),
      /real directory/
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
