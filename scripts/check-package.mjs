import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const requiredFiles = [
  'package.json',
  'lib/index.js',
  'lib/index.d.ts',
  'src/index.ts',
  'nitro.json',
  'react-native.config.js',
  'NitroWebview.podspec',
  'ios/HybridNitroWebView.swift',
  'android/build.gradle',
  'android/CMakeLists.txt',
  'android/src/main/AndroidManifest.xml',
  'android/src/main/res/xml/file_provider_paths.xml',
  'android/src/main/java/io/github/l2hyunwoo/nitro/webview/HybridNitroWebView.kt',
  'nitrogen/generated/shared/json/NitroWebViewConfig.json',
  'nitrogen/generated/shared/c++/HybridNitroWebViewSpec.cpp',
  'nitrogen/generated/android/NitroWebview+autolinking.gradle',
  'nitrogen/generated/android/kotlin/com/margelo/nitro/nitrowebview/HybridNitroWebViewSpec.kt',
  'nitrogen/generated/ios/NitroWebview+autolinking.rb',
  'nitrogen/generated/ios/swift/HybridNitroWebViewSpec.swift',
  'MIGRATION.md',
  'website/content/public/screenshots/playground-ios.png',
  'website/content/public/screenshots/playground-android.png',
  'website/content/public/screenshots/bridge-ios.png',
  'website/content/public/screenshots/bridge-android.png',
]

function checkFiles(files) {
  const paths = new Set(files.map((file) => file.path))
  for (const path of requiredFiles)
    assert(paths.has(path), `Missing package file: ${path}`)
  for (const path of paths) {
    assert(
      !/(^|\/)(__tests__|type-tests|fixtures)(\/|$)|\.(test|type-test)\.|^android\/src\/(test|androidTest)\//.test(
        path
      ),
      `Test or fixture leaked into package: ${path}`
    )
  }
  assert(!paths.has('app.plugin.js'), 'Expo plugin is not implemented')
}

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`)
  return result.stdout
}

function checkPackage() {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const fixture = join(root, 'type-tests/public-api.tsx')
  assert(
    existsSync(fixture),
    'Missing package-root type fixture: type-tests/public-api.tsx'
  )
  const temporary = mkdtempSync(join(tmpdir(), 'nitro-webview-package-'))
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    // test:package builds declarations first; packing must not run build scripts again.
    const [packed] = JSON.parse(
      run(
        npm,
        ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary],
        root,
        true
      )
    )
    checkFiles(packed.files)
    const paths = new Set(packed.files.map((file) => file.path))
    for (const [field, extension] of [
      ['main', '.js'],
      ['module', '.js'],
      ['types', ''],
      ['react-native', '.ts'],
      ['source', '.ts'],
    ]) {
      assert(
        paths.has(manifest[field]) ||
          paths.has(`${manifest[field]}${extension}`),
        `Missing ${field} entry: ${manifest[field]}`
      )
    }
    assert.equal(
      packed.version,
      manifest.version,
      'Tarball version must match package.json'
    )
    const tarball = join(temporary, packed.filename)
    writeFileSync(
      join(temporary, 'package.json'),
      JSON.stringify({
        name: 'nitro-webview-consumer-check',
        version: '1.0.0',
        private: true,
      })
    )
    copyFileSync(fixture, join(temporary, 'public-api.tsx'))
    writeFileSync(
      join(temporary, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          jsx: 'react-jsx',
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'esnext',
          esModuleInterop: true,
          resolveJsonModule: true,
        },
        files: ['public-api.tsx'],
      })
    )
    run(
      npm,
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--save-exact',
        tarball,
        `react@${process.env.PACKAGE_REACT_VERSION ?? manifest.devDependencies.react}`,
        `react-native@${process.env.PACKAGE_RN_VERSION ?? manifest.devDependencies['react-native']}`,
        `react-native-nitro-modules@${process.env.PACKAGE_NITRO_VERSION ?? manifest.devDependencies['react-native-nitro-modules']}`,
        `typescript@${manifest.devDependencies.typescript}`,
        `@types/react@${manifest.devDependencies['@types/react']}`,
      ],
      temporary
    )
    const installed = join(temporary, 'node_modules/nitro-webview')
    assert(
      !readFileSync(join(temporary, 'public-api.tsx'), 'utf8').includes(
        'nitro-webview/'
      ),
      'Type fixture must use package-root imports'
    )
    assert.equal(
      JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version,
      manifest.version
    )
    run(
      process.execPath,
      [
        join(temporary, 'node_modules/typescript/bin/tsc'),
        '--project',
        join(temporary, 'tsconfig.json'),
      ],
      temporary
    )
    console.log(
      `Package check passed: ${packed.filename} (${packed.integrity})`
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv.includes('--self-test')) {
  const complete = requiredFiles.map((path) => ({ path }))
  checkFiles(complete)
  assert.throws(() => checkFiles(complete.slice(1)), /Missing package file/)
  assert.throws(
    () =>
      checkFiles([
        ...complete,
        { path: 'lib/specs/__tests__/api.type-test.d.ts' },
      ]),
    /leaked/
  )
  assert.throws(
    () => checkFiles([...complete, { path: 'android/src/test/Example.kt' }]),
    /leaked/
  )
  console.log('Package file checks passed their self-test')
} else {
  checkPackage()
}
