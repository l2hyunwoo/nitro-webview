/**
 * Header merge utility shared by JS-side reasoning about the
 * `defaultHeaders` + `UriSource.headers` contract.
 *
 * Merge semantics (mirrors the native implementations):
 *
 *   - Inputs are two optional `Record<string, string>` maps:
 *     `defaults` (from `NitroWebViewProps.defaultHeaders`) and
 *     `perRequest` (from `UriSource.headers`).
 *   - The output is the union of both maps.
 *   - On key conflict, the per-request entry WINS over the default.
 *   - Conflict detection is case-INSENSITIVE (Authorization vs authorization
 *     collide) — matching the iOS WKWebView `URLRequest` contract which
 *     treats HTTP header names as case-insensitive. The casing of the
 *     **per-request** key is the one that survives in the output.
 *   - Both inputs are treated as immutable; the function never mutates
 *     `defaults` or `perRequest`.
 *   - Either input may be `undefined`; the result is always a fresh
 *     `Record<string, string>` (possibly empty).
 *
 * Platform divergence note: the Android adapter currently performs an
 * exact-match (case-sensitive) merge because `WebView.loadUrl(url,
 * additionalHttpHeaders)` does not normalize header keys. This utility
 * encodes the **iOS** semantics, which is the stricter conflict rule and
 * the one consumers should design against to stay portable. See
 * `src/specs/NitroWebView.nitro.ts` `defaultHeaders` doc-comment.
 */
export function mergeHeaders(
  defaults: Record<string, string> | undefined,
  perRequest: Record<string, string> | undefined
): Record<string, string> {
  const d = defaults ?? {}
  const r = perRequest ?? {}
  const conflictingLower = new Set(Object.keys(r).map((k) => k.toLowerCase()))
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(d)) {
    if (!conflictingLower.has(k.toLowerCase())) {
      out[k] = v
    }
  }
  for (const [k, v] of Object.entries(r)) {
    out[k] = v
  }
  return out
}
