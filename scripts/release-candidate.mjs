import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args, cwd, capture = true, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`)
  return result.stdout?.trim()
}

function integrity(path) {
  return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`
}

export function readCandidate(directory, expectedSha) {
  assert.match(
    expectedSha,
    /^[a-f0-9]{40}$/,
    'Expected a full source commit SHA'
  )
  const metadata = JSON.parse(
    readFileSync(join(directory, 'candidate.json'), 'utf8')
  )
  assert.equal(
    metadata.source_sha,
    expectedSha,
    'Candidate source SHA mismatch'
  )
  assert.match(metadata.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/)
  assert.equal(metadata.filename, `nitro-webview-${metadata.version}.tgz`)
  assert.equal(
    integrity(join(directory, metadata.filename)),
    metadata.integrity,
    'Candidate tarball integrity mismatch'
  )
  return metadata
}

export function createCandidate(repository, directory) {
  assert.equal(
    run('git', ['status', '--porcelain', '--untracked-files=all'], repository),
    '',
    'Release source must match the committed files'
  )
  mkdirSync(directory, { recursive: true })
  const sourceSha = run('git', ['rev-parse', 'HEAD'], repository)
  const manifest = JSON.parse(
    readFileSync(join(repository, 'package.json'), 'utf8')
  )
  const [packed] = JSON.parse(
    run(
      npm,
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        resolve(directory),
      ],
      repository
    )
  )
  assert.equal(packed.name, 'nitro-webview')
  assert.equal(packed.version, manifest.version)
  const metadata = {
    source_sha: sourceSha,
    version: packed.version,
    filename: packed.filename,
    integrity: packed.integrity,
  }
  writeFileSync(
    join(directory, 'candidate.json'),
    `${JSON.stringify(metadata, null, 2)}\n`
  )
  run(
    'git',
    ['bundle', 'create', resolve(directory, 'source.bundle'), 'HEAD'],
    repository
  )
  return readCandidate(directory, sourceSha)
}

function assertSource(repository, metadata) {
  assert.equal(
    run('git', ['rev-parse', 'HEAD'], repository),
    metadata.source_sha,
    'Checkout must match the candidate source SHA'
  )
  const manifest = JSON.parse(
    readFileSync(join(repository, 'package.json'), 'utf8')
  )
  assert.equal(manifest.version, metadata.version, 'Candidate version mismatch')
}

export function restoreCandidate(repository, directory, expectedSha) {
  const metadata = readCandidate(directory, expectedSha)
  const bundle = resolve(directory, 'source.bundle')
  run('git', ['bundle', 'verify', bundle], repository)
  run('git', ['fetch', bundle, 'HEAD'], repository)
  run('git', ['checkout', '--detach', expectedSha], repository)
  assertSource(repository, metadata)
  return metadata
}

function assertInside(directory, path) {
  const subpath = relative(realpathSync(directory), realpathSync(path))
  assert(
    subpath !== '..' &&
      !subpath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
      !isAbsolute(subpath),
    `Native path must use the installed archive: ${path}`
  )
}

export function assertInstalled(example, metadata, config, platform) {
  assert(['android', 'ios'].includes(platform), 'Expected android or ios')
  const installed = join(example, 'node_modules/nitro-webview')
  assert(
    lstatSync(installed).isDirectory(),
    'Packed dependency must be a real directory'
  )
  const manifest = JSON.parse(
    readFileSync(join(installed, 'package.json'), 'utf8')
  )
  assert.equal(
    manifest.version,
    metadata.version,
    'Installed candidate version mismatch'
  )
  const dependency = config.dependencies?.['nitro-webview']
  assert(dependency?.root, 'React Native CLI did not find nitro-webview')
  assert.equal(
    realpathSync(dependency.root),
    realpathSync(installed),
    'React Native CLI must use the installed archive'
  )
  const native = dependency.platforms?.[platform]
  const nativePath =
    platform === 'android' ? native?.sourceDir : native?.podspecPath
  assert(nativePath, `React Native CLI did not configure ${platform}`)
  assertInside(installed, nativePath)
  return {
    dependency_root: realpathSync(installed),
    native_path: realpathSync(nativePath),
  }
}

export function installCandidate(repository, directory, expectedSha, platform) {
  const metadata = readCandidate(directory, expectedSha)
  assertSource(repository, metadata)
  const example = join(repository, 'example')
  run(
    process.execPath,
    [
      join(repository, '.yarn/releases/yarn-4.15.0.cjs'),
      'add',
      `nitro-webview@file:${resolve(directory, metadata.filename)}`,
    ],
    example,
    false,
    { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' }
  )
  const config = JSON.parse(
    run(
      process.execPath,
      [join(example, 'node_modules/react-native/cli.js'), 'config'],
      example
    )
  )
  const native = assertInstalled(example, metadata, config, platform)
  const artifacts = join(example, 'artifacts')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(
    join(artifacts, 'release-candidate.json'),
    `${JSON.stringify({ ...metadata, platform, ...native }, null, 2)}\n`
  )
  return metadata
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, directory, expectedSha, platform] = process.argv.slice(2)
  assert(
    directory,
    'Usage: release-candidate.mjs <create|restore|install> <directory> [sha] [platform]'
  )
  let metadata
  if (command === 'create') metadata = createCandidate(root, directory)
  else if (command === 'restore')
    metadata = restoreCandidate(root, directory, expectedSha)
  else if (command === 'install')
    metadata = installCandidate(root, directory, expectedSha, platform)
  else throw new Error(`Unknown candidate command: ${command}`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `tarball=${resolve(directory, metadata.filename)}\nintegrity=${metadata.integrity}\n`
    )
  }
  console.log(JSON.stringify(metadata, null, 2))
}
