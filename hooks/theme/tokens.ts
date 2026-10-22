import type { SessionState } from '../../types'

export const C = {
  surface: 'rgba(255,255,255,0.051)',
  tileHover: 'rgba(255,202,160,0.094)',
  hoverBg: 'rgba(170,159,114,0.177)',
  surface2: 'rgba(189,182,136,0.151)',
  inset: 'rgba(160,151,85,0.106)',
  insetHover: 'rgba(142,127,67,0.133)',
  accentTint: 'rgba(222,136,108,0.160)',
  accentTint2: 'rgba(220,130,101,0.240)',
  border: 'rgba(125,125,124,0.224)',
  borderStrong: 'rgba(131,131,130,0.507)',
  accentRing: 'rgba(217,119,87,0.6)',
  pressBg: 'rgba(170,159,114,0.26)',
  amberTint: 'rgba(183,121,31,0.12)',
  greyTint: 'rgba(135,134,127,0.14)',
  redTint: 'rgba(211,119,114,0.139)',
  greenTint: 'rgba(114,158,107,0.164)',
  accent: 'claude',
  accentHover: '#D97757',
  clear: '#00000000',
  panel: 'composerSidebarBackground',
  text: 'text',
  muted: 'inactive',
  faint: 'subtle',
  red: 'error',
  green: 'success',
  amber: 'warning',
  grey: 'subtle',
} as const


export type Tone = 'text' | 'muted' | 'faint' | 'red' | 'amber' | 'green' | 'grey' | 'accentText' | 'onAccent'

export const CARD_BORDER = '#8080803d'

export const TERMINAL_COLOR: Record<SessionState, string> = { 'needs-you': 'error', waiting: 'warning', working: 'success', done: 'subtle' }

export type Kind = 'secondary' | 'ghost' | 'soft' | 'tint' | 'primary' | 'link'

export type Size = 's' | 'm' | 'ms' | 'mx' | 'ma' | 'l' | 'xl' | 'band' | 'bandTint' | 'bandStrong' | 'b32' | 'b40'

export const SIZES: Record<Size, readonly [number, number, number, number]> = {
  s: [32, 8, 10, 5],
  m: [36, 10, 12, 6],
  ms: [36, 8, 10, 5],
  mx: [36, 7, 9, 5],
  ma: [36, 10, 12, 5],
  l: [40, 12, 14, 6],
  xl: [44, 12, 12, 6],
  band: [36, 6, 8, 6],
  bandTint: [36, 10, 12, 6],
  bandStrong: [36, 12, 14, 6],
  b32: [32, 8, 12, 4],
  b40: [40, 12, 16, 8],
}

export const KINDS: Record<Kind, { bg?: string; border: string; hoverBg: string; hoverBorder: string; tone: Tone; isDim: boolean }> = {
  secondary: { bg: C.surface, border: C.border, hoverBg: C.hoverBg, hoverBorder: C.borderStrong, tone: 'text', isDim: false },
  ghost: { border: C.clear, hoverBg: C.hoverBg, hoverBorder: C.clear, tone: 'muted', isDim: true },
  soft: { bg: C.inset, border: C.clear, hoverBg: C.insetHover, hoverBorder: C.clear, tone: 'text', isDim: false },
  tint: { bg: C.accentTint, border: C.clear, hoverBg: C.accentTint2, hoverBorder: C.clear, tone: 'accentText', isDim: false },
  primary: { bg: C.accent, border: C.clear, hoverBg: C.accentHover, hoverBorder: C.clear, tone: 'onAccent', isDim: false },
  link: { border: C.clear, hoverBg: C.hoverBg, hoverBorder: C.clear, tone: 'accentText', isDim: false },
}

export const LABEL_COLOR: Record<Kind, { rest: string; hover: string }> = {
  secondary: { rest: C.text, hover: C.text },
  ghost: { rest: C.muted, hover: C.text },
  soft: { rest: C.text, hover: C.text },
  tint: { rest: C.accent, hover: C.accent },
  primary: { rest: 'inverseText', hover: 'inverseText' },
  link: { rest: C.accent, hover: C.accent },
}
