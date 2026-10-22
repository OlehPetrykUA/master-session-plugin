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

const charEm = (ch: string) => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Zmw@%]/.test(ch) ? 0.72 : 0.56)

export const textWidth = (text: string, size: number, isMono = false) => [...text].reduce((width, ch) => width + (isMono ? 0.6 : charEm(ch)) * size, 0)

export const widthOf = (text: string) => textWidth(text, 13)

export const spaces = (px: number) => {
  const room = Math.max(0, px)
  const figures = Math.floor(room / CH)
  return ' '.repeat(figures) + ' '.repeat(Math.floor((room - figures * CH) / THIN))
}

export function fit(text: string, px: number) {
  if (widthOf(text) <= px) return text
  let out = ''
  for (const ch of text) {
    if (widthOf(`${out}${ch}…`) > px) break
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
  return 2 + left + 15 + gap + widthOf(label) * 1.08 + right
}
