import { CH, LH, bodyWidthOf, faceWidth, textWidth, widthOf } from './layout'
import { rowsOf, shownDots } from './list'
import type { Block } from './list'

export type SectionKey = 'section-header' | 'section-summary' | 'section-chips' | 'section-list' | 'section-expanded' | 'section-archived'

export type ChipSize = { label: string; count: number; hasMark: boolean; markWidth: number }

export type GroupSize = { rows: number; extra: number; isArchived: boolean }

export type SectionInput = {
  columns: number
  repos: readonly string[]
  isNarrow: boolean
  notice: string
  status: string
  buttons: readonly string[]
  blockRows: number
  blockExtra: number
  chips: readonly ChipSize[]
  groups: readonly GroupSize[]
  hasMore: boolean
  isEmpty: boolean
  hasExpanded: boolean
}

export const ROW = 56
export const BLOCK = 1 + 8 + 16 + 24 + 16 + 8 + 1
export const NARROW_PX = 340

export const chipWidthOf = (chip: ChipSize) => 2 + 12 + (chip.hasMark ? chip.markWidth + 8 : 0) + widthOf(chip.label, { isBold: true }) + 8 + widthOf(String(chip.count), { isBold: true }) + 12

export const dotExtraOf = (block: Block | undefined, inner: number) =>
  (linesOf((block ? shownDots(block) : []).map(mark => 6 + 2 + textWidth(String(mark.count), 11, { isBold: true })), inner, 4) - 1) * 16

export const repoWidthOf = (name: string) => 8 + 12 + 4 + textWidth(name, 12, { isMono: true }) + 8

export function linesOf(widths: readonly number[], room: number, gap: number) {
  let lines = 1
  let x = 0
  for (const width of widths) {
    if (x > 0 && x + width > room) {
      lines += 1
      x = 0
    }
    x += width + gap
  }
  return lines
}

export function scrollMessage(to: string, asked: number | undefined, landed: number, columns: number) {
  const where =
    asked === undefined ? `: row ${landed}` : landed === asked ? ` (row ${landed})` : `: asked row ${asked}, landed on row ${landed}${landed < asked ? ', the end of the content' : ''}`
  return `Scrolled the pane to ${to}${where}. The pane is ${columns} columns wide.`
}

export const noticePxOf = (notice: string, columns: number) => (notice ? 12 + 16 + Math.max(1, Math.ceil(textWidth(notice, 12, { isBold: true }) / (bodyWidthOf(columns) - 24 - 16 - 8))) * 16 : 0)

type HeaderInput = Pick<SectionInput, 'columns' | 'repos' | 'isNarrow' | 'notice' | 'status' | 'buttons'>

export function statusRoomOf(input: HeaderInput) {
  const width = input.columns * CH - 16 - 8
  const room = input.isNarrow ? width : width - 8 * (input.buttons.length + 1) - input.buttons.reduce((sum, label) => sum + faceWidth(label, 'b32') + 1, 0)
  return room - 12 - 4
}

export const statusLinesOf = (input: HeaderInput) => Math.max(1, rowsOf(input.status, statusRoomOf(input), 12, 20).length)

export function headerPxOf(input: HeaderInput) {
  const lines = statusLinesOf(input)
  const header = input.isNarrow ? 12 + 20 + 2 + 16 * lines + 8 + 32 + 8 : Math.max(56, 20 + 2 + 16 * lines)
  const repoLines = input.repos.length ? linesOf([4 + 12 + 4 + textWidth('Repos', 12), ...input.repos.map(repoWidthOf)], bodyWidthOf(input.columns), 4) : 0
  const repos = repoLines ? repoLines * 24 + (repoLines - 1) * 4 + 12 : 0
  return header + repos + 1 + noticePxOf(input.notice, input.columns)
}

export const headerRowsOf = (input: HeaderInput) => Math.ceil(headerPxOf(input) / LH)

const groupPxOf = (group: GroupSize) => 32 + (group.rows ? 4 + group.rows * ROW + group.extra + (group.rows - 1) * 4 : 0)

export function sectionTopsOf(input: SectionInput) {
  const tops: Partial<Record<SectionKey, number>> = { 'section-header': 0 }
  let top = headerRowsOf(input) * LH
  tops['section-summary'] = top
  top += 12 + input.blockRows * BLOCK + (input.blockRows - 1) * 8 + input.blockExtra
  tops['section-chips'] = top
  const lines = linesOf(input.chips.map(chipWidthOf), bodyWidthOf(input.columns), 8)
  top += 12 + lines * 32 + (lines - 1) * 8
  tops['section-list'] = top
  input.hasExpanded && (tops['section-expanded'] = top)
  let group = top + 16
  for (const one of input.groups) {
    one.isArchived && (tops['section-archived'] = group)
    group += groupPxOf(one) + 16
  }
  return tops
}

export function contentHeightOf(input: SectionInput) {
  const top = sectionTopsOf({ ...input, columns: input.columns - 1 })['section-list']
  if (top === undefined || input.hasExpanded || input.isEmpty || !input.groups.length) return undefined
  const groups = input.groups.reduce((sum, group) => sum + groupPxOf(group), 0) + (input.groups.length - 1) * 16
  return top + 16 + groups + (input.hasMore ? 16 + 32 : 0) + 16
}

export const scrollRowOf = (key: SectionKey, top: number, headerRows: number) => (key === 'section-header' ? 0 : Math.max(0, Math.floor((top - headerRows * LH) / LH)))
