import { SIZES } from '../theme/tokens'
import type { Size } from '../theme/tokens'

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

const GLYPHS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~…·›—’“”→✓'
const REGULAR = [18,20,36,64,49,92,70,20,35,35,46,64,20,33,20,30,62,32,57,55,61,56,57,56,56,57,20,20,64,64,64,51,85,77,66,79,73,63,59,82,76,24,51,67,57,97,80,86,63,86,71,60,63,71,77,107,68,67,66,35,30,35,64,50,50,56,63,57,63,57,45,57,59,23,23,53,23,87,59,60,63,63,41,49,45,57,56,79,52,56,50,35,26,35,64,100,20,20,100,20,36,36,85,76]
const SEMIBOLD = [19,23,41,64,51,95,73,22,36,36,46,64,23,33,23,32,61,35,58,56,62,58,58,55,57,58,23,23,64,64,64,53,85,78,67,80,75,65,61,82,77,26,54,71,59,99,80,85,63,85,72,62,64,72,78,110,71,70,67,36,32,36,64,50,50,59,64,57,64,59,47,60,61,24,24,57,24,89,61,61,64,64,44,51,47,58,58,82,57,58,50,36,28,36,64,100,23,23,100,23,41,41,85,76]
const SAFE = 1.02
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u

const emsOf = (table: readonly number[]) => new Map([...GLYPHS].map((ch, index) => [ch, (table[index] ?? 60) / 100]))
const EMS = { regular: emsOf(REGULAR), semibold: emsOf(SEMIBOLD) }
const emOf = (ch: string, isBold: boolean) => EMS[isBold ? 'semibold' : 'regular'].get(ch) ?? (WIDE.test(ch) ? 1 : 0.6)

export const textWidth = (text: string, size: number, isMono = false, isBold = false) =>
  isMono ? [...text].length * 0.6 * size : [...text].reduce((width, ch) => width + emOf(ch, isBold), 0) * size * SAFE

export const widthOf = (text: string, isBold = false) => textWidth(text, 13, false, isBold)

export const spaces = (px: number) => {
  const room = Math.max(0, px)
  const figures = Math.floor(room / CH)
  return ' '.repeat(figures) + ' '.repeat(Math.floor((room - figures * CH) / THIN))
}

export function fit(text: string, px: number, isBold = false) {
  if (widthOf(text, isBold) <= px) return text
  let out = ''
  for (const ch of text) {
    if (widthOf(`${out}${ch}…`, isBold) > px) break
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
  return 2 + left + 15 + gap + widthOf(label, true) + right
}
