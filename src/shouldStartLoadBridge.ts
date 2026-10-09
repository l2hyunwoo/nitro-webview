import type { OnShouldStartLoadWithRequest } from './originWhitelist'
import type {
  ShouldStartLoadDecision,
  ShouldStartLoadRequest,
} from './specs/NitroWebView.nitro'

/** Send the settled JS result through a native resolver, never as a return value. */
export function createShouldStartLoadBridge(
  handler: OnShouldStartLoadWithRequest
) {
  return (
    request: ShouldStartLoadRequest,
    decision: ShouldStartLoadDecision
  ): void => {
    let result: boolean | Promise<boolean>
    try {
      result = handler(request)
    } catch {
      decision.resolve(undefined)
      return
    }
    Promise.resolve(result).then(
      (allow) =>
        decision.resolve(typeof allow === 'boolean' ? allow : undefined),
      () => decision.resolve(undefined)
    )
  }
}
