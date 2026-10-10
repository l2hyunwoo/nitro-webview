import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('packed iOS gate requires explicit core coverage and a bounded Release run', () => {
  const e2e = workflow('e2e')
  assert.equal(e2e.on.workflow_call.inputs.ios_profile.default, 'ios-core')
  const ios = e2e.jobs['e2e-ios']
  assert.match(ios.env.CONFIGURATION, /'Debug' \|\| 'Release'/)
  const build = ios.steps.find(
    (step) => step.name === 'Build app for simulator'
  )
  const boot = ios.steps.find(
    (step) => step.name === 'Create and boot dedicated simulator'
  )
  assert(ios.steps.indexOf(build) < ios.steps.indexOf(boot))
  assert.match(build.run, /generic\/platform=iOS Simulator/)
  assert.equal(boot['timeout-minutes'], 4)
  const install = ios.steps.find(step => step.name === 'Install app on simulator')
  assert.equal(install['timeout-minutes'], 3)
  assert.match(install.run, /timeout: 120000/)
  assert(!ios.steps.some((step) => step.run?.includes('list devices')))
  assert(ios.steps.some((step) => step.run?.includes('"$IOS_PROFILE"')))
  const gate = e2e.jobs['packed-release-gate'].steps.find(
    (step) =>
      step.name === 'Require exact source, archive, and scenario coverage'
  )
  assert.match(gate.env.IOS_PROFILE, /ios-core/)
  assert.match(
    gate.run,
    /platform === 'ios' \? process.env.IOS_PROFILE : 'full'/
  )
})
