// Minimal dark-first design tokens. Mirrors the zinc/neutral palette the
// web app uses so the two surfaces feel related. Lift these into a shared
// package later if/when nativewind is added.

export const colors = {
  bg: '#0b0b0c',
  surface: '#161618',
  surfaceElevated: '#1f1f22',
  border: '#2a2a2e',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textSubtle: '#71717a',
  accent: '#fafafa',
  accentText: '#0b0b0c',
  danger: '#f87171',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;
