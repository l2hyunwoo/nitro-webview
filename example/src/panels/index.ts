import type { ComponentType } from 'react'
import { RegressionVerificationScreen } from '../RegressionVerificationScreen'
import { PostVerificationScreen } from '../PostVerificationScreen'
import { LoadEventsVerificationScreen } from '../LoadEventsVerificationScreen'
import { MediaVerificationScreen } from '../MediaVerificationScreen'
import { RendererRecoveryVerificationScreen } from '../RendererRecoveryVerificationScreen'

import { DialogsVerificationScreen } from '../DialogsVerificationScreen'
import { PermissionsVerificationScreen } from '../PermissionsVerificationScreen'
import { SettingsDemo } from './SettingsDemo'
import { CookiesDemo } from './CookiesDemo'
import { FileDownloadDemo } from './FileDownloadDemo'
import { FileUploadDemo } from './FileUploadDemo'
import { HeadersDemo } from './HeadersDemo'
import { JSBridgeDemo } from './JSBridgeDemo'
import { NavigationInterceptionDemo } from './NavigationInterceptionDemo'
import { UserAgentDemo } from './UserAgentDemo'

/**
 * Stable identifier for a demo panel. Doubles as the
 * `activePanelId` value held in App.tsx router state.
 */
export type PanelId =
  | 'settings-methods'
  | 'regression-verification'
  | 'renderer-recovery'
  | 'post-verification'
  | 'js-dialogs'
  | 'permissions'
  | 'load-events'
  | 'media-playback'
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
  description: string
  category: 'demo' | 'verify'
  platform?: 'Android' | 'iOS'
}

/**
 * Ordered list of demo panels. Order is the rendering
 * order in the home list, with regression verification first.
 */
export const PANELS: readonly PanelEntry[] = [
  {
    id: 'regression-verification',
    title: 'Regression verification',
    category: 'verify',
    description: 'Run the complete native suite with per-case results.',
    component: RegressionVerificationScreen,
  },
  {
    id: 'renderer-recovery',
    title: 'Android renderer recovery verification',
    category: 'verify',
    description: 'Terminate the renderer and inspect recovery callbacks.',
    platform: 'Android',
    component: RendererRecoveryVerificationScreen,
  },
  {
    id: 'post-verification',
    title: 'POST source verification',
    category: 'verify',
    description: 'Send a POST body and inspect the server response.',
    component: PostVerificationScreen,
  },
  {
    id: 'js-dialogs',
    title: 'JavaScript dialogs',
    category: 'verify',
    description: 'Exercise native alert, confirm and prompt dialogs.',
    component: DialogsVerificationScreen,
  },
  {
    id: 'permissions',
    title: 'Camera / microphone / location permissions',
    category: 'verify',
    description: 'Inspect camera, microphone and location decisions.',
    component: PermissionsVerificationScreen,
  },
  {
    id: 'load-events',
    title: 'Native load events verification',
    category: 'verify',
    description: 'Observe success, HTTP failures, progress and event order.',
    component: LoadEventsVerificationScreen,
  },
  {
    id: 'media-playback',
    title: 'Media playback verification',
    category: 'verify',
    description: 'Check inline playback and native fullscreen transitions.',
    component: MediaVerificationScreen,
  },
  {
    id: 'settings-methods',
    title: 'Settings & methods',
    category: 'demo',
    description: 'JavaScript, storage, scrolling, cache and native methods.',
    component: SettingsDemo,
  },
  {
    id: 'js-bridge',
    title: 'postMessage bridge / Evaluate JS',
    category: 'demo',
    description: 'Send messages in both directions and evaluate JavaScript.',
    component: JSBridgeDemo,
  },
  {
    id: 'headers',
    title: 'Headers demo',
    category: 'demo',
    description:
      'Inspect default headers and per-request overrides. Network required.',
    component: HeadersDemo,
  },
  {
    id: 'navigation-interception',
    title: 'Navigation interception demo',
    category: 'demo',
    description: 'Allow or block requests before navigation starts.',
    component: NavigationInterceptionDemo,
  },
  {
    id: 'user-agent',
    title: 'User-Agent demo',
    category: 'demo',
    description:
      'Switch the native User-Agent and inspect the response. Network required.',
    component: UserAgentDemo,
  },
  {
    id: 'cookies',
    title: 'Cookies demo',
    category: 'demo',
    description:
      'Set, read and clear the native cookie store. Network required.',
    component: CookiesDemo,
  },
  {
    id: 'file-upload',
    title: 'File upload demo',
    category: 'demo',
    description: 'Choose one or more files through the system picker.',
    component: FileUploadDemo,
  },
  {
    id: 'file-download',
    title: 'File download demo',
    category: 'demo',
    description: 'Inspect blob bytes and controlled HTTP downloads.',
    component: FileDownloadDemo,
  },
] as const

/**
 * Lookup helper used by the router in `App.tsx` to resolve an
 * `activePanelId` into the entry to mount. Returns `undefined`
 * when the id is not present (treated by the router as "go home").
 */
export function findPanelById(
  id: PanelId | null | undefined
): PanelEntry | undefined {
  if (id == null) return undefined
  return PANELS.find(entry => entry.id === id)
}
