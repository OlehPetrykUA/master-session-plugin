import { expect, test } from 'claude-code/testing'

import { COLUMN, LH, down, faceWidth, liftOf, tall } from './layout'
import { BLOCK, ROW, chipWidthOf, contentHeightOf, headerPxOf, headerRowsOf, linesOf, noticePxOf, scrollMessage, scrollRowOf, sectionTopsOf, statusLinesOf, statusRoomOf } from './sections'
import type { SectionInput } from './sections'

const chips = ['All', 'Needs you', 'Waiting', 'Working', 'Done', 'Archived'].map((label, index) => ({ label, count: index, hasMark: true, markWidth: index % 5 ? 8 : 14 }))

const input: SectionInput = {
  columns: 102,
  repos: ['~/dotfiles', 'toolkit'],
  isNarrow: false,
  notice: '',
  status: 'updated just now',
  buttons: ['Ask', 'Refresh'],
  blockRows: 2,
  chips,
  groups: [
    { rows: 1, isArchived: false },
    { rows: 2, isArchived: false },
    { rows: 0, isArchived: true },
  ],
  hasMore: false,
  isEmpty: false,
  hasExpanded: false,
}

test('the pinned header is the 56 px header, the repos row and the rule; narrow adds the button row, offline the notice', () => {
  expect(headerPxOf(input)).toBe(56 + 24 + 12 + 1)
  expect(headerRowsOf(input)).toBe(Math.ceil((56 + 24 + 12 + 1) / LH))
  expect(headerPxOf({ ...input, isNarrow: true })).toBe(12 + 20 + 2 + 16 + 8 + 32 + 8 + 24 + 12 + 1)
  expect(headerPxOf({ ...input, notice: 'Can’t read sessions: board.json not found.' })).toBe(56 + 24 + 12 + 1 + 12 + 32)
  expect(noticePxOf('Can’t read sessions: board.json not found. Retrying in 30s.', 46)).toBe(12 + 16 + 2 * 16)
  expect(noticePxOf('', 46)).toBe(0)
  expect(headerPxOf({ ...input, repos: [] })).toBe(57)
})

test('section tops follow the drawn layout: summary, chips, then the list with the archived group last', () => {
  const tops = sectionTopsOf(input)
  const header = headerRowsOf(input) * LH
  expect(tops['section-header']).toBe(0)
  expect(tops['section-summary']).toBe(header)
  expect(tops['section-chips']).toBe(header + 12 + 2 * BLOCK + 8)
  expect(tops['section-list']).toBe(header + 12 + 2 * BLOCK + 8 + 12 + 32)
  expect(tops['section-archived']).toBe((tops['section-list'] ?? 0) + 16 + (32 + 4 + ROW) + 16 + (32 + 4 + 2 * ROW + 4) + 16)
  expect(tops['section-expanded']).toBeUndefined()
  expect(sectionTopsOf({ ...input, hasExpanded: true })['section-expanded']).toBe(tops['section-list'])
  expect(scrollRowOf('section-header', 0, headerRowsOf(input))).toBe(0)
  expect(scrollRowOf('section-chips', tops['section-chips'] ?? 0, headerRowsOf(input))).toBe(Math.floor((12 + 2 * BLOCK + 8) / LH))
  expect((sectionTopsOf({ ...input, columns: 30 })['section-list'] ?? 0) > (tops['section-list'] ?? 0)).toBe(true)
})

test('chips wrap onto as many lines as the room needs', () => {
  const widths = chips.map(chipWidthOf)
  expect(linesOf(widths, 10_000, 8)).toBe(1)
  expect(linesOf(widths, Math.max(...widths), 8)).toBe(widths.length)
})

test('the scroll answer names the row the window landed on, and says when the content ended first', () => {
  expect(scrollMessage('section-list', 4, 2, 57)).toBe('Scrolled the pane to section-list: asked row 4, landed on row 2, the end of the content. The pane is 57 columns wide.')
  expect(scrollMessage('section-list', 4, 4, 57)).toBe('Scrolled the pane to section-list (row 4). The pane is 57 columns wide.')
  expect(scrollMessage('end', undefined, 2, 57)).toBe('Scrolled the pane to end: row 2. The pane is 57 columns wide.')
})

test('the header lift is one tree row per scroll row: the scroll cell is the tree row, so the pin lands exactly at any offset', () => {
  for (const offset of [0, 1, 9, 83, 400]) {
    expect(down(liftOf(offset))).toBe(offset * 2)
    expect(tall(liftOf(offset))).toBe(offset)
  }
})

test('content height is known only where every row has a fixed height: closed details, no empty box', () => {
  const top = sectionTopsOf({ ...input, columns: 101 })['section-list'] ?? 0
  expect(contentHeightOf(input)).toBe(top + 16 + (32 + 4 + ROW) + (32 + 4 + 2 * ROW + 4) + 32 + 2 * 16 + 16)
  expect(contentHeightOf({ ...input, hasMore: true })).toBe((contentHeightOf(input) ?? 0) + 16 + 32)
  expect(contentHeightOf({ ...input, hasExpanded: true })).toBeUndefined()
  expect(contentHeightOf({ ...input, isEmpty: true })).toBeUndefined()
  expect(contentHeightOf({ ...input, groups: [] })).toBeUndefined()
})

test('a header status that wraps adds its extra lines to the header and moves every section below it', () => {
  const status = 'Asked the validator for a board update at 10:58 · it answers on its next tick and the pane refreshes by itself'
  const wide = { ...input, columns: 46, status }
  const lines = statusLinesOf(wide)
  expect(lines).toBeGreaterThan(2)
  expect(statusLinesOf({ ...wide, status: 'updated just now' })).toBe(1)
  expect(headerPxOf(wide) - headerPxOf({ ...wide, status: 'updated just now' })).toBe(20 + 2 + 16 * lines - 56)
  const narrow = { ...wide, isNarrow: true }
  expect(headerPxOf(narrow) - headerPxOf({ ...narrow, status: 'updated just now' })).toBe(16 * (statusLinesOf(narrow) - 1))
  expect((sectionTopsOf(wide)['section-summary'] ?? 0) - (sectionTopsOf({ ...wide, status: 'updated just now' })['section-summary'] ?? 0)).toBe((headerRowsOf(wide) - headerRowsOf({ ...wide, status: 'updated just now' })) * LH)
  expect(headerRowsOf(wide)).toBeGreaterThan(headerRowsOf({ ...wide, status: 'updated just now' }))
})

test('the header status room leaves the buttons their drawn width: each face plus 1 for the 16 px icon, and the gaps', () => {
  const px = (value: number) => Math.round(value * 100) / 100
  expect(px(statusRoomOf({ ...input, columns: 46 }))).toBe(px(46 * COLUMN - 16 - 8 - 8 * 3 - (faceWidth('Ask', 'b32') + 1) - (faceWidth('Refresh', 'b32') + 1) - 12 - 4))
  expect(px(statusRoomOf({ ...input, columns: 46, isNarrow: true }))).toBe(px(46 * COLUMN - 16 - 8 - 12 - 4))
})
