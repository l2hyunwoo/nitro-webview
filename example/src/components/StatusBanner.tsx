import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { color, fontFamily, fontSize, radii, spacing } from './theme'

export type StatusBannerStatus = 'error' | 'message' | 'eval'

export interface StatusBannerProps {
  /** Color palette to use. */
  status: StatusBannerStatus
  /** Headline rendered on the first row of the banner. */
  title: string
  /** Primary body text rendered on the second row. */
  body: string
  /** Optional italic footer line (e.g. an originating URL). */
  footer?: string
  /** Maximum body lines; 0 shows all text. Defaults to 2. */
  bodyNumberOfLines?: number
  /** Use the platform monospace font. Defaults to false. */
  monospaceBody?: boolean
}

export function StatusBanner({
  status,
  title,
  body,
  footer,
  bodyNumberOfLines = 2,
  monospaceBody = false,
}: StatusBannerProps) {
  const palette = PALETTES[status]
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: palette.title }]}>{title}</Text>
      <Text
        style={[
          styles.body,
          { color: palette.body },
          monospaceBody && styles.bodyMono,
        ]}
        numberOfLines={bodyNumberOfLines || undefined}
      >
        {body}
      </Text>
      {footer ? (
        <Text style={[styles.footer, { color: palette.body }]}>{footer}</Text>
      ) : null}
    </View>
  )
}

interface BannerPalette {
  background: string
  border: string
  title: string
  body: string
}

const PALETTES: Record<StatusBannerStatus, BannerPalette> = {
  error: {
    background: color.errorBackground,
    border: color.errorBorder,
    title: color.errorTitle,
    body: color.errorBody,
  },
  message: {
    background: color.messageBackground,
    border: color.messageBorder,
    title: color.messageTitle,
    body: color.messageBody,
  },
  eval: {
    background: color.evalBackground,
    border: color.evalBorder,
    title: color.evalTitle,
    body: color.evalBody,
  },
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  title: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  body: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  bodyMono: {
    fontFamily: fontFamily.mono,
  },
  footer: {
    fontSize: fontSize.xxs,
    marginTop: spacing.xxs,
    fontStyle: 'italic',
  },
})

export default StatusBanner
