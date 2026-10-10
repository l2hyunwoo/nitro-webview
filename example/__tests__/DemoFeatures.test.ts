import * as RNFS from '@dr.pogodin/react-native-fs'
import { BRIDGE_PAYLOAD, BRIDGE_SOURCE } from '../src/panels/demoFixtures'
import { inspectDownload } from '../src/panels/downloadResult'

const { runInNewContext } = require('node:vm')

jest.mock('@dr.pogodin/react-native-fs', () => ({
  CachesDirectoryPath: '/app/cache',
  writeFile: jest.fn(),
  downloadFile: jest.fn(),
  exists: jest.fn(),
  stat: jest.fn(),
  read: jest.fn(),
  unlink: jest.fn(),
}))

beforeEach(() => {
  jest.resetAllMocks()
  jest
    .mocked(RNFS.stat)
    .mockResolvedValue({ size: 8 } as Awaited<ReturnType<typeof RNFS.stat>>)
  jest.mocked(RNFS.read).mockResolvedValue('fixture\n')
  jest.mocked(RNFS.exists).mockResolvedValue(true)
})

test.each(['window', 'document'])(
  'bridge echoes native payload verbatim on %s',
  target => {
    const listeners: Record<string, (event: { data: string }) => void> = {}
    const postMessage = jest.fn()
    const pageWindow = {
      nitroEarly: 'installed',
      ReactNativeWebView: { postMessage },
      addEventListener: (
        _: string,
        listener: (event: { data: string }) => void
      ) => {
        listeners.window = listener
      },
    }
    const received = { textContent: '' }
    const pageDocument = {
      getElementById: () => received,
      addEventListener: (
        _: string,
        listener: (event: { data: string }) => void
      ) => {
        listeners.document = listener
      },
    }
    const html = 'html' in BRIDGE_SOURCE ? BRIDGE_SOURCE.html : ''
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      runInNewContext(script[1], {
        window: pageWindow,
        document: pageDocument,
      })
    }
    listeners[target]({ data: BRIDGE_PAYLOAD })
    expect(received.textContent).toBe(BRIDGE_PAYLOAD)
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      type: 'echo',
      data: BRIDGE_PAYLOAD,
    })
  }
)

test('iOS blob consumes the existing file and cleans its owned directory without another download', async () => {
  const directory =
    '/tmp/nitro-webview-blob/12345678-1234-1234-1234-123456789abc'
  const result = await inspectDownload({
    url: `file://${directory}/hello%20world.txt`,
    fileName: 'hello world.txt',
  })
  expect(RNFS.downloadFile).not.toHaveBeenCalled()
  expect(RNFS.writeFile).not.toHaveBeenCalled()
  expect(RNFS.stat).toHaveBeenCalledWith(`${directory}/hello world.txt`)
  expect(RNFS.unlink).toHaveBeenCalledWith(directory)
  expect(result).toContain('8 bytes verified')
  expect(result).toContain('fixture\n')
})

test('Android blob decodes base64 into app cache without requesting its URL', async () => {
  await inspectDownload({ url: 'data:text/plain;base64,Zml4dHVyZQo=' })
  expect(RNFS.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(/^\/app\/cache\/nitro-download-/),
    'Zml4dHVyZQo=',
    'base64'
  )
  expect(RNFS.downloadFile).not.toHaveBeenCalled()
  expect(RNFS.unlink).toHaveBeenCalledWith(
    expect.stringMatching(/^\/app\/cache\/nitro-download-/)
  )
})

test('HTTP metadata downloads exactly once into app-private cache', async () => {
  jest.mocked(RNFS.downloadFile).mockReturnValue({
    promise: Promise.resolve({ statusCode: 200, bytesWritten: 8, jobId: 1 }),
  } as ReturnType<typeof RNFS.downloadFile>)
  await inspectDownload({
    url: 'http://localhost:8099/download',
    userAgent: 'fixture-agent',
  })
  expect(RNFS.downloadFile).toHaveBeenCalledTimes(1)
  expect(RNFS.downloadFile).toHaveBeenCalledWith({
    fromUrl: 'http://localhost:8099/download',
    toFile: expect.stringMatching(/^\/app\/cache\//),
    headers: { 'User-Agent': 'fixture-agent' },
  })
})

test('HTTP failure is not reported as downloaded bytes and removes the partial file', async () => {
  jest.mocked(RNFS.downloadFile).mockReturnValue({
    promise: Promise.resolve({ statusCode: 404, bytesWritten: 8, jobId: 1 }),
  } as ReturnType<typeof RNFS.downloadFile>)
  await expect(
    inspectDownload({ url: 'http://localhost:8099/notfound' })
  ).rejects.toThrow('HTTP 404')
  expect(RNFS.stat).not.toHaveBeenCalled()
  expect(RNFS.unlink).toHaveBeenCalledTimes(1)
})

test('inspection failure still removes a handed-off iOS temporary file', async () => {
  jest.mocked(RNFS.read).mockRejectedValue(new Error('cannot read'))
  await expect(
    inspectDownload({
      url: 'file:///tmp/nitro-webview-blob/12345678-1234-1234-1234-123456789abc/file.txt',
    })
  ).rejects.toThrow('cannot read')
  expect(RNFS.unlink).toHaveBeenCalledWith(
    '/tmp/nitro-webview-blob/12345678-1234-1234-1234-123456789abc'
  )
})

test.each(['blob:unresolved', 'data:text/plain,not-base64'])(
  'unsupported or unresolved URL %s does not trigger a refetch',
  async url => {
    await expect(inspectDownload({ url })).rejects.toThrow()
    expect(RNFS.downloadFile).not.toHaveBeenCalled()
    expect(RNFS.stat).not.toHaveBeenCalled()
  }
)

test('failed Android cache write removes any partial bytes', async () => {
  jest.mocked(RNFS.writeFile).mockRejectedValue(new Error('disk full'))
  await expect(
    inspectDownload({ url: 'data:text/plain;base64,Zml4dHVyZQo=' })
  ).rejects.toThrow('disk full')
  expect(RNFS.unlink).toHaveBeenCalledWith(
    expect.stringMatching(/^\/app\/cache\/nitro-download-/)
  )
  expect(RNFS.stat).not.toHaveBeenCalled()
})

test('unowned local file is inspected without deleting its bytes', async () => {
  const result = await inspectDownload({
    url: 'file:///app/Documents/user-file.txt',
  })
  expect(RNFS.stat).toHaveBeenCalledWith('/app/Documents/user-file.txt')
  expect(RNFS.read).toHaveBeenCalledWith(
    '/app/Documents/user-file.txt',
    8,
    0,
    'utf8'
  )
  expect(RNFS.unlink).not.toHaveBeenCalled()
  expect(result).toContain('Source file retained')
})
