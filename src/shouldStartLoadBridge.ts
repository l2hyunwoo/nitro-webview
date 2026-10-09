import type { OnShouldStartLoadWithRequest } from './originWhitelist'
import type { ShouldStartLoadRequest } from './specs/NitroWebView.nitro'

/** Send the settled JS result through a native resolver, never as a return value. */
export function createShouldStartLoadBridge(
  handler: OnShouldStartLoadWithRequest
) {
  return (
    request: ShouldStartLoadRequest,
    decide: ((allow: boolean | undefined) => void) | undefined
  ): void => {
    if (decide === undefined) return
    let result: boolean | Promise<boolean>
    try {
      result = handler(request)
    } catch {
      decide(undefined)
      return
    }
    Promise.resolve(result).then(
      (allow) => decide(typeof allow === 'boolean' ? allow : undefined),
      () => decide(undefined)
    )
  }
}
