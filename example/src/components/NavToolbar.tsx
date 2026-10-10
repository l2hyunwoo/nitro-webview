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
