import { Platform } from 'react-native'

export const color = {
  appBackground: '#fafafa',
  headerBackground: '#ffffff',
  buttonBackground: '#ffffff',
  buttonBackgroundDisabled: '#f4f4f5',
  buttonBorder: '#d4d4d8',
  buttonBorderDisabled: '#e4e4e7',
  divider: '#e4e4e7',
  headerText: '#09090b',
  headerMuted: '#71717a',
  headerSecondary: '#52525b',
  textPrimary: '#18181b',
  textSecondary: '#52525b',
  textTertiary: '#71717a',
  textCookie: '#27272a',
  textAccent: '#18181b',
  errorBackground: '#fef2f2',
  errorBorder: '#fecaca',
  errorTitle: '#b91c1c',
  errorBody: '#7f1d1d',
  messageBackground: '#f0fdf4',
  messageBorder: '#bbf7d0',
  messageTitle: '#15803d',
  messageBody: '#14532d',
  evalBackground: '#f4f4f5',
  evalBorder: '#e4e4e7',
  evalTitle: '#18181b',
  evalBody: '#3f3f46',
  uploadPillBackground: '#f0fdf4',
  uploadPillBorder: '#bbf7d0',
  uploadPillText: '#166534',
  downloadHighlightBackground: '#f4f4f5',
} as const

export const spacing = {
  xxs: 2,
  xs: 3,
  sm: 4,
  md: 6,
  smPlus: 7,
  base: 8,
  lg: 9,
  xl: 12,
  xl2: 12,
  xl3: 16,
  xl4: 20,
  xl5: 24,
} as const
export const fontSize = { xxs: 12, xs: 12, sm: 14, md: 14, lg: 20 } as const
export const radii = { xxs: 2, xs: 4, sm: 6, md: 8, lg: 12, pill: 20 } as const
export const fontFamily = {
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
} as const

export type Color = keyof typeof color
export type Spacing = keyof typeof spacing
export type FontSize = keyof typeof fontSize
export type Radii = keyof typeof radii
export type FontFamily = keyof typeof fontFamily
