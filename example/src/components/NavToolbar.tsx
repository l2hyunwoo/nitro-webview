/**
 * NavToolbar — shared primitive for the modularized example app.
 *
 * Migrated from the inline "Nav toolbar" row defined in the original
 * `example/App.tsx` (the View block at lines 222-238 that hosts the
 * Back / Forward / Reload trio of ToolbarButtons).
 *
 * Each per-panel screen mounts its own NitroWebView and therefore wants
 * its own back/forward/reload chrome. Rather than re-stamping the same
 * three buttons inside every panel, NavToolbar packages the row + the
 * canonical Back/Forward/Reload buttons as a single drop-in component.
 *
 * The visual identity (row padding, gap, button styling) is preserved
 * by sourcing every literal from `theme.ts` rather than inlining the
 * original hex/number values. The button visuals are reused by
 * composing the existing `ToolbarButton` primitive.
 *
 * Per the Seed contract, this primitive lives under
 * `example/src/components/` and owns its own `StyleSheet.create()`
 * call so panels can compose it without importing a panel-specific
 * style sheet.
 */

import React from 'react'
import { StyleSheet, View } from 'react-native'

import { spacing } from './theme'
import { ToolbarButton } from './ToolbarButton'

export interface NavToolbarProps {
  /** True when the underlying WebView has back history. */
  canGoBack: boolean
  /** True when the underlying WebView has forward history. */
  canGoForward: boolean
  /** True while the underlying WebView is currently loading. */
  loading: boolean
  /** Invoked when the user taps the "◀ Back" button. */
  onBack: () => void
  /** Invoked when the user taps the "Forward ▶" button. */
  onForward: () => void
  /** Invoked when the user taps the "⟳ Reload" button. */
  onReload: () => void
}

/**
 * A horizontal navigation toolbar with Back, Forward, and Reload
 * buttons that mirror a NitroWebView's navigation API. Each button is
 * disabled when the corresponding capability is unavailable
 * (e.g. Back is disabled when `canGoBack` is false).
 */
export function NavToolbar({
  canGoBack,
  canGoForward,
  loading,
  onBack,
  onForward,
  onReload,
}: NavToolbarProps) {
  return (
    <View style={styles.toolbar}>
      <ToolbarButton label="◀ Back" disabled={!canGoBack} onPress={onBack} />
      <ToolbarButton
        label="Forward ▶"
        disabled={!canGoForward}
        onPress={onForward}
      />
      <ToolbarButton label="⟳ Reload" disabled={loading} onPress={onReload} />
    </View>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.xxs,
    gap: spacing.md,
  },
})

export default NavToolbar
