import * as RNFS from '@dr.pogodin/react-native-fs'
import type { FileDownload } from 'nitro-webview'

/** Inspect returned blob bytes; only metadata-only HTTP events need a download. */
export async function inspectDownload(event: FileDownload) {
  const destination = `${
    RNFS.CachesDirectoryPath
  }/nitro-download-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  let path = destination
  let cleanup: string | undefined
  try {
    if (event.url.startsWith('file://')) {
      path = decodeURIComponent(event.url.slice('file://'.length))
      // Only the native-owned UUID directory may be removed recursively.
      cleanup =
        /\/nitro-webview-blob\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/i.test(
          path
        )
          ? path.slice(0, path.lastIndexOf('/'))
          : undefined
    } else if (event.url.startsWith('data:')) {
      const data = /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(event.url)
      if (!data)
        throw new Error(
          'Expected a base64 data URL from the Android blob reader'
        )
      cleanup = destination
      await RNFS.writeFile(destination, data[1], 'base64')
    } else if (/^https?:\/\//.test(event.url)) {
      cleanup = destination
      const result = await RNFS.downloadFile({
        fromUrl: event.url,
        toFile: destination,
        headers: event.userAgent
          ? { 'User-Agent': event.userAgent }
          : undefined,
      }).promise
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`HTTP ${result.statusCode}`)
      }
    } else {
      throw new Error(`Unsupported download URL: ${event.url.split(':')[0]}`)
    }
    const stat = await RNFS.stat(path)
    const preview = await RNFS.read(
      path,
      Math.min(Number(stat.size), 256),
      0,
      'utf8'
    )
    return `${event.fileName || 'download'} · ${
      stat.size
    } bytes verified\n${preview}\n${
      cleanup
        ? 'Temporary bytes removed.'
        : 'Source file retained (outside demo-owned storage).'
    }`
  } finally {
    if (cleanup && (await RNFS.exists(cleanup))) await RNFS.unlink(cleanup)
  }
}
