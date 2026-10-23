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

const GLYPHS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~…·›—’“”→'
const REGULAR = [212,237,408,640,521,993,684,237,404,404,489,640,237,360,237,335,604,371,581,557,612,563,569,533,561,569,237,237,640,640,640,543,873,737,656,762,742,640,596,795,742,273,540,686,578,939,787,816,611,816,683,589,578,726,737,1013,671,680,662,404,335,404,640,500,500,547,620,552,620,579,419,571,597,252,252,567,252,871,597,583,620,620,403,514,419,591,563,823,571,571,505,404,304,404,640,1000,237,237,1000,237,407,407,820]
const SEMIBOLD = [206,263,467,640,540,1012,724,263,411,411,490,640,263,360,263,354,611,404,597,575,632,580,582,553,577,582,263,263,640,640,640,562,877,754,664,770,752,645,603,801,750,285,561,717,582,960,790,817,627,817,693,614,582,727,754,1040,712,702,670,411,354,411,640,500,500,564,634,570,634,592,439,588,615,267,267,597,267,894,615,593,634,634,422,526,439,599,590,850,617,595,518,411,311,411,640,1000,263,263,1000,263,463,463,820]
const TABULAR = 0.64
const SAFE = 1.02
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u

export type Face = { isMono?: boolean; isBold?: boolean; isTabular?: boolean }

const emsOf = (table: readonly number[]) => new Map([...GLYPHS].map((ch, index) => [ch, (table[index] ?? 600) / 1000]))
const EMS = { regular: emsOf(REGULAR), semibold: emsOf(SEMIBOLD) }
const emOf = (ch: string, face: Face) => (face.isTabular && /\d/.test(ch) ? TABULAR : (EMS[face.isBold ? 'semibold' : 'regular'].get(ch) ?? (WIDE.test(ch) ? 1 : 0.6)))

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
