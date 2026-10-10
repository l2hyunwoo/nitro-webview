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
export function ToolbarButton({
  label,
  disabled,
  onPress,
}: ToolbarButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Text
        style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
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
    color: color.textTertiary,
  },
})

export default ToolbarButton
