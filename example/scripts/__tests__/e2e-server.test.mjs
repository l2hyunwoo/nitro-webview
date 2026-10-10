import { Buffer } from 'node:buffer'
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { createE2EServer, DOWNLOAD_TEXT } from '../../e2e-server.mjs'

test('harness uses explicit local device selectors and rejects invalid API levels', () => {
  const configUrl = new URL('../../rn-harness.config.mjs', import.meta.url).href
  const script = `import config from ${JSON.stringify(
    configUrl
  )}; console.log(JSON.stringify(config.runners.map(r => r.config.device)));`
  const env = {
    ...process.env,
    ANDROID_SERIAL: '',
    ANDROID_EMULATOR: 'local_avd',
    ANDROID_API: '35',
    SIM_DEVICE: 'Local iPhone',
    SIM_OS: '26.2',
  }
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { env, encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  const [apple, android] = JSON.parse(result.stdout)
  assert.equal(apple.name, 'Local iPhone')
  assert.equal(apple.systemVersion, '26.2')
  assert.equal(android.name, 'local_avd')
  assert.equal(android.avd.apiLevel, 35)
  const invalid = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { env: { ...env, ANDROID_API: 'bad' }, encoding: 'utf8' }
  )
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /ANDROID_API must be a positive integer/)
})

test('harness fixture serves success, 404, scroll, cache and exact download bytes', async () => {
  const server = createE2EServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    assert.equal(await (await fetch(`${base}/health`)).text(), 'ok')
    const page = await fetch(base)
    assert.equal(page.status, 200)
    assert.equal(page.headers.get('cache-control'), 'no-store')
    const html = await page.text()
    assert.match(html, /id="ready"/)
    assert.match(html, /post\('loaded'\)/)
    assert.match(html, /post\('echo:' \+ e.data\)/)
    assert.match(
      await (await fetch(`${base}/long`)).text(),
      /min-height:4000px/
    )
    assert.equal(
      (await fetch(`${base}/cache`)).headers.get('cache-control'),
      'public, max-age=3600'
    )
    assert.equal((await fetch(`${base}/notfound`)).status, 404)
    assert.equal((await fetch(`${base}/unknown`)).status, 404)
    const download = await fetch(`${base}/download`)
    assert.equal(
      download.headers.get('content-disposition'),
      'attachment; filename="nitro-e2e.txt"'
    )
    assert.equal(
      Number(download.headers.get('content-length')),
      Buffer.byteLength(DOWNLOAD_TEXT)
    )
    assert.equal(await download.text(), DOWNLOAD_TEXT)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('slow fixture delays headers and cancels its timer when loading stops', async () => {
  const server = createE2EServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const controller = new AbortController()
  try {
    const response = fetch(
      `http://127.0.0.1:${server.address().port}/slow?run=repeat`,
      {
        signal: controller.signal,
      }
    )
    const early = await Promise.race([
      response.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 100)),
    ])
    assert.equal(early, false)
    controller.abort()
    await assert.rejects(response, { name: 'AbortError' })
  } finally {
    controller.abort()
    await new Promise(resolve => server.close(resolve))
  }
})
