import { SIZES } from '../theme/tokens'
import type { Size } from '../theme/tokens'
import { REGULAR, RUNS, SEMIBOLD } from './glyphs'

export const CH = 8.3
export const LH = 19

export const liftOf = (offset: number) => offset * LH
export const COLUMN = 8.3
export const PAD = 4

const THIN = 13 / 5

const cells = (value: number) => Math.round(value * 100) / 100

export const across = (px: number) => cells(px / CH)
export const down = (px: number) => cells(px / (LH / 2))
export const tall = (px: number) => cells(px / LH)

export const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const TABULAR = 0.64
const SAFE = 1.02
const WIDE_EM = 1.02
const EMOJI_EM = 1.25
const MISSING_EM = 1.1
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u
const EMOJI = /\p{Extended_Pictographic}/u
const CODES = RUNS.flatMap(([first, count]) => Array.from({ length: count }, (_, index) => first + index))

export type Face = { isMono?: boolean; isBold?: boolean; isTabular?: boolean }

const emsOf = (table: readonly number[]) => new Map(CODES.map((code, index) => [code, (table[index] ?? MISSING_EM * 1000) / 1000]))
const EMS = { regular: emsOf(REGULAR), semibold: emsOf(SEMIBOLD) }
const emOf = (ch: string, face: Face) =>
  face.isTabular && /\d/.test(ch) ? TABULAR : (EMS[face.isBold ? 'semibold' : 'regular'].get(ch.codePointAt(0) ?? 0) ?? (EMOJI.test(ch) ? EMOJI_EM : WIDE.test(ch) ? WIDE_EM : MISSING_EM))

export const textWidth = (text: string, size: number, face: Face = {}) =>
  face.isMono ? [...text].length * 0.6 * size : [...text].reduce((width, ch) => width + emOf(ch, face), 0) * size * SAFE

export const widthOf = (text: string, face: Face = {}) => textWidth(text, 13, face)

export const spaces = (px: number) => {
  const room = Math.max(0, px)
  const figures = Math.floor(room / CH)
  return ' '.repeat(figures) + ' '.repeat(Math.floor((room - figures * CH) / THIN))
}

export function fit(text: string, px: number, face: Face = {}) {
  if (widthOf(text, face) <= px) return text
  let out = ''
  for (const ch of text) {
    if (widthOf(`${out}${ch}…`, face) > px) break
    out += ch
  }
  return `${out}…`
}

export const fill = (text: string, px: number) => {
  const shown = fit(text, px)
  return shown + spaces((px - widthOf(shown)) * 0.8 - CH)
}

export const bodyWidthOf = (columns: number) => columns * COLUMN - 32

export function faceWidth(label: string, size: Size = 's') {
  const [, left, right, gap] = SIZES[size]
  return 2 + left + 15 + gap + widthOf(label, { isBold: true, isTabular: true }) + right
}
