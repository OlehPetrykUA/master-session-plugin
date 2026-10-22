import { LH, TILE_HEIGHT, bodyWidthOf, headerLabelsOf, statusWidthOf, textWidth, widthOf } from './layout'

export type SectionKey = 'section-header' | 'section-chips' | 'section-tiles' | 'section-expanded' | 'section-archived' | 'section-summary'

export type ChipSize = { label: string; count: number; hasMark: boolean; markWidth: number }

export type HeaderShape = { title: string; status: string; labels: readonly string[] }

export type SectionInput = {
  columns: number
  repos: readonly string[]
  header: HeaderShape
  chips: readonly ChipSize[] | null
  hasError: boolean
  body: 'tiles' | 'archived' | 'summary' | 'none'
  hasExpanded: boolean
}

export const chipWidthOf = (chip: ChipSize) => 2 + 12 + (chip.hasMark ? chip.markWidth + 6 : 0) + widthOf(chip.label) * 1.08 + 6 + widthOf(String(chip.count)) * 1.08 + 12

export const repoWidthOf = (name: string) => 7 + 12 + 5 + textWidth(name, 12, true) + 7

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

export function headerRowsOf(columns: number, repos: readonly string[], header: HeaderShape) {
  const { isStacked } = headerLabelsOf(columns, header.title, header.labels)
  const chips = repos.length ? [13 + 4 + textWidth('Repos', 12) + 2, ...repos.map(repoWidthOf)] : []
  const lines = linesOf([...chips, 0, statusWidthOf(header.status)], bodyWidthOf(columns), 5)
  return Math.ceil((52 + (isStacked ? 40 : 0) + lines * 26 + (lines - 1) * 5 + 8 + 1) / LH)
}

export function sectionTopsOf(input: SectionInput) {
  const room = bodyWidthOf(input.columns)
  const tops: Partial<Record<SectionKey, number>> = { 'section-header': 0 }
  let top = headerRowsOf(input.columns, input.repos, input.header) * LH
  if (input.chips) {
    tops['section-chips'] = top
    const lines = linesOf(input.chips.map(chipWidthOf), room, 6)
    top += 12 + lines * 36 + (lines - 1) * 6 + 4
  }
  if (input.hasError) top += 8 + 15
  const body = top + 12
  if (input.body === 'tiles') tops['section-tiles'] = body
  if (input.body === 'tiles' && input.hasExpanded) tops['section-expanded'] = body
  if (input.body === 'archived') tops['section-archived'] = body
  if (input.body === 'summary') tops['section-summary'] = body
  return tops
}

export function contentHeightOf(input: SectionInput, rows: number) {
  const tops = sectionTopsOf({ ...input, columns: input.columns - 1 })
  const top = input.body === 'tiles' ? tops['section-tiles'] : input.body === 'archived' ? tops['section-archived'] : undefined
  if (top === undefined || input.hasError || input.hasExpanded || rows < 1) return undefined
  const body = input.body === 'tiles' ? rows * TILE_HEIGHT + (rows - 1) * 10 : 2 + 8 + rows * 52 + (rows - 1)
  return top + body + 16
}

export const scrollRowOf = (key: SectionKey, top: number, headerRows: number) => (key === 'section-header' ? 0 : Math.max(0, Math.floor((top - headerRows * LH) / LH)))
