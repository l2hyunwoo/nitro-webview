/**
 * ToolbarButton — shared primitive for the modularized example app.
 *
 * Migrated verbatim from the inline `ToolbarButton` defined at the
 * bottom of the original `example/App.tsx`. The visual identity
 * (background, border, label color, padding, font size/weight) is
 * preserved by sourcing every literal from `theme.ts` rather than
 * inlining the original hex/number values.
 *
 * Per the Seed contract, this primitive lives under
 * `example/src/components/` and owns its own `StyleSheet.create()`
 * call so panels can compose it without importing a panel-specific
 * style sheet.
 */

import React from 'react'
import { StyleSheet, Text, TouchableOpacity } from 'react-native'

import { color, fontSize, radii, spacing } from './theme'

export interface ToolbarButtonProps {
  /** Visible text on the button. */
  label: string
  /** When true, the button is non-interactive and rendered in the disabled style. */
  disabled?: boolean
  /** Tap handler. Not invoked while `disabled` is true. */
  onPress: () => void
}

/**
 * A pill-style toolbar button. Stretches to fill its row (`flex: 1`)
 * and toggles to a muted style when `disabled` is set.
 */
export function ToolbarButton({ label, disabled, onPress }: ToolbarButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    paddingVertical: spacing.smPlus,
    backgroundColor: color.buttonBackground,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.buttonBorder,
  },
  buttonDisabled: {
    backgroundColor: color.buttonBackgroundDisabled,
    borderColor: color.buttonBorderDisabled,
  },
  buttonLabel: {
    fontSize: fontSize.sm,
    color: color.textAccent,
    fontWeight: '600',
  },
  buttonLabelDisabled: {
    color: color.textMutedOnDark,
  },
})

export default ToolbarButton
