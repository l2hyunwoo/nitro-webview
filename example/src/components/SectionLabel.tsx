import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { color, fontSize, radii, spacing } from './theme'

export interface SectionLabelProps {
  /** Visible text rendered as the section heading. */
  text: string
}

/**
 * A small section heading consisting of a blue accent bar followed by
 * an uppercase label. Used to delimit feature areas inside a panel.
 */
export function SectionLabel({ text }: SectionLabelProps) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelAccent} />
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    gap: spacing.base,
  },
  sectionLabelAccent: {
    width: spacing.xs,
    height: spacing.xl3,
    backgroundColor: color.textAccent,
    borderRadius: radii.xxs,
  },
  sectionLabelText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: color.textPrimary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})

export default SectionLabel
