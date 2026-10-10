import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const website = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(website, '.vitepress/dist')
const content = resolve(website, 'content')
const base = '/nitro-webview/'

async function files(directory, suffix) {
  const result = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name)
    if (item.isDirectory()) result.push(...(await files(path, suffix)))
    else if (item.name.endsWith(suffix)) result.push(path)
  }
  return result
}

const sources = await files(content, '.md')
const english = sources
  .map((path) => relative(content, path))
  .filter((path) => !path.startsWith(`ko${sep}`))
assert.equal(
  sources.length,
  english.length * 2,
  'Every page must have both locales.'
)
for (const path of english)
  assert(
    sources.includes(resolve(content, 'ko', path)),
    `Missing Korean page: ${path}`
  )

const specPath = resolve(website, '../src/specs/NitroWebView.nitro.ts')
const spec = ts.createSourceFile(
  specPath,
  await readFile(specPath, 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
for (const [name, page] of [
  ['NitroWebViewProps', 'props'],
  ['NitroWebViewMethods', 'methods'],
]) {
  const declaration = spec.statements.find(
    (node) => ts.isInterfaceDeclaration(node) && node.name.text === name
  )
  assert(declaration, `${name} must exist`)
  for (const prefix of ['', 'ko/']) {
    const markdown = await readFile(
      resolve(content, `${prefix}reference/${page}.md`),
      'utf8'
    )
    for (const member of declaration.members) {
      const memberName = member.name?.getText(spec)
      assert(
        markdown.includes(`\`${memberName}${page === 'methods' ? '(' : '`'}`),
        `${prefix}${page} missing ${memberName}`
      )
    }
  }
}

const pages = new Map()
for (const path of await files(dist, '.html'))
  pages.set(path, await readFile(path, 'utf8'))
const ids = new Map(
  [...pages].map(([path, html]) => [
    path,
    new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])),
  ])
)
for (const path of english) {
  const builtPath = path.replace(/\.md$/, '.html')
  const headings = (html) =>
    [...html.matchAll(/<h[23] id="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(
    headings(pages.get(resolve(dist, 'ko', builtPath))),
    headings(pages.get(resolve(dist, builtPath))),
    `Language switching must preserve section anchors: ${path}`
  )
}
let links = 0
for (const [path, html] of pages) {
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = match[1].replaceAll('&amp;', '&')
    if (
      /^(?:https?:|mailto:|data:|javascript:)/.test(value) ||
      value.startsWith('//')
    )
      continue
    const url = new URL(
      value,
      `https://docs.invalid${base}${relative(dist, path)}`
    )
    assert(
      url.pathname.startsWith(base),
      `Asset/link escaped the Pages base: ${value} in ${path}`
    )
    let target = resolve(
      dist,
      decodeURIComponent(url.pathname.slice(base.length))
    )
    assert(
      target === dist || target.startsWith(`${dist}${sep}`),
      `Link escapes output: ${value}`
    )
    if (url.pathname.endsWith('/')) target = resolve(target, 'index.html')
    await readFile(target)
    if (url.hash && pages.has(target))
      assert(
        ids.get(target).has(decodeURIComponent(url.hash.slice(1))),
        `Missing anchor ${value} in ${path}`
      )
    links++
  }
}
assert(pages.size >= sources.length + 1, 'Missing built pages or 404 page.')
console.log(
  `${sources.length} bilingual pages, all native props/methods, and ${links} built links/assets passed.`
)
