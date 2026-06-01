/**
 * Panel registry — ordered list of the seven demo panels mounted by the
 * home-list router in `example/App.tsx`.
 *
 * Each entry pairs a stable `id` (used as React key + `active_panel_id`
 * value) with a human-readable `title` (rendered in the home list and as
 * the per-panel header) and a `component` reference (the panel screen
 * mounted full-screen when the row is tapped).
 *
 * The order here is the order the home list shows. It mirrors the
 * top-to-bottom order of the demo sections in the pre-refactor
 * `example/App.tsx`, with the postMessage bridge / Evaluate JS demo
 * placed first because it owned the global chrome WebView before the
 * split (so it is the most "default" panel to land in).
 *
 * Per the Seed contract:
 *   - This module is read by the home list and the active-panel
 *     dispatcher in `App.tsx`.
 *   - Adding a new demo panel requires only a new file under
 *     `./` and a new entry appended to `PANELS` below.
 *   - No panel is mounted from here — the router decides when to mount
 *     the component, so the WebView lifecycle (fresh mount on entry,
 *     unmount on Back) is owned by `App.tsx`, not this registry.
 */

import type { ComponentType } from 'react'

import { CookiesDemo } from './CookiesDemo'
import { FileDownloadDemo } from './FileDownloadDemo'
import { FileUploadDemo } from './FileUploadDemo'
import { HeadersDemo } from './HeadersDemo'
import { JSBridgeDemo } from './JSBridgeDemo'
import { NavigationInterceptionDemo } from './NavigationInterceptionDemo'
import { UserAgentDemo } from './UserAgentDemo'

/**
 * Stable identifier for a demo panel. Doubles as the
 * `active_panel_id` value held in App.tsx router state.
 */
export type PanelId =
  | 'js-bridge'
  | 'headers'
  | 'navigation-interception'
  | 'user-agent'
  | 'cookies'
  | 'file-upload'
  | 'file-download'

/**
 * A single entry in the home-list / router registry.
 */
export type PanelEntry = {
  /** Stable identifier; doubles as the React key in the home list. */
  id: PanelId
  /** Human-readable label shown in the home list and panel header. */
  title: string
  /** Panel screen mounted full-screen when the row is tapped. */
  component: ComponentType
}

/**
 * Ordered list of the seven demo panels. Order is the rendering
 * order in the home list and reflects the original App.tsx scroll
 * order, with the JS bridge (the old global-chrome WebView demo)
 * surfaced first.
 */
export const PANELS: readonly PanelEntry[] = [
  {
    id: 'js-bridge',
    title: 'postMessage bridge / Evaluate JS',
    component: JSBridgeDemo,
  },
  {
    id: 'headers',
    title: 'Headers demo',
    component: HeadersDemo,
  },
  {
    id: 'navigation-interception',
    title: 'Navigation interception demo',
    component: NavigationInterceptionDemo,
  },
  {
    id: 'user-agent',
    title: 'User-Agent demo',
    component: UserAgentDemo,
  },
  {
    id: 'cookies',
    title: 'Cookies demo',
    component: CookiesDemo,
  },
  {
    id: 'file-upload',
    title: 'File upload demo',
    component: FileUploadDemo,
  },
  {
    id: 'file-download',
    title: 'File download demo',
    component: FileDownloadDemo,
  },
] as const

/**
 * Lookup helper used by the router in `App.tsx` to resolve an
 * `active_panel_id` into the entry to mount. Returns `undefined`
 * when the id is not present (treated by the router as "go home").
 */
export function findPanelById(id: PanelId | null | undefined): PanelEntry | undefined {
  if (id == null) return undefined
  return PANELS.find((entry) => entry.id === id)
}
