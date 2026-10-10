/**
 * TypeScript oracle for the native header contract. Per-request headers
 * override defaults case-insensitively and preserve their own casing.
 * Duplicate logical keys within either input map are invalid.
 */
export function mergeHeaders(
  defaults: Record<string, string> | undefined,
  perRequest: Record<string, string> | undefined
): Record<string, string> {
  for (const headers of [defaults ?? {}, perRequest ?? {}]) {
    const seen = new Set<string>()
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase()
      if (seen.has(lower)) throw new Error(`Duplicate HTTP header: ${key}`)
      seen.add(lower)
    }
  }
  const request = perRequest ?? {}
  const overrides = new Set(
    Object.keys(request).map((key) => key.toLowerCase())
  )
  return Object.fromEntries([
    ...Object.entries(defaults ?? {}).filter(
      ([key]) => !overrides.has(key.toLowerCase())
    ),
    ...Object.entries(request),
  ])
}
