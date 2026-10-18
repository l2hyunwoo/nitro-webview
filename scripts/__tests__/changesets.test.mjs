import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../../', import.meta.url))
const release = parse(
  readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
)
const bump = release.jobs['create-version-commit'].steps.find(
  (step) => step.id === 'bump'
)
const notes = release.jobs['create-github-release'].steps.find(
  (step) => step.id === 'notes'
)

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'nitro-changesets-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const env = { ...process.env, CI: 'true', GITHUB_OUTPUT: join(cwd, 'output') }
  const run = (command, args) =>
    execFileSync(command, args, { cwd, env, encoding: 'utf8' })
  mkdirSync(join(cwd, '.changeset'))
  writeFileSync(
    join(cwd, '.changeset/config.json'),
    readFileSync(join(root, '.changeset/config.json'))
  )
  writeFileSync(
    join(cwd, '.yarnrc.yml'),
    `yarnPath: ${JSON.stringify(join(root, '.yarn/releases/yarn-4.15.0.cjs'))}\nnodeLinker: node-modules\n`
  )
  writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n.yarn/\noutput\n')
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify(
      {
        name: 'nitro-webview',
        version: '0.2.2',
        packageManager: 'yarn@4.15.0',
        scripts: {
          'version-packages': `node ${JSON.stringify(join(root, 'node_modules/@changesets/cli/bin.js'))} version`,
        },
      },
      null,
      2
    ) + '\n'
  )
  // The new fixture needs a lockfile before CI's immutable installs can run.
  run('yarn', ['install', '--no-immutable'])
  run('git', ['init', '-b', 'main'])
  run('git', ['config', 'user.name', 'Release test'])
  run('git', ['config', 'user.email', 'release@example.com'])
  const commit = () => {
    run('git', ['add', '.'])
    run('git', ['commit', '-m', 'Test fixture'])
  }
  commit()
  return { cwd, run, commit, env }
}

test('release refuses empty changesets without making a version commit', (t) => {
  const { cwd, run, commit, env } = fixture(t)
  writeFileSync(join(cwd, '.changeset/tooling.md'), '---\n---\n')
  commit()
  const before = run('git', ['rev-parse', 'HEAD'])
  const result = spawnSync('bash', ['-c', bump.run], {
    cwd,
    env,
    encoding: 'utf8',
  })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /No pending changesets/)
  assert.equal(run('git', ['rev-parse', 'HEAD']), before)
})

test('release consumes changesets, commits the changelog, and extracts only the new notes', (t) => {
  const { cwd, run, commit, env } = fixture(t)
  writeFileSync(
    join(cwd, '.changeset/fix.md'),
    '---\n"nitro-webview": patch\n---\n\nFix navigation callbacks.\n'
  )
  writeFileSync(
    join(cwd, 'CHANGELOG.md'),
    '# nitro-webview\n\n## 0.2.2\n\nOld release notes.\n'
  )
  commit()
  const result = spawnSync('bash', ['-c', bump.run], {
    cwd,
    env,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(
    JSON.parse(readFileSync(join(cwd, 'package.json'))).version,
    '0.2.3'
  )
  assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /version=0.2.3/)
  assert.match(
    run('git', ['show', 'HEAD:CHANGELOG.md']),
    /Fix navigation callbacks/
  )
  assert.equal(run('git', ['ls-files', '.changeset/fix.md']), '')
  assert.equal(run('git', ['status', '--porcelain']), '')
  const generated = spawnSync('bash', ['-c', notes.run], {
    cwd,
    encoding: 'utf8',
    env: {
      ...env,
      RESOLVED_VERSION: '0.2.3',
      TAG_NAME: 'v0.2.3',
      GITHUB_REPOSITORY: 'example/nitro-webview',
    },
  })
  assert.equal(generated.status, 0, generated.stderr)
  const notesPath = readFileSync(env.GITHUB_OUTPUT, 'utf8').match(
    /notes_file=(.+)/
  )[1]
  t.after(() => rmSync(notesPath, { force: true }))
  const body = readFileSync(notesPath, 'utf8')
  assert.match(body, /Fix navigation callbacks/)
  assert.doesNotMatch(body, /Old release notes/)
  assert.match(body, /npm install nitro-webview@0.2.3/)
})
